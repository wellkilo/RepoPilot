# RepoPilot External Methods

本文档记录 RepoPilot 使用的真实 SDK、HTTP Method、鉴权和错误处理。

## AgentTeams v1.2.2

### 声明式资源

API：

```yaml
apiVersion: agentteams.io/v1beta1
kind: Worker | Team
```

Worker 关键字段：

- `spec.model`
- `spec.runtime`
- `spec.image`
- `spec.identity`
- `spec.soul`
- `spec.agents`
- `spec.skills`
- `spec.mcpServers`
- `spec.resources`

Team 关键字段：

- `spec.workerMembers`
- `spec.heartbeatEvery`
- `spec.peerMentions`

RepoPilot 使用 1 个 Team Leader 和 5 个 Worker。Issue / CI 维护 Run 由 Leader
编排 Locator、Fixer、Verifier、Archivist；PR 审查 Run 直接交给只读 Reviewer。
清单位于 `deploy/agentteams/repopilot-team.yaml`。

### Matrix Task Injection

#### 登录

```http
POST /_matrix/client/v3/login
Content-Type: application/json

{
  "type": "m.login.password",
  "identifier": {
    "type": "m.id.user",
    "user": "admin"
  },
  "password": "<runtime secret>"
}
```

#### 查找已加入 Room

```http
GET /_matrix/client/v3/joined_rooms
Authorization: Bearer <access-token>
```

#### 查询成员

```http
GET /_matrix/client/v3/rooms/{roomId}/members
Authorization: Bearer <access-token>
```

#### 创建 Manager DM

```http
POST /_matrix/client/v3/createRoom
Authorization: Bearer <access-token>

{
  "is_direct": true,
  "invite": ["@manager:<AGENTTEAMS_MATRIX_DOMAIN>"],
  "preset": "trusted_private_chat"
}
```

#### 发送任务

```http
PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{transactionId}
Authorization: Bearer <access-token>

{
  "msgtype": "m.text",
  "body": "<RepoPilot task contract>"
}
```

`AGENTTEAMS_MATRIX_URL` 是 HTTP 入口，`AGENTTEAMS_MATRIX_DOMAIN` 是 Matrix User ID 域；二者不可假设相同。

## GitHub REST API

API Version：`2022-11-28`

通用 Headers：

```text
Accept: application/vnd.github+json
Authorization: Bearer <token>
X-GitHub-Api-Version: 2022-11-28
User-Agent: RepoPilot/0.1
```

| 用途                 | Method                                                     |
| -------------------- | ---------------------------------------------------------- |
| 读取 Issue           | `GET /repos/{owner}/{repo}/issues/{issue_number}`          |
| 读取 Workflow Run    | `GET /repos/{owner}/{repo}/actions/runs/{run_id}`          |
| 创建 Pull Request    | `POST /repos/{owner}/{repo}/pulls`                         |
| 读取 PR 元数据       | `GET /repos/{owner}/{repo}/pulls/{pull_number}`            |
| 读取 PR 变更文件     | `GET /repos/{owner}/{repo}/pulls/{pull_number}/files`      |
| 读取 Combined Status | `GET /repos/{owner}/{repo}/commits/{sha}/status`           |
| 读取 Check Runs      | `GET /repos/{owner}/{repo}/commits/{sha}/check-runs`       |
| 列出 PR 普通评论     | `GET /repos/{owner}/{repo}/issues/{pull_number}/comments`  |
| 创建 PR 普通评论     | `POST /repos/{owner}/{repo}/issues/{pull_number}/comments` |
| 更新 PR 普通评论     | `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}` |
| 合并 Pull Request    | `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`      |

错误处理：

- 非 2xx 抛出包含 status、message 和 documentation URL 的错误。
- 无 token 时真实调用直接失败，不使用 Mock。
- 所有仓库操作都受 `GITHUB_ALLOWED_REPOSITORIES` 限制。

## GitHub Webhook

签名：

```text
HMAC-SHA256(secret, raw-request-body)
```

比较使用 `timingSafeEqual`。不得对重新序列化后的 JSON 计算签名。

幂等：

```sql
SELECT pg_advisory_xact_lock(hashtext(delivery_id));
```

随后在同一事务内查询/创建 Run，数据库另有 `delivery_id UNIQUE` 兜底。

## MCP TypeScript SDK

Package：

```text
@modelcontextprotocol/sdk 1.30.x
```

Server：

```ts
new McpServer({ name: "repopilot", version: "0.1.0" });
```

Transport：

```ts
new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
  enableJsonResponse: true
});
```

工具使用 Zod v4 `inputSchema`。Fastify route 通过 `reply.hijack()` 将原生 Node request/response 交给 MCP transport。

## PostgreSQL / pgvector

Package：`postgres`

核心事务：

- 状态更新：`SELECT ... FOR UPDATE`
- evidence append：锁定 Run，读取前序 hash，插入下一条记录
- webhook 幂等：transaction advisory lock
- 审批消费：条件 `UPDATE ... consumed_at IS NULL RETURNING *`

Evidence Hash：

```text
payloadHash = SHA256(canonical-json(payload))
chainHash = SHA256(canonical-json({
  runId,
  stepId,
  evidenceType,
  payloadHash,
  previousHash,
  createdAt
}))
```

Evidence 回放严格按数据库 `BIGSERIAL evidence.id` 数值升序。查询中必须限定底层列
`stored_evidence.id`，不能按 `id::text` 输出别名排序，否则链跨过 `9 -> 10` 时会被
字典序错误重排并产生假阴性的完整性告警。

数据库触发器拒绝 evidence `UPDATE` 和 `DELETE`。

## OpenTelemetry

Packages：

- `@opentelemetry/sdk-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/api`

配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时输出到：

```text
<endpoint>/v1/traces
<endpoint>/v1/metrics
```

未配置时设置 `OTEL_TRACES_EXPORTER=none`，不发起网络调用。

RepoPilot 业务语义：

- `repopilot.run.create_and_dispatch`：输入解析、GitHub 上下文读取与 Matrix 派发；
- `mcp.tool.<tool-name>`：每个 MCP 工具调用，包含成功、失败和耗时；
- `agent.skill.<skill-name>`：根据持久化 Step 起止时间生成 Agent Skill Span；
- `repopilot.run`：从 Run 创建到成功、失败或取消的端到端 Span。

核心属性：

```text
repopilot.run_id
repopilot.step_id
repopilot.agent.name
repopilot.skill.name
repopilot.repository
repopilot.outcome
gen_ai.operation.name
gen_ai.tool.name
```

核心 Metrics：

```text
repopilot.operations
repopilot.operation.duration
repopilot.skill.executions
repopilot.skill.duration
repopilot.runs.completed
repopilot.run.duration
```

NodeSDK 自带 OTLP Metrics exporter；配置 endpoint 时通过环境契约启用
`OTEL_METRICS_EXPORTER=otlp`。

## Proof Bundle Evaluator

`GET /api/v1/runs/{runId}/proof` 将 Run、Step、Approval 和完整 Evidence 链封装为
`schemaVersion=1.0` 的 Proof Bundle。`packages/contracts/src/proof.ts` 使用纯函数执行
确定性评测，CLI 与服务端共享同一实现：

```bash
pnpm build
pnpm evaluate artifacts/proof-bundle.json artifacts/evaluation-report.json
```

评测器不调用模型，不依赖外部 API，不对补丁语义正确性做越权推断。

## Pull Request Proof Publication

`repopilot_publish_proof_comment` 将 Proof Bundle 的脱敏摘要实际附着到 Pull Request。
调用链为：

```text
AgentTeams Archivist
  -> RepoPilot MCP
  -> load Run / Step / Approval / Evidence
  -> verify SHA-256 chain
  -> deterministic Proof evaluation
  -> render redacted Markdown
  -> GitHub Issue Comments REST API
```

评论以 `runId` 派生的 HTML marker 定位；已存在时使用 `PATCH` 更新，否则使用 `POST`
创建。评论不包含原始 Evidence payload、工具输出或仓库私有内容，只发布完整性得分、
Agent/Skill 结果、证据数量和链根，并附带等价的机器可解析 JSON 摘要。Run 未进入
终态、仓库不匹配或目标 PR 未记录在该 Run 的证据中时拒绝发布。

## Pull Request Review Comment

`pull_request.opened | reopened | synchronize | ready_for_review` 经 HMAC 验签后创建
`github_pull_request` Run。Run 在创建时固化 `repository + pullNumber + headSha`，并
读取 PR 元数据和变更文件摘要后，通过 Matrix 派发给 `repopilot-reviewer`。

Reviewer 的真实调用链为：

```text
GitHub pull_request webhook
  -> RepoPilot Run
  -> AgentTeams Manager
  -> repopilot-reviewer / pull-request-review
  -> github_get_pull_request
  -> github_list_pull_request_files (paged)
  -> github_get_pull_request_checks
  -> repopilot_publish_review_comment
  -> GitHub Issue Comments REST API
```

PR 元数据、文件分页、Checks 和最终发布都会校验 GitHub 当前 head SHA 与 Run
head SHA；发布时再同时校验工具输入 head SHA。任一不一致都拒绝继续，避免旧 Run
混入新 revision 的证据或覆盖新 revision 的审查。评论使用固定
`<!-- repopilot-review -->` marker，通过分页列出已有评论后选择 `POST` 或 `PATCH`，
从而保证同一 PR 始终只有一条 RepoPilot Review Comment。

评论 Schema 限制 finding 数量和单项长度，控制 GitHub 评论体积；输出只包含 verdict、
summary、结构化 finding 和审查 revision。该工具只写普通 PR conversation comment，
不调用 GitHub Reviews 的 approve / request changes 接口，也不具备代码修改或合并能力。
成功发布会追加 `review_publication` Evidence；`pull-request-review` Step 只有存在与
Run 仓库、PR、head SHA 完全一致的发布证据时才能进入 `succeeded`。

## Alibaba Cloud Official Skill

Skill：

```text
alibabacloud-agentloop-experience
```

Source：

```text
aliyun/alibabacloud-aiops-skills
skills/aiml/agentloop/alibabacloud-agentloop-experience
```

它读取 `recall.env`，使用 `scripts/search_context.js` 调用 AgentLoop Recall。未配置或 `AGENTLOOP_ENABLE_RECALL != true` 时返回空结果，RepoPilot 降级到本地 Runbook。

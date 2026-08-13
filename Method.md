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

RepoPilot 使用 1 个 Team Leader 和 4 个 Worker。清单位于 `deploy/agentteams/repopilot-team.yaml`。

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

| 用途                 | Method                                                |
| -------------------- | ----------------------------------------------------- |
| 读取 Issue           | `GET /repos/{owner}/{repo}/issues/{issue_number}`     |
| 读取 Workflow Run    | `GET /repos/{owner}/{repo}/actions/runs/{run_id}`     |
| 创建 Pull Request    | `POST /repos/{owner}/{repo}/pulls`                    |
| 读取 PR Head SHA     | `GET /repos/{owner}/{repo}/pulls/{pull_number}`       |
| 读取 Combined Status | `GET /repos/{owner}/{repo}/commits/{sha}/status`      |
| 读取 Check Runs      | `GET /repos/{owner}/{repo}/commits/{sha}/check-runs`  |
| 合并 Pull Request    | `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` |

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

数据库触发器拒绝 evidence `UPDATE` 和 `DELETE`。

## OpenTelemetry

Packages：

- `@opentelemetry/sdk-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/api`

配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时输出到：

```text
<endpoint>/v1/traces
```

未配置时设置 `OTEL_TRACES_EXPORTER=none`，不发起网络调用。

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

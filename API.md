# RepoPilot API

本文档描述 RepoPilot 对人类、平台和 AgentTeams Worker 暴露的稳定契约。

## 通用约定

- Content-Type：`application/json`
- Repository：`owner/name`
- UUID：RFC 4122
- 时间：ISO 8601 UTC
- 写操作必须幂等或显式带版本号。
- 默认策略只有 `pull_request_only`。

## REST API

### `GET /health`

返回控制面依赖状态。

```json
{
  "status": "ok",
  "database": "connected",
  "matrix": "not_configured",
  "github": "configured"
}
```

### `POST /api/v1/runs`

创建并尝试派发维护 Run。

Issue 输入：

```json
{
  "source": {
    "type": "github_issue",
    "repository": "wellkilo/repopilot-testbed",
    "issueNumber": 1
  },
  "executionPolicy": "pull_request_only"
}
```

失败 Workflow 输入：

```json
{
  "source": {
    "type": "github_workflow_run",
    "repository": "wellkilo/repopilot-testbed",
    "workflowRunId": 31680709748
  },
  "executionPolicy": "pull_request_only"
}
```

响应：`202 Accepted`

```json
{
  "run": {
    "id": "uuid",
    "source": {},
    "executionPolicy": "pull_request_only",
    "status": "awaiting_dispatch",
    "traceId": "32-hex",
    "matrixEventId": null,
    "createdAt": "2026-08-13T00:00:00.000Z",
    "updatedAt": "2026-08-13T00:00:00.000Z"
  }
}
```

当 Matrix 未配置时，Run 进入 `awaiting_dispatch`。不会使用 Mock Agent。

### `GET /api/v1/runs`

返回最近 50 个 Run。

### `GET /api/v1/runs/{runId}`

返回 Run、Agent Skill Step、完整 evidence、审批记录和哈希链验证结果。

```json
{
  "run": {
    "id": "uuid",
    "steps": [
      {
        "id": "uuid",
        "agentName": "repopilot-verifier",
        "skillName": "verification-gate",
        "status": "succeeded",
        "summary": "7/7 tests and GitHub Checks passed"
      }
    ],
    "evidence": [],
    "approvals": []
  },
  "evidenceChainValid": true
}
```

### `GET /api/v1/runs/{runId}/proof`

导出机器可核验的 Proof Bundle 及确定性评测结果。

```json
{
  "bundle": {
    "schemaVersion": "1.0",
    "generatedAt": "2026-08-21T00:00:00.000Z",
    "run": {},
    "steps": [],
    "approvals": [],
    "evidence": [],
    "integrity": {
      "algorithm": "SHA-256",
      "canonicalization": "canonical-json",
      "chainValid": true,
      "chainHead": "hex"
    }
  },
  "evaluation": {
    "evaluatorVersion": "1.0",
    "score": 100,
    "grade": "verified",
    "dimensions": {
      "coordination": 25,
      "skillEngineering": 20,
      "verification": 25,
      "safetyAuditability": 20,
      "learningReuse": 10
    },
    "metrics": [],
    "findings": []
  }
}
```

Proof Score 只评价运行证据完整性，不替代测试床 acceptance criteria、Verifier
结论或 GitHub Checks 对补丁语义质量的判断。

### `POST /api/v1/runs/{runId}/status`

内部/受信调用方推进显式状态机。

```json
{
  "status": "verifying"
}
```

非法状态跳转返回 `409 conflict`。

### `POST /api/v1/approvals/{approvalId}/decision`

Header：

```text
X-RepoPilot-Actor: <authenticated-subject>
```

Body：

```json
{
  "decision": "approved",
  "comment": "已核对 CI、diff 和回滚点",
  "expectedVersion": 1
}
```

同一审批只能从 `pending` 决策一次。并发或旧版本返回 `409`。

## GitHub Webhook

### `POST /api/v1/webhooks/github`

Headers：

```text
X-GitHub-Event: issues | workflow_run
X-GitHub-Delivery: <uuid>
X-Hub-Signature-256: sha256=<hex>
```

支持事件：

- `issues.opened`
- `issues.reopened`
- `workflow_run.completed` 且 `conclusion == failure`

安全：

- 原始字节 HMAC-SHA256 验签。
- delivery ID 唯一。
- 并发重放使用 PostgreSQL transaction advisory lock，只创建一个 Run，只追加一次 input evidence。
- 非目标事件返回 `202` 和 `accepted: false`。

## MCP

Endpoint：

```text
POST /mcp
```

Transport：MCP Streamable HTTP，stateless，JSON response。

### `repopilot_start_step`

每次 Agent 执行核心 Skill 前调用。`idempotencyKey` 由调用方提供，同一 Run
内重复调用返回同一个 Step，不重复追加开始事件。

```json
{
  "runId": "uuid",
  "agentName": "repopilot-locator",
  "skillName": "root-cause-localization",
  "idempotencyKey": "issue-3-localization-attempt-1"
}
```

Agent 与 Skill 的对应关系由 Schema 强校验。

### `repopilot_finish_step`

```json
{
  "stepId": "uuid",
  "status": "succeeded",
  "summary": "Reproduced duplicate dispatch and confirmed the find/save race."
}
```

终态为 `succeeded | failed | blocked | skipped`。同一终态和 summary 的重试幂等；
冲突终态会被拒绝。开始和结束均写入 `agent_message` Evidence。

Evidence 类型为：

```text
input | decision | agent_message | tool_call | tool_result | approval
| git_reference | ci_result | runbook | proof_publication | error
```

### `repopilot_append_evidence`

输入：

```json
{
  "runId": "uuid",
  "stepId": "optional-uuid",
  "evidenceType": "decision",
  "payload": {
    "hypothesis": "score=0 is treated as absent"
  }
}
```

输出：含 `payloadHash`、`previousHash`、`chainHash` 的 evidence。

### `repopilot_request_approval`

```json
{
  "runId": "uuid",
  "action": "merge_pull_request",
  "riskLevel": "high",
  "details": {
    "repository": "wellkilo/repopilot-testbed",
    "pullNumber": 2,
    "headSha": "..."
  }
}
```

仅创建审批，不执行动作。

### `repopilot_search_runbooks`

```json
{
  "repository": "wellkilo/repopilot-testbed",
  "query": "zero score fallback",
  "limit": 5
}
```

当前默认使用 PostgreSQL `websearch_to_tsquery`。`embedding VECTOR(1536)` 仅为后续语义检索预留。

### `repopilot_write_runbook`

```json
{
  "repository": "wellkilo/repopilot-testbed",
  "title": "Preserve valid zero evaluation scores",
  "summary": "Use nullish fallback for nullable numeric values.",
  "content": "...",
  "sourceRunId": "uuid"
}
```

### `repopilot_publish_proof_comment`

读取指定 Run 的持久化 Step、Approval 和 Evidence，重新验证哈希链，生成脱敏
Proof 摘要并幂等发布到对应 Pull Request：

```json
{
  "runId": "uuid",
  "repository": "wellkilo/repopilot-testbed",
  "pullNumber": 4
}
```

真实调用：

```text
GET   /repos/{owner}/{repo}/issues/{pull_number}/comments?per_page=100
POST  /repos/{owner}/{repo}/issues/{pull_number}/comments
PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}
```

评论以 `<!-- repopilot-proof:{runId} -->` 作为稳定标记。首次调用创建评论，后续调用
更新同一评论，不重复刷屏。输出包含 `action`、`htmlUrl`、`proofScore`、`grade` 和
`chainHead`。评论不包含原始 Evidence payload。仅 `succeeded` 或 `failed` 终态 Run
可以发布，且目标 PR 必须存在于该 Run 的 `create_pull_request` Evidence 中。评论内
同时提供不含原始 payload 的机器可解析 JSON 摘要。

### `github_get_issue`

真实调用 GitHub REST `GET /repos/{owner}/{repo}/issues/{issue_number}`。

### `github_create_pull_request`

真实调用 GitHub REST `POST /repos/{owner}/{repo}/pulls`。

这是默认策略允许的最高自动写权限。

### `github_get_pull_request_checks`

同时读取：

- Combined Statuses；
- GitHub Actions Check Runs。

结果自动写入 `ci_result` evidence。

### `github_merge_pull_request`

输入除仓库和 PR 外必须包含：

```json
{
  "runId": "uuid",
  "approvalId": "uuid",
  "approvalVersion": 2
}
```

执行前原子消费审批。审批必须满足：

- `status == approved`
- Run 匹配
- Action 为 `merge_pull_request`
- Version 匹配
- `consumedAt == null`

成功消费后不能再次调用。

## 错误结构

REST：

```json
{
  "error": "invalid_request | conflict | not_found",
  "message": "human-readable detail"
}
```

MCP 使用 JSON-RPC 错误与工具错误内容。

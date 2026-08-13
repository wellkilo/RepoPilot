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

返回 Run、完整 evidence、审批记录和哈希链验证结果。

```json
{
  "run": {
    "id": "uuid",
    "evidence": [],
    "approvals": []
  },
  "evidenceChainValid": true
}
```

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

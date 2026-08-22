# Architecture

## Logical View

```mermaid
flowchart LR
    GH[GitHub Issue / Failed CI / Pull Request] --> CP[RepoPilot Control Plane]
    CP --> DB[(PostgreSQL + pgvector)]
    CP --> MX[Matrix Admin → Manager DM]
    MX --> M[AgentTeams Manager]
    M --> TL[Repo Lead / Team Leader]
    TL --> L[Locator]
    TL --> F[Fixer]
    TL --> V[Verifier]
    TL --> A[Archivist]
    M --> R[Reviewer]
    L & F & V & A --> MCP[RepoPilot MCP via Higress]
    R --> MCP
    MCP --> GHAPI[GitHub REST API]
    MCP --> DB
    DB --> UI[Evidence Console]
    CP --> OTEL[OTLP / AgentLoop / LoongSuite]
```

## AgentTeams Mapping

| Repository capability   | AgentTeams mechanism                         | RepoPilot implementation                       |
| ----------------------- | -------------------------------------------- | ---------------------------------------------- |
| Role orchestration      | Worker + Team CRD                            | six Worker resources                           |
| Task decomposition      | Team Leader project/task management          | Repo Lead + repository-triage                  |
| Context transfer        | Matrix Team Room + shared task files + MinIO | immutable source context and task deliverables |
| Collaborative execution | Leader delegates to Team Workers             | Locator → Fixer → Verifier → Archivist         |
| Pull request review     | Dedicated read-only Worker                   | Reviewer → managed PR comment                  |
| State tracking          | Project/task state + Worker/Team status      | AgentTeams status + RepoPilot Run state        |
| Human intervention      | Human in Matrix / control plane              | approval console                               |

## State Machine

```text
queued
  ├─> awaiting_dispatch ─> dispatched
  └─> dispatched

dispatched ─> running
running ─> awaiting_approval ─> running
running ─> verifying ─> succeeded

non-terminal states ─> failed/cancelled
```

Terminal states cannot transition.

## Data Model

- `runs`: source, policy, status, Matrix event, Trace ID.
- `steps`: Agent-level execution unit.
- `evidence`: append-only hash chain.
- `approvals`: optimistic version + one-time `consumed_at`.
- `runbooks`: full-text index and optional `vector(1536)`.

每个 Agent 必须通过 RepoPilot MCP 打开和关闭 Skill Step，使 AgentTeams 角色执行可以
从运行数据查询，而不是从静态清单推断。Proof Bundle 将 Step 时间线、审批、
Evidence 链根、PR/CI 事实和确定性质量门禁合并为一个可移植 JSON 工件。
Archivist 再通过幂等 GitHub 评论把脱敏摘要与最终链根附着到目标 PR；首次发布记录
`proof_publication` Evidence，之后只更新同一评论。

PR webhook 走独立的 `github_pull_request` Run。Reviewer 固化并复核 head SHA，分页
读取 changed files 与 Checks，只能创建或更新带固定 marker 的普通 PR 评论。评论发布
记录 `review_publication` Evidence；缺少该证据时审查 Step 不能成功结束。

## Deployment Profiles

### Local development

- RepoPilot control plane and console on Node.js.
- PostgreSQL/pgvector in Docker.
- AgentTeams optional.
- No model secret required.

### Self-hosted AgentTeam

- AgentTeams v1.2.2 local Docker or Kubernetes.
- RepoPilot MCP behind Higress.
- GitHub token stored in gateway/secret manager.
- OpenTelemetry OTLP to AgentLoop/LoongSuite or compatible backend.

### Production

- Kubernetes.
- PostgreSQL or PolarDB for PostgreSQL.
- OIDC/SSO before control plane.
- HTTPS ingress.
- GitHub App rather than broad personal token.
- Restricted egress and repository allowlist.

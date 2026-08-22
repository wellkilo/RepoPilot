# Deployment

## Local Control Plane

Requirements:

- Node.js 20+
- pnpm 9+
- Docker

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install --registry=https://registry.npmjs.org
pnpm build
set -a
source .env
set +a
pnpm --filter @repopilot/control-plane start
```

The server binds `HOST` and `PORT`, serves `/health`, REST, `/mcp`, and the built console in one process.

## Database Migration

Fresh Docker volume automatically runs:

```text
apps/control-plane/sql/001_init.sql
apps/control-plane/sql/002_approval_consumption.sql
apps/control-plane/sql/003_step_idempotency.sql
apps/control-plane/sql/004_pull_request_source.sql
```

从旧版 RepoPilot 升级已有数据库时，`001_init.sql` 已执行过，不要重复运行；后续迁移
均使用 `IF NOT EXISTS` 或等价保护：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/control-plane/sql/002_approval_consumption.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/control-plane/sql/003_step_idempotency.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/control-plane/sql/004_pull_request_source.sql
```

## AgentTeams

Install AgentTeams `v1.2.2` using its official installer or Helm chart. Model service credentials are supplied to AgentTeams, not RepoPilot.

Example OpenAI-compatible configuration:

```text
Base URL: http://host.docker.internal:11434/v1
API Key: ollama
Model: qwen3
```

The exact local model must support the AgentTeams runtime requirements. Use a hosted model when local resources cannot provide stable tool use and context capacity.

Then render:

```bash
export AGENTTEAMS_MODEL=qwen3.5-plus
export AGENTTEAMS_COPAW_WORKER_IMAGE=higress-registry.cn-hangzhou.cr.aliyuncs.com/agentteams/agentteams-copaw-worker:v1.2.2
export REPOPILOT_MCP_URL=https://agentteams.example.com/mcp-servers/repopilot/mcp
envsubst < deploy/agentteams/repopilot-team.yaml > /tmp/repopilot-team.yaml
agt apply -f /tmp/repopilot-team.yaml
```

RepoPilot uses AgentTeams `v1.2.2`'s default CoPaw Worker runtime. QwenPaw is
opt-in in this release and is not part of the reproducible deployment path.

## GitHub Webhook

Configure repository webhook:

- URL: `https://<repopilot>/api/v1/webhooks/github`
- Content type: `application/json`
- Secret: same as `GITHUB_WEBHOOK_SECRET`
- Events:
  - Issues
  - Workflow runs
  - Pull requests

## GitHub Token Permissions

RepoPilot 建议使用仅限目标仓库的 fine-grained personal access token 或 GitHub App。
最小权限为：

- `Contents: Read and write`：推送修复分支；
- `Pull requests: Read and write`：创建 PR；
- `Issues: Read and write`：创建或更新 PR 的 Proof Comment 与 Review Comment；
- `Actions: Read` 与 `Checks: Read`：读取独立验证结果。

不要授予仓库管理、密钥管理或组织管理权限。`GITHUB_ALLOWED_REPOSITORIES` 仍会在
应用层限制可操作仓库。

## Observability

Set:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=https://<collector>:4318
OTEL_SERVICE_NAME=repopilot-control-plane
```

RepoPilot 输出 HTTP、编排、MCP 工具、持久化 Agent Skill 和端到端 Run Span，
同时输出操作、Skill 与 Run 的计数器和时延直方图。Trace 与 Metrics 共享
`runId`、`stepId`、Agent、Skill、repository 和 outcome 属性。AgentTeams/AgentLoop
可补充模型运行轨迹；Evidence 仍是持久化、哈希链接的事实源。

导出一个 Run 并离线复评：

```bash
curl http://127.0.0.1:3000/api/v1/runs/<run-id>/proof \
  --output artifacts/proof-bundle.json
pnpm build
pnpm evaluate artifacts/proof-bundle.json artifacts/evaluation-report.json
```

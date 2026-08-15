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
```

Existing database:

```bash
for migration in apps/control-plane/sql/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

## AgentTeams

Install AgentTeams `v1.2.2` using its official installer or Helm chart. Model service credentials are supplied to AgentTeams, not RepoPilot.

Example OpenAI-compatible configuration:

```text
Base URL: http://host.docker.internal:11434/v1
API Key: ollama
Model: qwen3
```

The exact local model must support the AgentTeams runtime requirements; use a hosted model for a reliable competition demo if local resources are insufficient.

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

## Observability

Set:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=https://<collector>:4318
OTEL_SERVICE_NAME=repopilot-control-plane
```

RepoPilot emits HTTP spans. AgentTeams/AgentLoop supply Agent runtime traces; evidence records link all durable execution facts by Run ID and Trace ID.

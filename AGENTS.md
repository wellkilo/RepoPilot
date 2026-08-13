# RepoPilot Development Contract

## Mission

RepoPilot is an open-source, auditable repository-maintenance AgentTeam for the GOAI Agent Infra track. It must demonstrate a real end-to-end loop:

`GitHub event -> AgentTeams orchestration -> analysis -> patch -> pull request -> CI verification -> approval/audit -> runbook`

## Authoritative Constraints

- AgentTeams `v1.2.2` is the orchestration foundation. Do not replace it with a custom multi-agent simulator.
- The default execution policy is `pull_request_only`.
- RepoPilot may create branches, commits, comments, and pull requests automatically.
- Merge, branch deletion, destructive rollback, permission changes, and secret changes require explicit human approval.
- Runtime integrations use real GitHub, Matrix, MCP, PostgreSQL, and OpenTelemetry contracts. Tests may isolate pure functions, but production paths must not contain mock providers.
- Secrets are supplied only through environment variables or the deployment secret manager and must never be committed.

## Architecture

- `apps/control-plane`: Fastify API, GitHub webhook ingestion, Matrix dispatch, evidence ledger, approval workflow, and Streamable HTTP MCP server.
- `apps/console`: React evidence console for runs, Agent steps, approvals, traces, and runbooks.
- `packages/contracts`: shared Zod schemas and TypeScript types.
- `deploy/agentteams`: AgentTeams Worker and Team resources.
- `skills`: reusable RepoPilot Agent Skills, plus installation metadata for official Alibaba Cloud Skills.
- `docs`: API, method, competition, architecture, security, and operational documentation.
- `testbed`: source template for the intentionally defective public/private demo repository.

## Development Flow

1. Confirm the contract and relevant external API before implementation.
2. Update `API.md` and `Method.md` when an input, output, state transition, or external method changes.
3. Add focused unit tests for policies, schemas, evidence hashing, and state transitions.
4. Add integration tests for PostgreSQL, HTTP routes, GitHub webhook verification, and MCP calls.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the relevant integration tests.
6. Preserve evidence for manual end-to-end validation under `artifacts/`; do not commit secrets or access tokens.

## Coding Rules

- TypeScript strict mode is mandatory.
- Validate every external input with Zod or a complete Fastify JSON Schema.
- Keep state transitions explicit and reject invalid transitions.
- Use idempotency keys for webhook deliveries and external write operations.
- Link logs to `runId`, `traceId`, and, where relevant, `stepId`.
- Hash-chain evidence records; never update or delete an existing evidence entry.
- Use descriptive names and avoid implicit `any`.

## Non-Goals

- Automatic PR merge.
- Arbitrary shell execution from the public control-plane API.
- Storing GitHub, Matrix, model, or cloud credentials in the RepoPilot database.
- Claiming vector RAG when only lexical retrieval is configured.
- Reimplementing AgentTeams task orchestration.

## Required Environment Facts

The repository must remain buildable without model credentials. A real AgentTeams run additionally requires:

- An OpenAI-compatible model endpoint or a supported local endpoint such as Ollama.
- A running AgentTeams `v1.2.2` installation.
- Matrix admin credentials for task injection.
- A GitHub App or fine-grained token configured through Higress/AgentTeams for Worker tools.
- PostgreSQL 16 with the `vector` extension for optional semantic Runbook retrieval.

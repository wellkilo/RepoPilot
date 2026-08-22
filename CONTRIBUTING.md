# Contributing to RepoPilot

RepoPilot welcomes focused contributions to repository automation, execution
evidence, safety policy, AgentTeams integration, developer tooling, and
documentation.

## Development Setup

Requirements:

- Node.js 20 or newer
- pnpm 9
- Docker

```bash
git clone https://github.com/wellkilo/RepoPilot.git
cd RepoPilot
cp .env.example .env
docker compose up -d postgres
pnpm install --registry=https://registry.npmjs.org
pnpm build
```

Model credentials are not required for builds, unit tests, or control-plane
development. A real AgentTeams run additionally requires the integrations
listed in [`docs/deployment.md`](docs/deployment.md).

## Before You Change Code

1. Read [`AGENTS.md`](AGENTS.md) for the project contract and safety boundaries.
2. Check [`API.md`](API.md) and [`Method.md`](Method.md) before changing an
   external request, response, state transition, or SDK call.
3. Keep changes focused. Do not mix unrelated refactors with a bug fix.
4. Never commit credentials, webhook secrets, access tokens, or private
   evidence payloads.

## Quality Gates

Run the checks relevant to your change, then run the complete local gate before
opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Changes to policies, schemas, evidence hashing, state transitions, webhooks, or
external write operations must include focused tests. Integration changes
should cover PostgreSQL and HTTP behavior where practical.

## Pull Requests

A good pull request:

- explains the problem and the intended behavior;
- links an issue or provides a reproducible scenario;
- states the safety and compatibility impact;
- includes tests or verification evidence;
- updates `API.md`, `Method.md`, or operational documentation when contracts
  change;
- avoids generated files and unrelated formatting churn.

RepoPilot itself follows a `pull_request_only` default. Contributions must not
weaken approval gates for merge, branch deletion, destructive rollback,
permission changes, or secret changes.

## Reporting Problems

When opening an issue, include:

- the triggering GitHub event or API operation;
- expected and actual behavior;
- a minimal reproduction;
- relevant logs with secrets removed;
- runtime versions for Node.js, pnpm, PostgreSQL, and AgentTeams;
- whether the problem occurs before or after an external write.

Security-sensitive reports should not include exploitable secrets or private
repository data in a public issue. Use the repository's private security
reporting channel when available.

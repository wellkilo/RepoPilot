# Security Model

## Default Authority

RepoPilot automatically permits:

- read Issue and Workflow context;
- clone/fetch an allowed repository;
- create a branch and commit;
- push a non-protected branch;
- create a Pull Request;
- create or update the single managed PR Review Comment;
- read CI and write evidence.

RepoPilot requires human approval for:

- merge Pull Request;
- delete branch;
- destructive rollback;
- permission changes;
- secret changes;
- arbitrary high-risk tools.

## Approval Protocol

1. Worker calls `repopilot_request_approval`.
2. Control plane stores `status=pending`, `version=1`.
3. Authenticated human approves/rejects with `expectedVersion`.
4. Approval version increments.
5. High-risk MCP tool atomically sets `consumed_at`.
6. Reusing the approval fails.

The action itself is recorded as evidence with approval ID and version.

## Credential Boundaries

- No credential is stored in source code or PostgreSQL.
- Model and MCP credentials should remain in Higress/AgentTeams.
- Local development uses `.env`, ignored by Git.
- Production should use Kubernetes Secrets or an external secret manager.
- Worker prompts and evidence must redact credential-shaped strings.

## Repository Scope

`GITHUB_ALLOWED_REPOSITORIES` is enforced by:

- REST Run creation;
- GitHub Webhook;
- every GitHub MCP tool.

## Pull Request Review Boundary

PR review Runs are identified by the `github_pull_request` source and are restricted to:

- reading the bound PR, changed-file pages, and Checks;
- appending review evidence;
- creating or updating the single `<!-- repopilot-review -->` general PR comment.

The control plane rejects repository-mutation tools such as PR creation and merge when the
calling Run is a PR review Run. Before publishing, it compares the Run head SHA, tool input
head SHA, and current GitHub PR head SHA. A stale review cannot overwrite the comment for a
newer revision. Comment upsert is serialized by a PostgreSQL advisory lock to avoid duplicate
comments during concurrent retries.

## Webhook Security

- Raw-body HMAC-SHA256 verification.
- Constant-time digest comparison.
- Delivery ID deduplication under a transaction-level advisory lock.
- Non-actionable events are accepted but not executed.

## Evidence Integrity

- Canonical JSON prevents key-order hash drift.
- Each record links to `previousHash`.
- Database triggers reject updates and deletes.
- Console recomputes chain validity through the API.

This provides tamper evidence, not a substitute for database access control or external timestamping.

## Known Production Hardening

- Put OIDC/SSO before REST and console.
- Replace `X-RepoPilot-Actor` trust with proxy-verified identity.
- Use a GitHub App with least-privilege installation scopes.
- Add network policies and TLS.
- Add approval expiry and reviewer groups.
- Export evidence chain roots to immutable object storage.

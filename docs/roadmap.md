# Roadmap

RepoPilot's roadmap focuses on making repository maintenance automation safer,
more portable, and easier to operate across teams. Items are listed as
directions rather than release promises; completed work is linked to tests,
public pull requests, or versioned documentation before it is presented as an
available capability.

## Current Focus

### Repository onboarding

- GitHub App installation flow with repository-scoped permissions.
- Repository policy files for allowed paths, commands, and review rules.
- Clear preflight diagnostics for Matrix, AgentTeams, GitHub, and PostgreSQL.

### Review quality

- Inline review comments in addition to the managed summary comment.
- Language-aware analyzers and repository-specific validation commands.
- Finding deduplication across new commits on the same pull request.
- Explicit dismissal when a finding no longer applies to the current revision.

### Reliability

- Durable retry queues for GitHub and Matrix transient failures.
- Recovery tests for tool failure, interrupted runs, and rejected approvals.
- More public testbed cases across languages and build systems.
- Versioned Proof Bundle compatibility checks.

### Operations

- OIDC/SSO integration for the evidence console.
- GitHub App authentication as the recommended production path.
- OpenTelemetry dashboards for run latency, tool failures, and policy blocks.
- Backup and retention guidance for evidence and runbooks.

### Ecosystem

- Versioned releases for RepoPilot Skills.
- Reusable deployment examples for Kubernetes and self-hosted environments.
- Contributor documentation for custom Skills and MCP tools.
- Compatibility tracking for supported AgentTeams releases.

## Non-Goals

- Automatically merging pull requests without explicit human approval.
- Exposing unrestricted shell execution through the public control-plane API.
- Storing model, GitHub, Matrix, or cloud credentials in RepoPilot.
- Treating a passing CI check as sufficient evidence that a change is correct.

## How to Contribute

Open an issue with a reproducible use case or propose a focused pull request
following [`CONTRIBUTING.md`](../CONTRIBUTING.md). For new integrations, include
the external API contract, minimum permissions, failure behavior, and test
strategy.

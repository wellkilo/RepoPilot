# Demo Runbook

## Target

- Issue: `wellkilo/repopilot-testbed#1`
- Pull Request: `wellkilo/repopilot-testbed#2`
- Patch commit: `dd67868d9cb09d4f92b4fcd25d6ce1f3b7526205`
- CI run: `31793190761`
- RepoPilot Run: `11c63758-3cbe-40f9-a2d7-06d53428943b`
- Trace: `332f8652f35deae8c6c73cd0fbd0888b`
- Evidence: `16`, chain valid

## Online Demo

Open:

```text
https://wellkilo.github.io/RepoPilot/#demo
```

The public demo has two explicitly separated modes:

- **Interactive scenario** replays the webhook-delivery idempotency path that
  exists in the current RepoPilot code and tests. It shows the route, schema,
  store, service, and integration-test changes as one AgentTeam handoff.
- **Verified Run #1** replays the externally verifiable testbed repair linked
  in the Target section.

Neither mode requires a model API key, GitHub credential, or AgentTeams
administrator account.

Recorded walkthrough:

```text
https://wellkilo.github.io/RepoPilot/assets/demo/repopilot-agentteam-demo.mp4
```

## Expected Agent Flow

1. Repo Lead reads Issue #1 and recalls related Runbooks.
2. Locator runs:

   ```bash
   npm ci
   npm run typecheck
   npm test
   ```

3. Locator identifies `result.score || 1` as the cause because numeric `0` is falsy.
4. Fixer creates a focused branch, changes fallback to `result.score ?? 1`, and preserves the regression test.
5. Fixer opens Pull Request #2 and stops.
6. Verifier confirms:
   - test fails on base;
   - test passes on patch;
   - typecheck passes;
   - GitHub Actions Run `31793190761` passes.
7. Archivist writes a Runbook: nullable numeric fields must not use truthiness fallback.
8. If a merge is requested, Repo Lead creates a high-risk approval. The human may approve, but the demo does not need to execute merge.

## Evidence to Show

- Matrix task delegation and Worker messages.
- RepoPilot evidence track.
- Root-cause decision.
- Branch and commit SHA.
- Pull Request #2 and patch commit.
- CI before/after.
- Approval gate.
- Runbook retrieval.
- `CHAIN VERIFIED`.

## Failure Branches

- No model configured → Run remains `awaiting_dispatch`.
- GitHub unavailable → error evidence, no patch.
- CI pending → Verifier returns `BLOCKED`.
- Approval rejected → Run is cancelled; no merge.
- Duplicate webhook → existing Run returned; no duplicate dispatch.

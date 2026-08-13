# Demo Runbook

## Target

- Issue: `wellkilo/repopilot-testbed#1`
- Base commit: `9a6a3bec289fb3f943d875a50bdc965e19946fac`
- Failed CI: `31680709748`

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
5. Fixer opens a Pull Request and stops.
6. Verifier confirms:
   - test fails on base;
   - test passes on patch;
   - typecheck passes;
   - GitHub Check Run passes.
7. Archivist writes a Runbook: nullable numeric fields must not use truthiness fallback.
8. If a merge is requested, Repo Lead creates a high-risk approval. The human may approve, but the demo does not need to execute merge.

## Evidence to Show

- Matrix task delegation and Worker messages.
- RepoPilot evidence track.
- Root-cause decision.
- Branch and commit SHA.
- Pull Request URL.
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

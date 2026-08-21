# Demo Runbook

## Target

- Issue: [`wellkilo/repopilot-testbed#3`](https://github.com/wellkilo/repopilot-testbed/issues/3)
- Baseline branch: `repopilot/demo-webhook-replay-baseline`
- Baseline commit: `7c117e91523b489cb1fd5631562c0400b459619d`
- Failing CI: [`32444544920`](https://github.com/wellkilo/repopilot-testbed/actions/runs/32444544920)
- Fix branch: `fix/idempotent-webhook-replay`
- Patch commit: `a21506581533b87d82bba21de1fa9a8f0aabbcde`
- Pull Request: [`wellkilo/repopilot-testbed#4`](https://github.com/wellkilo/repopilot-testbed/pull/4)
- Passing CI: [`32444690068`](https://github.com/wellkilo/repopilot-testbed/actions/runs/32444690068)
- Patch scope: `5 files`, `+75 / -22`
- Result: `7 / 7 tests passed`, PR `OPEN / CLEAN`

## Online Demo

Open:

```text
https://wellkilo.github.io/RepoPilot/#demo
```

The public demo has two explicitly separated modes:

- **Public Issue → PR** is the default path. It replays the externally
  verifiable Issue #3 delivery from failing baseline to five-file patch,
  passing CI, and open PR #4.
- **Historical minimal case** preserves the earlier Issue #1 / PR #2
  one-line repair for comparison, but it is not the primary demo.

Neither mode requires a model API key, GitHub credential, or AgentTeams
administrator account.

Recorded walkthrough:

```text
https://wellkilo.github.io/RepoPilot/assets/demo/repopilot-agentteam-demo.mp4
```

## Expected Agent Flow

1. Repo Lead reads Issue #3, locks `pull_request_only`, and converts the seven
   acceptance criteria into a task DAG.
2. Locator checks out baseline commit `7c117e9` and runs:

   ```bash
   npm ci
   npm run typecheck
   npm test
   ```

3. Locator confirms the concurrent regression test fails while typecheck and
   unrelated tests pass. The root cause is the asynchronous window between
   `find` and `save`.
4. Fixer adds the typed `StoredTaskResult` contract and implements
   `DeliveryTaskStore.getOrCreate(deliveryId, createTask)`.
5. Fixer moves task creation and dispatch into the same per-delivery factory,
   then adds sequential retry and different-delivery negative controls.
6. Verifier confirms:
   - the concurrency test fails on the baseline;
   - all seven tests pass on the patch;
   - typecheck passes;
   - GitHub Actions Run `32444690068` passes.
7. Fixer opens Pull Request #4 against the failing baseline and stops.
8. Archivist records the reusable rule: idempotency must cover both task
   creation and downstream dispatch.
9. If a merge is requested, Repo Lead creates a high-risk approval. The human
   may approve, but this demo deliberately leaves PR #4 open.

## Evidence to Show

- Issue #3 and its seven acceptance criteria.
- Baseline commit `7c117e9` and failing CI Run `32444544920`.
- Repo Lead → Locator → Fixer → Verifier → Archivist handoffs.
- Five-file patch and commit `a215065`.
- Passing CI Run `32444690068` and `7 / 7` tests.
- Pull Request #4, `OPEN / CLEAN`, with human-only merge.
- Reusable runbook rule and the approval gate.

## Failure Branches

- No model configured → Run remains `awaiting_dispatch`.
- GitHub unavailable → error evidence, no patch.
- CI pending → Verifier returns `BLOCKED`.
- Approval rejected → Run is cancelled; no merge.
- Duplicate webhook → both requests return the same task; dispatch runs once.
- In-flight factory rejects → pending entry is cleared so a later retry can
  proceed.
- Different delivery IDs → continue independently and do not share state.

## Historical Minimal Case

The previous one-line example remains available in the secondary demo tab:

- Issue: `wellkilo/repopilot-testbed#1`
- Pull Request: `wellkilo/repopilot-testbed#2`
- Patch commit: `dd67868d9cb09d4f92b4fcd25d6ce1f3b7526205`
- CI run: `31793190761`

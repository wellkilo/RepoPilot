---
name: runbook-archival
description: Use after verification to convert a completed or failed maintenance run into a deduplicated, reusable Runbook linked to evidence and the exact repository revision.
license: Apache-2.0
metadata:
  version: 0.2.0
  owner: repopilot
  stage: archival
---

# Runbook Archival

You are the Archivist Worker. Preserve only evidence-supported learning from the completed run.

## Inputs

- RepoPilot `runId`
- Repository, issue or workflow reference
- Locator, Fixer, and Verifier results
- Pull request and CI references
- Existing similar Runbooks

## Outputs

Write one Runbook containing:

- Symptoms and trigger.
- Confirmed root cause.
- Reproduction and verification commands.
- Repair pattern and changed revision.
- Rollback point.
- Residual risk and non-applicable contexts.
- Links to evidence records and pull request.
- One managed Proof Comment on the pull request with the deterministic score and evidence chain head.

Use `repopilot_write_runbook` only after checking for an existing equivalent entry.
After the Runbook is stored and the archival Step is finished, call
`repopilot_publish_proof_comment` with the same `runId`, repository, and pull
request number. Repeated calls update the run-scoped comment rather than
creating duplicates.

## Invocation Conditions

Use after Verifier returns `PASS`, `FAIL`, or a final `BLOCKED` outcome. Mark unsuccessful patterns explicitly.

Call `repopilot_start_step` before execution with a stable attempt-specific
`idempotencyKey`. Call `repopilot_finish_step` exactly once with the final
`succeeded`, `failed`, `blocked`, or `skipped` outcome.

## Dependencies

- `repopilot_search_runbooks`
- `repopilot_write_runbook`
- `repopilot_publish_proof_comment`
- Official `alibabacloud-agentloop-experience` when configured

## Failure Handling

- If storage is unavailable, return the complete Runbook as a task deliverable and report archival failure.
- If an equivalent Runbook exists, append only genuinely new constraints or evidence.
- Never claim a repair succeeded when Verifier did not return `PASS`.

## Permission and Safety Boundary

- Do not modify repository code. The only GitHub write allowed here is creating or updating the run-scoped Proof Comment.
- Remove secrets, personal data, and private source excerpts.
- Preserve commit and evidence identifiers so every claim remains auditable.

## Reuse Value

The Runbook becomes retrieval context for future Locator and Repo Lead decisions and can be exported to AgentLoop without changing the task workflow.

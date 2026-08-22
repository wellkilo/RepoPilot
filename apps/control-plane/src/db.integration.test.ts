import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { RepoPilotStore } from "./db.js";
import { GitHubClient } from "./clients/github.js";
import { RunService } from "./services/run-service.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://repopilot:repopilot@localhost:5432/repopilot";
const store = new RepoPilotStore(databaseUrl);
const runService = new RunService(
  store,
  new GitHubClient(undefined),
  undefined,
  new Set(["wellkilo/repopilot-testbed"])
);

afterAll(async () => {
  await store.close();
});

describe("RepoPilotStore integration", () => {
  it("persists the pull request number and immutable review head", async () => {
    const headSha = "a".repeat(40);
    const run = await store.createRun({
      source: {
        type: "github_pull_request",
        repository: "wellkilo/repopilot-testbed",
        pullNumber: Math.floor(Date.now() / 1000),
        headSha
      },
      executionPolicy: "pull_request_only"
    });

    await expect(store.getRun(run.id)).resolves.toMatchObject({
      source: {
        type: "github_pull_request",
        repository: "wellkilo/repopilot-testbed",
        pullNumber: run.source.type === "github_pull_request" ? run.source.pullNumber : -1,
        headSha
      }
    });
  });

  it("does not complete a review run before its managed comment is published", async () => {
    const headSha = "b".repeat(40);
    const run = await store.createRun({
      source: {
        type: "github_pull_request",
        repository: "wellkilo/repopilot-testbed",
        pullNumber: Math.floor(Date.now() / 1000) + 10,
        headSha
      },
      executionPolicy: "pull_request_only"
    });
    await store.transitionRun(run.id, "dispatched");
    await expect(
      runService.startStep({
        runId: run.id,
        agentName: "repopilot-fixer",
        skillName: "safe-patch-authoring",
        idempotencyKey: `forbidden-fix-${headSha}`
      })
    ).rejects.toThrow("can only execute pull-request-review");
    await expect(
      runService.requestApproval({
        runId: run.id,
        action: "merge_pull_request",
        riskLevel: "high",
        details: {
          pullNumber: run.source.type === "github_pull_request" ? run.source.pullNumber : -1
        }
      })
    ).rejects.toThrow("cannot request high-risk actions");
    const step = await runService.startStep({
      runId: run.id,
      agentName: "repopilot-reviewer",
      skillName: "pull-request-review",
      idempotencyKey: `review-${headSha}`
    });

    await expect(
      runService.finishStep({
        stepId: step.id,
        status: "succeeded",
        summary: "Review completed without publication."
      })
    ).rejects.toThrow("cannot succeed before its managed comment is published");

    await store.appendEvidence({
      runId: run.id,
      stepId: step.id,
      evidenceType: "review_publication",
      payload: {
        operation: "publish_review_comment",
        repository: "wellkilo/repopilot-testbed",
        pullNumber: run.source.type === "github_pull_request" ? run.source.pullNumber : -1,
        headSha
      }
    });
    await expect(
      runService.finishStep({
        stepId: step.id,
        status: "succeeded",
        summary: "Managed review comment published for the bound revision."
      })
    ).resolves.toMatchObject({ status: "succeeded", skillName: "pull-request-review" });
    await expect(store.getRun(run.id)).resolves.toMatchObject({ status: "succeeded" });
  });

  it("creates a run and verifies its append-only evidence hash chain", async () => {
    const issueNumber = Math.floor(Date.now() / 1000);
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber
      },
      executionPolicy: "pull_request_only"
    });

    await store.appendEvidence({
      runId: run.id,
      evidenceType: "decision",
      payload: { verdict: "reproduce-first", issueNumber }
    });

    const detail = await store.getRunDetail(run.id);
    expect(detail?.evidence).toHaveLength(2);
    expect(await store.verifyEvidenceChain(run.id)).toBe(true);
  });

  it("deduplicates concurrent webhook deliveries", async () => {
    const deliveryId = `delivery-${randomUUID()}`;
    const input = {
      source: {
        type: "github_issue" as const,
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 20
      },
      executionPolicy: "pull_request_only" as const
    };
    const [first, second] = await Promise.all([
      store.createRun(input, { deliveryId }),
      store.createRun(input, { deliveryId })
    ]);

    expect(first.id).toBe(second.id);
    expect([first.newlyCreated, second.newlyCreated].sort()).toEqual([false, true]);
    expect(
      (await store.listEvidence(first.id)).filter((entry) => entry.evidenceType === "input")
    ).toHaveLength(1);
  });

  it("requires a matching approval version for high-risk actions", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 1
      },
      executionPolicy: "pull_request_only"
    });
    const approval = await store.requestApproval({
      runId: run.id,
      action: "merge_pull_request",
      riskLevel: "high",
      details: { pullNumber: 1 }
    });

    await expect(
      store.assertApprovedAction(approval.id, "merge_pull_request", approval.version, run.id)
    ).rejects.toThrow("approved");

    const decided = await store.decideApproval(
      approval.id,
      {
        decision: "approved",
        comment: "CI evidence reviewed",
        expectedVersion: approval.version
      },
      "integration-test"
    );

    await expect(
      store.assertApprovedAction(decided.id, "merge_pull_request", decided.version, run.id)
    ).resolves.toMatchObject({ status: "approved" });
    await expect(
      store.consumeApprovedAction(decided.id, "merge_pull_request", decided.version, run.id)
    ).resolves.toMatchObject({ status: "approved" });
    await expect(
      store.consumeApprovedAction(decided.id, "merge_pull_request", decided.version, run.id)
    ).rejects.toThrow("unconsumed");
    await expect(
      store.assertApprovedAction(decided.id, "merge_pull_request", decided.version - 1, run.id)
    ).rejects.toThrow("version-pinned");
  });

  it("rejects evidence mutation in PostgreSQL", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 2
      },
      executionPolicy: "pull_request_only"
    });
    const evidence = await store.listEvidence(run.id);
    const evidenceId = evidence[0]?.id ?? randomUUID();

    await expect(
      store.sql`UPDATE evidence SET payload = '{"tampered":true}'::jsonb WHERE id = ${evidenceId}`
    ).rejects.toThrow("append-only");
  });

  it("preserves numeric evidence order when a chain crosses a decimal boundary", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 5
      },
      executionPolicy: "pull_request_only"
    });
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      await store.appendEvidence({
        runId: run.id,
        evidenceType: "decision",
        payload: { sequence }
      });
    }

    const evidence = await store.listEvidence(run.id);
    const ids = evidence.map((entry) => BigInt(entry.id));

    expect(ids).toEqual([...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
    expect(await store.verifyEvidenceChain(run.id)).toBe(true);
  });

  it("records an idempotent Agent Skill lifecycle in the evidence chain", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 3
      },
      executionPolicy: "pull_request_only"
    });
    const input = {
      runId: run.id,
      agentName: "repopilot-lead" as const,
      skillName: "repository-triage" as const,
      idempotencyKey: "triage-attempt-1"
    };
    const [first, replay] = await Promise.all([store.startStep(input), store.startStep(input)]);

    expect(replay.id).toBe(first.id);
    const finished = await store.finishStep({
      stepId: first.id,
      status: "succeeded",
      summary: "Issue reproduced and acceptance DAG recorded."
    });
    const repeatedFinish = await store.finishStep({
      stepId: first.id,
      status: "succeeded",
      summary: "Issue reproduced and acceptance DAG recorded."
    });

    expect(finished).toMatchObject({
      changed: true,
      step: {
        status: "succeeded",
        agentName: "repopilot-lead",
        skillName: "repository-triage"
      }
    });
    expect(repeatedFinish).toMatchObject({ changed: false, step: { id: first.id } });
    expect(await store.listSteps(run.id)).toHaveLength(1);
    expect(
      (await store.listEvidence(run.id)).filter(
        (entry) =>
          entry.evidenceType === "agent_message" &&
          (entry.payload.event === "step_started" || entry.payload.event === "step_finished")
      )
    ).toHaveLength(2);
    expect(await store.verifyEvidenceChain(run.id)).toBe(true);
  });

  it("rejects reusing a Step idempotency key for a different Agent or Skill", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 4
      },
      executionPolicy: "pull_request_only"
    });
    await store.startStep({
      runId: run.id,
      agentName: "repopilot-lead",
      skillName: "repository-triage",
      idempotencyKey: "shared-key"
    });

    await expect(
      store.startStep({
        runId: run.id,
        agentName: "repopilot-locator",
        skillName: "root-cause-localization",
        idempotencyKey: "shared-key"
      })
    ).rejects.toThrow("already bound");
  });
});

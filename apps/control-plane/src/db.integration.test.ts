import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { RepoPilotStore } from "./db.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://repopilot:repopilot@localhost:5432/repopilot";
const store = new RepoPilotStore(databaseUrl);

afterAll(async () => {
  await store.close();
});

describe("RepoPilotStore integration", () => {
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

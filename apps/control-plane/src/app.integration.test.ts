import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { GitHubClient } from "./clients/github.js";
import type { AppConfig } from "./config.js";
import { RepoPilotStore } from "./db.js";
import { RunService } from "./services/run-service.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://repopilot:repopilot@localhost:5432/repopilot";
const store = new RepoPilotStore(databaseUrl);
const github = new GitHubClient(undefined);
const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 0,
  databaseUrl,
  allowedRepositories: new Set(["wellkilo/repopilot-testbed"]),
  serviceName: "repopilot-test"
};
const runService = new RunService(store, github, undefined, config.allowedRepositories);
const app = await buildApp({ config, store, github, runService });

afterAll(async () => {
  await app.close();
  await store.close();
});

describe("approval HTTP contract", () => {
  it("returns 409 for a stale approval decision", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 100
      },
      executionPolicy: "pull_request_only"
    });
    const approval = await store.requestApproval({
      runId: run.id,
      action: "merge_pull_request",
      riskLevel: "high",
      details: { pullNumber: 1 }
    });
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/approvals/${approval.id}/decision`,
      headers: {
        "content-type": "application/json",
        "x-repopilot-actor": "integration-test"
      },
      payload: {
        decision: "rejected",
        comment: "Do not merge.",
        expectedVersion: approval.version
      }
    });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/approvals/${approval.id}/decision`,
      headers: {
        "content-type": "application/json",
        "x-repopilot-actor": "integration-test"
      },
      payload: {
        decision: "approved",
        comment: "Stale retry.",
        expectedVersion: approval.version
      }
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: "conflict" });
  });
});

describe("proof bundle HTTP contract", () => {
  it("exports durable steps, evidence integrity, and deterministic evaluation", async () => {
    const run = await store.createRun({
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: Math.floor(Date.now() / 1000) + 200
      },
      executionPolicy: "pull_request_only"
    });
    await store.startStep({
      runId: run.id,
      agentName: "repopilot-lead",
      skillName: "repository-triage",
      idempotencyKey: randomUUID()
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${run.id}/proof`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bundle: {
        schemaVersion: "1.0",
        run: { id: run.id, executionPolicy: "pull_request_only" },
        integrity: { chainValid: true, algorithm: "SHA-256" },
        steps: [{ agentName: "repopilot-lead", skillName: "repository-triage" }]
      },
      evaluation: {
        evaluatorVersion: "1.0",
        grade: "insufficient"
      }
    });
  });
});

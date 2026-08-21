import { describe, expect, it } from "vitest";

import type { EvidenceRecord, RunDetail } from "@repopilot/contracts";

import { assertProofPublicationTarget, hasPullRequestEvidence } from "./mcp.js";

const evidenceBase = {
  id: "1",
  runId: "00000000-0000-4000-8000-000000000001",
  stepId: null,
  payloadHash: "payload",
  previousHash: null,
  chainHash: "chain",
  createdAt: "2026-08-21T00:00:00.000Z"
} satisfies Omit<EvidenceRecord, "evidenceType" | "payload">;

describe("Proof Comment publication target", () => {
  it("accepts only the pull request recorded for the run and repository", () => {
    const evidence: EvidenceRecord[] = [
      {
        ...evidenceBase,
        evidenceType: "git_reference",
        payload: {
          operation: "create_pull_request",
          repository: "wellkilo/repopilot-testbed",
          pullRequest: { number: 4 }
        }
      }
    ];

    expect(hasPullRequestEvidence(evidence, "wellkilo/repopilot-testbed", 4)).toBe(true);
    expect(hasPullRequestEvidence(evidence, "WELLKILO/REPOPILOT-TESTBED", 4)).toBe(true);
    expect(hasPullRequestEvidence(evidence, "wellkilo/repopilot-testbed", 5)).toBe(false);
    expect(hasPullRequestEvidence(evidence, "wellkilo/RepoPilot", 4)).toBe(false);
  });

  it("requires a terminal run linked to the exact pull request", () => {
    const detail: RunDetail = {
      id: evidenceBase.runId,
      source: {
        type: "github_issue",
        repository: "wellkilo/repopilot-testbed",
        issueNumber: 3
      },
      executionPolicy: "pull_request_only",
      status: "running",
      traceId: "a".repeat(32),
      matrixEventId: null,
      createdAt: evidenceBase.createdAt,
      updatedAt: evidenceBase.createdAt,
      steps: [],
      approvals: [],
      evidence: [
        {
          ...evidenceBase,
          evidenceType: "git_reference",
          payload: {
            operation: "create_pull_request",
            repository: "wellkilo/repopilot-testbed",
            pullRequest: { number: 4 }
          }
        }
      ]
    };

    expect(() => assertProofPublicationTarget(detail, "wellkilo/repopilot-testbed", 4)).toThrow(
      "must be terminal"
    );
    expect(() =>
      assertProofPublicationTarget(
        { ...detail, status: "succeeded" },
        "wellkilo/repopilot-testbed",
        5
      )
    ).toThrow("is not linked");
    expect(() =>
      assertProofPublicationTarget(
        { ...detail, status: "succeeded" },
        "wellkilo/repopilot-testbed",
        4
      )
    ).not.toThrow();
  });
});

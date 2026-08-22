import { describe, expect, it } from "vitest";

import type { EvidenceRecord, RunDetail } from "@repopilot/contracts";

import {
  assertCurrentPullRequestHead,
  assertExternallyAppendableEvidenceType,
  assertMaintenanceRunSource,
  assertProofPublicationTarget,
  assertPullRequestReviewHead,
  assertReviewPublicationReady,
  hasPullRequestEvidence
} from "./mcp.js";

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
    expect(() =>
      assertProofPublicationTarget(
        {
          ...detail,
          status: "succeeded",
          source: {
            type: "github_pull_request",
            repository: "wellkilo/repopilot-testbed",
            pullNumber: 4,
            headSha: "a".repeat(40)
          }
        },
        "wellkilo/repopilot-testbed",
        4
      )
    ).toThrow("cannot publish a maintenance proof");
  });
});

describe("PR Review publication target", () => {
  const detail: RunDetail = {
    id: evidenceBase.runId,
    source: {
      type: "github_pull_request",
      repository: "wellkilo/repopilot-testbed",
      pullNumber: 7,
      headSha: "a".repeat(40)
    },
    executionPolicy: "pull_request_only",
    status: "running",
    traceId: "b".repeat(32),
    matrixEventId: null,
    createdAt: evidenceBase.createdAt,
    updatedAt: evidenceBase.createdAt,
    steps: [],
    approvals: [],
    evidence: []
  };

  it("accepts only the revision bound to the review run", () => {
    expect(() => assertPullRequestReviewHead(detail, "A".repeat(40))).not.toThrow();
    expect(() => assertPullRequestReviewHead(detail, "b".repeat(40))).toThrow("is bound to head");
    expect(() =>
      assertPullRequestReviewHead(
        {
          ...detail,
          source: {
            type: "github_issue",
            repository: "wellkilo/repopilot-testbed",
            issueNumber: 7
          }
        },
        "a".repeat(40)
      )
    ).toThrow("not a pull request review run");
  });

  it("rejects publication after the pull request head changes", () => {
    expect(() =>
      assertCurrentPullRequestHead("wellkilo/repopilot-testbed", 7, "a".repeat(40), "A".repeat(40))
    ).not.toThrow();
    expect(() =>
      assertCurrentPullRequestHead("wellkilo/repopilot-testbed", 7, "a".repeat(40), "b".repeat(40))
    ).toThrow("refusing stale review publication");
  });

  it("prevents review runs from using repository mutation tools", () => {
    expect(() => assertMaintenanceRunSource(detail)).toThrow("cannot mutate repository state");
    expect(() =>
      assertMaintenanceRunSource({
        ...detail,
        source: {
          type: "github_issue",
          repository: "wellkilo/repopilot-testbed",
          issueNumber: 3
        }
      })
    ).not.toThrow();
  });

  it("publishes only while the Reviewer Step is running", () => {
    expect(() => assertReviewPublicationReady(detail)).toThrow("requires an active");
    expect(() =>
      assertReviewPublicationReady({
        ...detail,
        steps: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            runId: detail.id,
            agentName: "repopilot-reviewer",
            skillName: "pull-request-review",
            status: "running",
            summary: null,
            startedAt: evidenceBase.createdAt,
            endedAt: null,
            createdAt: evidenceBase.createdAt
          }
        ]
      })
    ).not.toThrow();
    expect(() =>
      assertReviewPublicationReady({
        ...detail,
        status: "succeeded",
        steps: []
      })
    ).toThrow("must be running");
  });
});

describe("reserved publication evidence", () => {
  it("can only be written by the corresponding publication tool", () => {
    expect(() => assertExternallyAppendableEvidenceType("decision")).not.toThrow();
    expect(() => assertExternallyAppendableEvidenceType("proof_publication")).toThrow("reserved");
    expect(() => assertExternallyAppendableEvidenceType("review_publication")).toThrow("reserved");
  });
});

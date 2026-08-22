import { describe, expect, it } from "vitest";

import type { EvidenceRecord, RunDetail } from "./index.js";
import {
  buildRunProofBundle,
  evaluateRunProofBundle,
  proofCommentMarker,
  renderProofComment
} from "./proof.js";

const timestamp = "2026-08-21T00:00:00.000Z";

function buildDetail(): RunDetail {
  const skills = [
    ["repopilot-lead", "repository-triage"],
    ["repopilot-locator", "root-cause-localization"],
    ["repopilot-fixer", "safe-patch-authoring"],
    ["repopilot-verifier", "verification-gate"],
    ["repopilot-archivist", "runbook-archival"]
  ] as const;
  const evidence = [
    ["input", { source: "issue" }],
    ["decision", { acceptanceCriteria: ["deduplicate dispatch"] }],
    ["tool_result", { command: "pnpm test", exitCode: 0 }],
    [
      "git_reference",
      { operation: "create_pull_request", pullRequest: { number: 4, state: "open" } }
    ],
    ["ci_result", { state: "success" }],
    ["runbook", { runbookId: "runbook-1" }],
    ["proof_publication", { pullNumber: 4, commentId: 42 }]
  ] as const;

  return {
    id: "00000000-0000-4000-8000-000000000001",
    source: {
      type: "github_issue",
      repository: "wellkilo/repopilot-testbed",
      issueNumber: 3
    },
    executionPolicy: "pull_request_only",
    status: "succeeded",
    traceId: "00000000000000000000000000000001",
    matrixEventId: "$event",
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: skills.map(([agentName, skillName], index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 2}`,
      runId: "00000000-0000-4000-8000-000000000001",
      agentName,
      skillName,
      status: "succeeded",
      summary: `${skillName} completed`,
      startedAt: timestamp,
      endedAt: timestamp,
      createdAt: timestamp
    })),
    evidence: evidence.map(([evidenceType, payload], index) => ({
      id: String(index + 1),
      runId: "00000000-0000-4000-8000-000000000001",
      stepId: null,
      evidenceType,
      payload,
      payloadHash: `payload-${index}`,
      previousHash: index === 0 ? null : `chain-${index - 1}`,
      chainHash: `chain-${index}`,
      createdAt: timestamp
    })),
    approvals: []
  };
}

describe("proof bundle evaluation", () => {
  it("marks a complete Issue-to-PR run as verified", () => {
    const detail = buildDetail();
    const bundle = buildRunProofBundle(detail, true, timestamp);
    const evaluation = evaluateRunProofBundle(bundle, timestamp);

    expect(bundle.integrity.chainHead).toBe("chain-6");
    expect(evaluation).toMatchObject({
      score: 100,
      grade: "verified",
      dimensions: {
        coordination: 25,
        skillEngineering: 20,
        verification: 25,
        safetyAuditability: 20,
        learningReuse: 10
      },
      findings: []
    });
  });

  it("reports missing verification, archival, and skills without guessing success", () => {
    const detail = buildDetail();
    detail.status = "running";
    detail.steps = detail.steps.slice(0, 2);
    detail.evidence = detail.evidence.slice(0, 3);

    const evaluation = evaluateRunProofBundle(
      buildRunProofBundle(detail, false, timestamp),
      timestamp
    );

    expect(evaluation.grade).toBe("insufficient");
    expect(evaluation.findings).toEqual(
      expect.arrayContaining([
        "Evidence 哈希链验证失败",
        "缺少 Pull Request 创建证据",
        "缺少绿色 CI 证据",
        "缺少运行结果到 Runbook 的经验沉淀",
        "缺少 Pull Request Proof 发布证据",
        "缺少成功完成的 Skill：verification-gate"
      ])
    );
  });

  it("renders a redacted, idempotently addressable pull request proof comment", () => {
    const detail = buildDetail();
    detail.evidence[0]!.payload.secret = "must-not-leak";
    const bundle = buildRunProofBundle(detail, true, timestamp);
    const comment = renderProofComment(bundle, evaluateRunProofBundle(bundle, timestamp));

    expect(comment).toContain(proofCommentMarker(detail.id));
    expect(comment).toContain("**100/100 · VERIFIED**");
    expect(comment).toContain("`repopilot-verifier`");
    expect(comment).toContain("SHA-256 chain head");
    expect(comment).toContain('"runId": "00000000-0000-4000-8000-000000000001"');
    expect(comment).not.toContain("must-not-leak");
  });

  it("does not award verified status before proof is published to the pull request", () => {
    const detail = buildDetail();
    detail.evidence = detail.evidence.filter((entry) => entry.evidenceType !== "proof_publication");
    const evaluation = evaluateRunProofBundle(buildRunProofBundle(detail, true, timestamp));

    expect(evaluation.score).toBe(95);
    expect(evaluation.grade).toBe("partial");
    expect(evaluation.findings).toContain("缺少 Pull Request Proof 发布证据");
  });

  it("evaluates a pull request review run against its dedicated evidence contract", () => {
    const detail = buildDetail();
    detail.source = {
      type: "github_pull_request",
      repository: "wellkilo/repopilot-testbed",
      pullNumber: 7,
      headSha: "a".repeat(40)
    };
    detail.steps = [
      {
        id: "00000000-0000-4000-8000-000000000009",
        runId: detail.id,
        agentName: "repopilot-reviewer",
        skillName: "pull-request-review",
        status: "succeeded",
        summary: "Published an evidence-backed review.",
        startedAt: timestamp,
        endedAt: timestamp,
        createdAt: timestamp
      }
    ];
    const reviewEvidence: Array<
      readonly [EvidenceRecord["evidenceType"], Record<string, unknown>]
    > = [
      ["input", { source: detail.source }],
      ["tool_result", { tool: "github.get_source" }],
      ["decision", { verdict: "pass", summary: "No actionable findings." }],
      ["ci_result", { state: "success" }],
      [
        "review_publication",
        {
          repository: detail.source.repository,
          pullNumber: detail.source.pullNumber,
          headSha: detail.source.headSha
        }
      ]
    ];
    detail.evidence = reviewEvidence.map(([evidenceType, payload], index) => ({
      id: String(index + 1),
      runId: detail.id,
      stepId: null,
      evidenceType,
      payload,
      payloadHash: `review-payload-${index}`,
      previousHash: index === 0 ? null : `review-chain-${index - 1}`,
      chainHash: `review-chain-${index}`,
      createdAt: timestamp
    }));

    const evaluation = evaluateRunProofBundle(buildRunProofBundle(detail, true, timestamp));

    expect(evaluation).toMatchObject({
      score: 100,
      grade: "verified",
      dimensions: {
        coordination: 25,
        skillEngineering: 20,
        verification: 25,
        safetyAuditability: 20,
        learningReuse: 10
      },
      findings: []
    });
  });
});

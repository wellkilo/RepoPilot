import type {
  ApprovalRecord,
  EvidenceRecord,
  RunDetail,
  RunSummary,
  SkillName,
  StepRecord
} from "./index.js";

const expectedSkills: readonly SkillName[] = [
  "repository-triage",
  "root-cause-localization",
  "safe-patch-authoring",
  "verification-gate",
  "runbook-archival"
];

const terminalStepStatuses = new Set(["succeeded", "failed", "blocked", "skipped"]);

export interface RunProofBundle {
  schemaVersion: "1.0";
  generatedAt: string;
  run: RunSummary;
  steps: StepRecord[];
  approvals: ApprovalRecord[];
  evidence: EvidenceRecord[];
  integrity: {
    algorithm: "SHA-256";
    canonicalization: "canonical-json";
    chainValid: boolean;
    chainHead: string | null;
  };
}

export interface ProofBundleMetric {
  id: string;
  label: string;
  value: number;
  target: number;
  unit: "count" | "percent";
  passed: boolean;
  evidenceIds: string[];
}

export interface ProofBundleEvaluation {
  evaluatorVersion: "1.0";
  evaluatedAt: string;
  score: number;
  grade: "verified" | "partial" | "insufficient";
  dimensions: {
    coordination: number;
    skillEngineering: number;
    verification: number;
    safetyAuditability: number;
    learningReuse: number;
  };
  metrics: ProofBundleMetric[];
  findings: string[];
}

export function proofCommentMarker(runId: string): string {
  return `<!-- repopilot-proof:${runId} -->`;
}

export function renderProofComment(
  bundle: RunProofBundle,
  evaluation: ProofBundleEvaluation
): string {
  const dimensions = [
    ["Coordination", evaluation.dimensions.coordination, 25],
    ["Skill engineering", evaluation.dimensions.skillEngineering, 20],
    ["Verification", evaluation.dimensions.verification, 25],
    ["Safety and auditability", evaluation.dimensions.safetyAuditability, 20],
    ["Learning reuse", evaluation.dimensions.learningReuse, 10]
  ] as const;
  const steps =
    bundle.steps.length === 0
      ? "| — | — | — |\n"
      : `${bundle.steps
          .map(
            (step) =>
              `| \`${step.agentName}\` | \`${step.skillName}\` | ${step.status.toUpperCase()} |`
          )
          .join("\n")}\n`;
  const findings =
    evaluation.findings.length === 0
      ? "All deterministic proof gates passed."
      : evaluation.findings.map((finding) => `- ${finding}`).join("\n");
  const machineReadableSummary = {
    schemaVersion: bundle.schemaVersion,
    runId: bundle.run.id,
    score: evaluation.score,
    grade: evaluation.grade,
    chainValid: bundle.integrity.chainValid,
    chainHead: bundle.integrity.chainHead,
    steps: bundle.steps.map(({ agentName, skillName, status }) => ({
      agentName,
      skillName,
      status
    })),
    metrics: evaluation.metrics.map(({ id, value, target, passed }) => ({
      id,
      value,
      target,
      passed
    }))
  };

  return [
    proofCommentMarker(bundle.run.id),
    "## RepoPilot verification proof",
    "",
    `**${evaluation.score}/100 · ${evaluation.grade.toUpperCase()}**`,
    "",
    "| Dimension | Score |",
    "| --- | ---: |",
    ...dimensions.map(([label, score, maximum]) => `| ${label} | ${score}/${maximum} |`),
    "",
    "<details>",
    "<summary>Agent and Skill execution</summary>",
    "",
    "| Agent | Skill | Result |",
    "| --- | --- | --- |",
    steps.trimEnd(),
    "</details>",
    "",
    `- Run: \`${bundle.run.id}\``,
    `- Policy: \`${bundle.run.executionPolicy}\``,
    `- Evidence records: **${bundle.evidence.length}**`,
    `- Evidence chain: **${bundle.integrity.chainValid ? "VERIFIED" : "INVALID"}**`,
    `- SHA-256 chain head: \`${bundle.integrity.chainHead ?? "none"}\``,
    "",
    findings,
    "",
    "<details>",
    "<summary>Machine-readable proof summary</summary>",
    "",
    "```json",
    JSON.stringify(machineReadableSummary, null, 2),
    "```",
    "</details>",
    "",
    "> Proof Score measures execution-evidence completeness. Patch correctness remains gated by independent verification and repository CI.",
    "",
    "_Managed by RepoPilot. Re-running proof publication updates this comment instead of creating a duplicate._"
  ].join("\n");
}

export function buildRunProofBundle(
  detail: RunDetail,
  chainValid: boolean,
  generatedAt = new Date().toISOString()
): RunProofBundle {
  const { steps, approvals, evidence, ...run } = detail;
  const chainHead = evidence.at(-1)?.chainHash ?? null;
  return {
    schemaVersion: "1.0",
    generatedAt,
    run,
    steps,
    approvals,
    evidence,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "canonical-json",
      chainValid,
      chainHead
    }
  };
}

export function evaluateRunProofBundle(
  bundle: RunProofBundle,
  evaluatedAt = new Date().toISOString()
): ProofBundleEvaluation {
  if (bundle.run.source.type === "github_pull_request") {
    return evaluatePullRequestReviewProof(bundle, evaluatedAt);
  }

  const completedSkills = new Set(
    bundle.steps.filter((step) => step.status === "succeeded").map((step) => step.skillName)
  );
  const participatingAgents = new Set(bundle.steps.map((step) => step.agentName));
  const terminalSteps = bundle.steps.filter((step) => terminalStepStatuses.has(step.status));
  const pullRequestEvidence = bundle.evidence.filter(isPullRequestEvidence);
  const passingCiEvidence = bundle.evidence.filter(isPassingCiEvidence);
  const runbookEvidence = bundle.evidence.filter((entry) => entry.evidenceType === "runbook");
  const proofPublicationEvidence = bundle.evidence.filter(
    (entry) => entry.evidenceType === "proof_publication"
  );
  const requiredEvidenceTypes = [
    "input",
    "decision",
    "tool_result",
    "git_reference",
    "ci_result"
  ] as const;
  const coveredEvidenceTypes = requiredEvidenceTypes.filter((type) =>
    bundle.evidence.some((entry) => entry.evidenceType === type)
  );
  const unsafeMergeEvidence = bundle.evidence.filter(
    (entry) =>
      entry.evidenceType === "git_reference" &&
      entry.payload.operation === "merge_pull_request" &&
      !hasConsumedApproval(bundle.approvals, entry)
  );

  const coordination = Math.round(
    Math.min(participatingAgents.size / expectedSkills.length, 1) * 10 +
      Math.min(terminalSteps.length / expectedSkills.length, 1) * 10 +
      (bundle.run.status === "succeeded" ? 5 : 0)
  );
  const skillEngineering = Math.round(
    Math.min(completedSkills.size / expectedSkills.length, 1) * 20
  );
  const verification =
    (bundle.integrity.chainValid ? 6 : 0) +
    (pullRequestEvidence.length > 0 ? 4 : 0) +
    (passingCiEvidence.length > 0 ? 6 : 0) +
    Math.round((coveredEvidenceTypes.length / requiredEvidenceTypes.length) * 4) +
    (proofPublicationEvidence.length > 0 ? 5 : 0);
  const safetyAuditability =
    (bundle.run.executionPolicy === "pull_request_only" ? 5 : 0) +
    (unsafeMergeEvidence.length === 0 ? 10 : 0) +
    (bundle.approvals.every((approval) => approval.version > 0) ? 5 : 0);
  const learningReuse = runbookEvidence.length > 0 ? 10 : 0;
  const score = coordination + skillEngineering + verification + safetyAuditability + learningReuse;

  const metrics: ProofBundleMetric[] = [
    metric(
      "agent_participation",
      "参与协作的 Agent",
      participatingAgents.size,
      expectedSkills.length,
      "count",
      bundle.steps.map((step) => step.id)
    ),
    metric(
      "skill_completion",
      "成功完成的核心 Skill",
      completedSkills.size,
      expectedSkills.length,
      "count",
      bundle.steps.filter((step) => step.status === "succeeded").map((step) => step.id)
    ),
    metric(
      "evidence_coverage",
      "关键 Evidence 类型覆盖率",
      Math.round((coveredEvidenceTypes.length / requiredEvidenceTypes.length) * 100),
      100,
      "percent",
      bundle.evidence
        .filter((entry) =>
          requiredEvidenceTypes.includes(
            entry.evidenceType as (typeof requiredEvidenceTypes)[number]
          )
        )
        .map((entry) => entry.id)
    ),
    metric(
      "passing_ci",
      "绿色 CI 证据",
      passingCiEvidence.length,
      1,
      "count",
      passingCiEvidence.map((entry) => entry.id)
    ),
    metric(
      "pull_request",
      "Pull Request 证据",
      pullRequestEvidence.length,
      1,
      "count",
      pullRequestEvidence.map((entry) => entry.id)
    ),
    metric(
      "runbook",
      "Runbook 沉淀",
      runbookEvidence.length,
      1,
      "count",
      runbookEvidence.map((entry) => entry.id)
    ),
    metric(
      "proof_publication",
      "Pull Request Proof 发布",
      proofPublicationEvidence.length,
      1,
      "count",
      proofPublicationEvidence.map((entry) => entry.id)
    ),
    metric(
      "unsafe_merge",
      "无审批合并违规",
      unsafeMergeEvidence.length,
      0,
      "count",
      unsafeMergeEvidence.map((entry) => entry.id),
      true
    )
  ];

  const findings = [
    ...missingExpectedSkills(completedSkills).map((skill) => `缺少成功完成的 Skill：${skill}`),
    ...(bundle.integrity.chainValid ? [] : ["Evidence 哈希链验证失败"]),
    ...(pullRequestEvidence.length > 0 ? [] : ["缺少 Pull Request 创建证据"]),
    ...(passingCiEvidence.length > 0 ? [] : ["缺少绿色 CI 证据"]),
    ...(runbookEvidence.length > 0 ? [] : ["缺少运行结果到 Runbook 的经验沉淀"]),
    ...(proofPublicationEvidence.length > 0 ? [] : ["缺少 Pull Request Proof 发布证据"]),
    ...(unsafeMergeEvidence.length === 0 ? [] : ["检测到未绑定已消费审批的合并证据"])
  ];

  return {
    evaluatorVersion: "1.0",
    evaluatedAt,
    score,
    grade:
      score >= 90 && findings.length === 0 ? "verified" : score >= 60 ? "partial" : "insufficient",
    dimensions: {
      coordination,
      skillEngineering,
      verification,
      safetyAuditability,
      learningReuse
    },
    metrics,
    findings
  };
}

function evaluatePullRequestReviewProof(
  bundle: RunProofBundle,
  evaluatedAt: string
): ProofBundleEvaluation {
  if (bundle.run.source.type !== "github_pull_request") {
    throw new Error("Pull request review proof requires a github_pull_request source");
  }
  const reviewSource = bundle.run.source;
  const reviewSteps = bundle.steps.filter(
    (step) => step.agentName === "repopilot-reviewer" && step.skillName === "pull-request-review"
  );
  const successfulReviewSteps = reviewSteps.filter((step) => step.status === "succeeded");
  const sourceContextEvidence = bundle.evidence.filter(
    (entry) => entry.evidenceType === "tool_result" && entry.payload.tool === "github.get_source"
  );
  const reviewDecisionEvidence = bundle.evidence.filter(
    (entry) => entry.evidenceType === "decision"
  );
  const ciEvidence = bundle.evidence.filter((entry) => entry.evidenceType === "ci_result");
  const reviewPublicationEvidence = bundle.evidence.filter(
    (entry) =>
      entry.evidenceType === "review_publication" &&
      typeof entry.payload.repository === "string" &&
      entry.payload.repository.toLowerCase() === reviewSource.repository.toLowerCase() &&
      entry.payload.pullNumber === reviewSource.pullNumber &&
      typeof entry.payload.headSha === "string" &&
      entry.payload.headSha.toLowerCase() === reviewSource.headSha.toLowerCase()
  );
  const unsafeMutationEvidence = bundle.evidence.filter(
    (entry) =>
      entry.evidenceType === "git_reference" &&
      (entry.payload.operation === "create_pull_request" ||
        entry.payload.operation === "merge_pull_request")
  );

  const coordination =
    (reviewSteps.length > 0 ? 10 : 0) +
    (reviewSteps.some((step) => terminalStepStatuses.has(step.status)) ? 10 : 0) +
    (bundle.run.status === "succeeded" ? 5 : 0);
  const skillEngineering = successfulReviewSteps.length > 0 ? 20 : 0;
  const verification =
    (bundle.integrity.chainValid ? 6 : 0) +
    (sourceContextEvidence.length > 0 ? 4 : 0) +
    (ciEvidence.length > 0 ? 5 : 0) +
    (reviewPublicationEvidence.length > 0 ? 10 : 0);
  const safetyAuditability =
    (bundle.run.executionPolicy === "pull_request_only" ? 5 : 0) +
    (unsafeMutationEvidence.length === 0 ? 10 : 0) +
    (reviewSource.headSha.length === 40 ? 5 : 0);
  const learningReuse = reviewDecisionEvidence.length > 0 ? 10 : 0;
  const score = coordination + skillEngineering + verification + safetyAuditability + learningReuse;

  const metrics: ProofBundleMetric[] = [
    metric(
      "reviewer_participation",
      "Reviewer 参与",
      reviewSteps.length,
      1,
      "count",
      reviewSteps.map((step) => step.id)
    ),
    metric(
      "review_skill_completion",
      "PR Review Skill 完成",
      successfulReviewSteps.length,
      1,
      "count",
      successfulReviewSteps.map((step) => step.id)
    ),
    metric(
      "source_context",
      "PR 来源上下文",
      sourceContextEvidence.length,
      1,
      "count",
      sourceContextEvidence.map((entry) => entry.id)
    ),
    metric(
      "ci_observation",
      "PR Checks 证据",
      ciEvidence.length,
      1,
      "count",
      ciEvidence.map((entry) => entry.id)
    ),
    metric(
      "review_publication",
      "PR Review Comment 发布",
      reviewPublicationEvidence.length,
      1,
      "count",
      reviewPublicationEvidence.map((entry) => entry.id)
    ),
    metric(
      "unsafe_review_mutation",
      "Review Run 越权仓库写操作",
      unsafeMutationEvidence.length,
      0,
      "count",
      unsafeMutationEvidence.map((entry) => entry.id),
      true
    )
  ];
  const findings = [
    ...(reviewSteps.length > 0 ? [] : ["缺少 Reviewer Step"]),
    ...(successfulReviewSteps.length > 0 ? [] : ["缺少成功完成的 pull-request-review Skill"]),
    ...(bundle.integrity.chainValid ? [] : ["Evidence 哈希链验证失败"]),
    ...(sourceContextEvidence.length > 0 ? [] : ["缺少 Pull Request 来源上下文"]),
    ...(ciEvidence.length > 0 ? [] : ["缺少 Pull Request Checks 证据"]),
    ...(reviewDecisionEvidence.length > 0 ? [] : ["缺少结构化审查决策 Evidence"]),
    ...(reviewPublicationEvidence.length > 0
      ? []
      : ["缺少当前 head SHA 的 Review Comment 发布证据"]),
    ...(unsafeMutationEvidence.length === 0 ? [] : ["检测到 PR Review Run 的越权仓库写操作"])
  ];

  return {
    evaluatorVersion: "1.0",
    evaluatedAt,
    score,
    grade:
      score >= 90 && findings.length === 0 ? "verified" : score >= 60 ? "partial" : "insufficient",
    dimensions: {
      coordination,
      skillEngineering,
      verification,
      safetyAuditability,
      learningReuse
    },
    metrics,
    findings
  };
}

function metric(
  id: string,
  label: string,
  value: number,
  target: number,
  unit: ProofBundleMetric["unit"],
  evidenceIds: string[],
  lowerIsBetter = false
): ProofBundleMetric {
  return {
    id,
    label,
    value,
    target,
    unit,
    passed: lowerIsBetter ? value <= target : value >= target,
    evidenceIds
  };
}

function missingExpectedSkills(completedSkills: ReadonlySet<SkillName>): SkillName[] {
  return expectedSkills.filter((skill) => !completedSkills.has(skill));
}

function isPullRequestEvidence(entry: EvidenceRecord): boolean {
  return (
    entry.evidenceType === "git_reference" && entry.payload.operation === "create_pull_request"
  );
}

function isPassingCiEvidence(entry: EvidenceRecord): boolean {
  if (entry.evidenceType !== "ci_result") {
    return false;
  }
  const state = normalizeStatus(entry.payload.state);
  const verdict = normalizeStatus(entry.payload.verdict);
  const conclusion = normalizeStatus(entry.payload.conclusion);
  if (state === "success" || verdict === "pass" || conclusion === "success") {
    return true;
  }
  const checkRuns = entry.payload.checkRuns;
  return (
    Array.isArray(checkRuns) &&
    checkRuns.length > 0 &&
    checkRuns.every(
      (check) =>
        isRecord(check) &&
        normalizeStatus(check.status) === "completed" &&
        normalizeStatus(check.conclusion) === "success"
    )
  );
}

function hasConsumedApproval(approvals: ApprovalRecord[], evidence: EvidenceRecord): boolean {
  const approvalId = evidence.payload.approvalId;
  const approvalVersion = evidence.payload.approvalVersion;
  return approvals.some(
    (approval) =>
      approval.id === approvalId &&
      approval.action === "merge_pull_request" &&
      approval.status === "approved" &&
      approval.version === approvalVersion &&
      approval.consumedAt !== null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

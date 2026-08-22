import { z } from "zod";

export { assertRunTransition, canTransitionRun } from "./state-machine.js";

export const executionPolicySchema = z.literal("pull_request_only");
export type ExecutionPolicy = z.infer<typeof executionPolicySchema>;

export const runStatusSchema = z.enum([
  "queued",
  "awaiting_dispatch",
  "dispatched",
  "running",
  "awaiting_approval",
  "verifying",
  "succeeded",
  "failed",
  "cancelled"
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const stepStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "skipped"
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const agentNameSchema = z.enum([
  "repopilot-lead",
  "repopilot-locator",
  "repopilot-fixer",
  "repopilot-verifier",
  "repopilot-archivist",
  "repopilot-reviewer"
]);
export type AgentName = z.infer<typeof agentNameSchema>;

export const skillNameSchema = z.enum([
  "repository-triage",
  "root-cause-localization",
  "safe-patch-authoring",
  "verification-gate",
  "runbook-archival",
  "pull-request-review"
]);
export type SkillName = z.infer<typeof skillNameSchema>;

export const startStepSchema = z
  .object({
    runId: z.string().uuid(),
    agentName: agentNameSchema,
    skillName: skillNameSchema,
    idempotencyKey: z.string().trim().min(1).max(200)
  })
  .superRefine((input, context) => {
    const expectedAgentBySkill: Record<SkillName, AgentName> = {
      "repository-triage": "repopilot-lead",
      "root-cause-localization": "repopilot-locator",
      "safe-patch-authoring": "repopilot-fixer",
      "verification-gate": "repopilot-verifier",
      "runbook-archival": "repopilot-archivist",
      "pull-request-review": "repopilot-reviewer"
    };
    if (expectedAgentBySkill[input.skillName] !== input.agentName) {
      context.addIssue({
        code: "custom",
        path: ["agentName"],
        message: `${input.skillName} must be executed by ${expectedAgentBySkill[input.skillName]}`
      });
    }
  });
export type StartStepInput = z.infer<typeof startStepSchema>;

export const finishStepSchema = z.object({
  stepId: z.string().uuid(),
  status: z.enum(["succeeded", "failed", "blocked", "skipped"]),
  summary: z.string().trim().min(3).max(4000)
});
export type FinishStepInput = z.infer<typeof finishStepSchema>;

export const sourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("github_issue"),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    issueNumber: z.number().int().positive()
  }),
  z.object({
    type: z.literal("github_workflow_run"),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    workflowRunId: z.number().int().positive()
  }),
  z.object({
    type: z.literal("github_pull_request"),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    pullNumber: z.number().int().positive(),
    headSha: z.string().regex(/^[a-f0-9]{40}$/i)
  })
]);
export type RunSource = z.infer<typeof sourceSchema>;

export const createRunSchema = z.object({
  source: sourceSchema,
  executionPolicy: executionPolicySchema.default("pull_request_only")
});
export type CreateRunInput = z.infer<typeof createRunSchema>;

export const evidenceTypeSchema = z.enum([
  "input",
  "decision",
  "agent_message",
  "tool_call",
  "tool_result",
  "approval",
  "git_reference",
  "ci_result",
  "runbook",
  "proof_publication",
  "review_publication",
  "error"
]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const appendEvidenceSchema = z.object({
  runId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  evidenceType: evidenceTypeSchema,
  payload: z.record(z.string(), z.unknown())
});
export type AppendEvidenceInput = z.infer<typeof appendEvidenceSchema>;

export const approvalActionSchema = z.enum([
  "merge_pull_request",
  "delete_branch",
  "rollback_commit",
  "modify_permissions",
  "modify_secrets",
  "execute_high_risk_tool"
]);
export type ApprovalAction = z.infer<typeof approvalActionSchema>;

export const riskLevelSchema = z.enum(["medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const requestApprovalSchema = z.object({
  runId: z.string().uuid(),
  action: approvalActionSchema,
  riskLevel: riskLevelSchema,
  details: z.record(z.string(), z.unknown())
});
export type RequestApprovalInput = z.infer<typeof requestApprovalSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().min(1).max(2000),
  expectedVersion: z.number().int().positive()
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const runbookSearchSchema = z.object({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  query: z.string().trim().min(2).max(500),
  limit: z.number().int().min(1).max(20).default(5)
});
export type RunbookSearchInput = z.infer<typeof runbookSearchSchema>;

export const publishProofCommentSchema = z.object({
  runId: z.string().uuid(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  pullNumber: z.number().int().positive()
});
export type PublishProofCommentInput = z.infer<typeof publishProofCommentSchema>;

export interface RunSummary {
  id: string;
  source: RunSource;
  executionPolicy: ExecutionPolicy;
  status: RunStatus;
  traceId: string;
  matrixEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRecord {
  id: string;
  runId: string;
  stepId: string | null;
  evidenceType: EvidenceType;
  payload: Record<string, unknown>;
  payloadHash: string;
  previousHash: string | null;
  chainHash: string;
  createdAt: string;
}

export interface StepRecord {
  id: string;
  runId: string;
  agentName: AgentName;
  skillName: SkillName;
  status: StepStatus;
  summary: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  runId: string;
  action: ApprovalAction;
  riskLevel: RiskLevel;
  status: "pending" | "approved" | "rejected" | "expired";
  version: number;
  details: Record<string, unknown>;
  decidedBy: string | null;
  comment: string | null;
  createdAt: string;
  decidedAt: string | null;
  consumedAt: string | null;
}

export interface RunDetail extends RunSummary {
  steps: StepRecord[];
  evidence: EvidenceRecord[];
  approvals: ApprovalRecord[];
}

export {
  buildRunProofBundle,
  evaluateRunProofBundle,
  proofCommentMarker,
  renderProofComment,
  type ProofBundleEvaluation,
  type ProofBundleMetric,
  type RunProofBundle
} from "./proof.js";

export {
  pullRequestReviewFindingSchema,
  pullRequestReviewMarker,
  publishReviewCommentSchema,
  renderPullRequestReviewComment,
  reviewSeveritySchema,
  reviewVerdictSchema,
  type PullRequestReviewFinding,
  type PublishReviewCommentInput,
  type ReviewSeverity,
  type ReviewVerdict
} from "./review.js";

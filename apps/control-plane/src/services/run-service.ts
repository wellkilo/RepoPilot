import type {
  ApprovalDecisionInput,
  CreateRunInput,
  FinishStepInput,
  RequestApprovalInput,
  RunStatus,
  StartStepInput
} from "@repopilot/contracts";

import type { GitHubClient } from "../clients/github.js";
import type { MatrixClient } from "../clients/matrix.js";
import type { RepoPilotStore } from "../db.js";
import { observeOperation, recordCompletedRun, recordCompletedStep } from "../telemetry.js";

export class RunService {
  constructor(
    private readonly store: RepoPilotStore,
    private readonly github: GitHubClient,
    private readonly matrix: MatrixClient | undefined,
    private readonly allowedRepositories: ReadonlySet<string>
  ) {}

  async createAndDispatch(input: CreateRunInput, deliveryId?: string) {
    return observeOperation(
      "repopilot.run.create_and_dispatch",
      {
        "repopilot.component": "orchestration",
        "repopilot.repository": input.source.repository,
        "repopilot.source.type": input.source.type,
        "repopilot.delivery.present": deliveryId !== undefined
      },
      async () => {
        this.assertAllowedRepository(input.source.repository);
        const run = await this.store.createRun(input, { deliveryId });
        if (!run.newlyCreated) {
          return run;
        }
        try {
          const sourceContext = await this.resolveSourceContext(input);
          await this.store.appendEvidence({
            runId: run.id,
            evidenceType: "tool_result",
            payload: {
              tool: "github.get_source",
              sourceContext
            }
          });

          if (!this.matrix) {
            return this.store.transitionRun(run.id, "awaiting_dispatch");
          }

          const taskMessage = this.buildTaskMessage(run.id, input, sourceContext);
          const { eventId, roomId } = await this.matrix.dispatchTask(taskMessage);
          await this.store.attachMatrixEvent(run.id, eventId);
          await this.store.appendEvidence({
            runId: run.id,
            evidenceType: "agent_message",
            payload: {
              direction: "control-plane-to-manager",
              roomId,
              eventId,
              message: taskMessage
            }
          });
          return this.store.transitionRun(run.id, "dispatched");
        } catch (error) {
          await this.store.appendEvidence({
            runId: run.id,
            evidenceType: "error",
            payload: {
              phase: "source_resolution_or_dispatch",
              message: error instanceof Error ? error.message : "Unknown orchestration error"
            }
          });
          await this.store.transitionRun(run.id, "failed");
          throw error;
        }
      }
    );
  }

  async requestApproval(input: RequestApprovalInput) {
    const run = await this.requireRun(input.runId);
    if (run.source.type === "github_pull_request") {
      throw new Error(`Pull request review Run ${run.id} cannot request high-risk actions`);
    }
    if (run.status === "running" || run.status === "verifying") {
      await this.store.transitionRun(run.id, "awaiting_approval");
    }
    return this.store.requestApproval(input);
  }

  async decideApproval(approvalId: string, input: ApprovalDecisionInput, decidedBy: string) {
    const approval = await this.store.decideApproval(approvalId, input, decidedBy);
    const run = await this.requireRun(approval.runId);
    if (run.status === "awaiting_approval") {
      await this.store.transitionRun(
        run.id,
        approval.status === "approved" ? "running" : "cancelled"
      );
    }
    return approval;
  }

  async transition(runId: string, status: RunStatus) {
    return this.store.transitionRun(runId, status);
  }

  async startStep(input: StartStepInput) {
    const run = await this.requireRun(input.runId);
    if (run.source.type === "github_pull_request" && input.skillName !== "pull-request-review") {
      throw new Error(`Pull request review Run ${run.id} can only execute pull-request-review`);
    }
    if (run.source.type !== "github_pull_request" && input.skillName === "pull-request-review") {
      throw new Error(`Maintenance Run ${run.id} cannot execute pull-request-review`);
    }
    if (
      (input.skillName === "repository-triage" || input.skillName === "pull-request-review") &&
      run.status === "dispatched"
    ) {
      await this.store.transitionRun(run.id, "running");
    }
    if (input.skillName === "verification-gate" && run.status === "running") {
      await this.store.transitionRun(run.id, "verifying");
    }
    return this.store.startStep(input);
  }

  async finishStep(input: FinishStepInput) {
    const currentStep = await this.store.getStep(input.stepId);
    if (!currentStep) {
      throw new Error(`Step ${input.stepId} was not found`);
    }
    if (currentStep.skillName === "pull-request-review" && input.status === "succeeded") {
      const reviewRun = await this.requireRun(currentStep.runId);
      const reviewPublished = (await this.store.listEvidence(currentStep.runId)).some(
        (entry) =>
          entry.evidenceType === "review_publication" &&
          reviewRun.source.type === "github_pull_request" &&
          typeof entry.payload.repository === "string" &&
          entry.payload.repository.toLowerCase() === reviewRun.source.repository.toLowerCase() &&
          entry.payload.pullNumber === reviewRun.source.pullNumber &&
          typeof entry.payload.headSha === "string" &&
          entry.payload.headSha.toLowerCase() === reviewRun.source.headSha.toLowerCase()
      );
      if (!reviewPublished) {
        throw new Error(
          `Pull request review Step ${input.stepId} cannot succeed before its managed comment is published`
        );
      }
    }
    const result = await this.store.finishStep(input);
    const { step } = result;
    if (result.changed) {
      recordCompletedStep(step);
    }
    if (step.skillName === "pull-request-review") {
      const run = await this.requireRun(step.runId);
      if (run.status === "running") {
        const target = step.status === "succeeded" ? "succeeded" : "failed";
        if (target === "succeeded") {
          await this.store.transitionRun(step.runId, "verifying");
        }
        const completedRun = await this.store.transitionRun(step.runId, target);
        recordCompletedRun(completedRun);
      }
      return step;
    }
    if (step.skillName !== "runbook-archival") {
      return step;
    }

    const run = await this.requireRun(step.runId);
    if (run.status !== "running" && run.status !== "verifying") {
      return step;
    }
    const verification = (await this.store.listSteps(step.runId))
      .filter((candidate) => candidate.skillName === "verification-gate")
      .at(-1);
    const target =
      step.status === "succeeded" && verification?.status === "succeeded" ? "succeeded" : "failed";
    const completedRun = await this.store.transitionRun(step.runId, target);
    recordCompletedRun(completedRun);
    return step;
  }

  private async resolveSourceContext(input: CreateRunInput) {
    const [owner, repository] = input.source.repository.split("/");
    if (!owner || !repository) {
      throw new Error("Repository must use owner/name format");
    }
    if (input.source.type === "github_issue") {
      return this.github.getIssue(owner, repository, input.source.issueNumber);
    }
    if (input.source.type === "github_workflow_run") {
      return this.github.getWorkflowRun(owner, repository, input.source.workflowRunId);
    }
    const pullRequest = await this.github.getPullRequest(
      owner,
      repository,
      input.source.pullNumber
    );
    if (pullRequest.headSha.toLowerCase() !== input.source.headSha.toLowerCase()) {
      throw new Error(
        `Pull request ${input.source.repository}#${input.source.pullNumber} changed before dispatch`
      );
    }
    const files = await this.github.getPullRequestFilesPage(
      owner,
      repository,
      input.source.pullNumber,
      1
    );
    const confirmedPullRequest = await this.github.getPullRequest(
      owner,
      repository,
      input.source.pullNumber
    );
    if (confirmedPullRequest.headSha.toLowerCase() !== input.source.headSha.toLowerCase()) {
      throw new Error(
        `Pull request ${input.source.repository}#${input.source.pullNumber} changed while resolving source context`
      );
    }
    return {
      pullRequest: confirmedPullRequest,
      fileListingComplete: files.length === pullRequest.changedFiles,
      totalFiles: pullRequest.changedFiles,
      includedFileSummaries: files.length,
      files: files.map((file) => ({
        sha: file.sha,
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blobUrl: file.blobUrl
      }))
    };
  }

  private buildTaskMessage(runId: string, input: CreateRunInput, sourceContext: unknown): string {
    if (input.source.type === "github_pull_request") {
      return [
        "You are receiving a RepoPilot pull-request review run.",
        `Run ID: ${runId}`,
        `Execution policy: ${input.executionPolicy}`,
        "Mandatory policy: perform a read-only review and publish one managed general pull request comment. Do not approve, request changes, modify code, push commits, merge, delete branches, change permissions, or change secrets.",
        "",
        "Delegate this run to the repopilot-reviewer Worker.",
        "The Worker must execute pull-request-review exactly once for this head SHA.",
        "Before the Skill invocation, call repopilot_start_step with a stable idempotencyKey scoped to this run and head SHA.",
        "Read the pull request, changed files, and checks through RepoPilot MCP tools.",
        "Record material review decisions and limitations through repopilot_append_evidence.",
        "Publish the structured result with repopilot_publish_review_comment before finishing the Step.",
        "After publication, call repopilot_finish_step with an evidence-backed terminal status and summary.",
        "",
        `Source: ${JSON.stringify(input.source)}`,
        `Resolved source context: ${JSON.stringify(sourceContext)}`
      ].join("\n");
    }
    return [
      "You are receiving a RepoPilot repository-maintenance run.",
      `Run ID: ${runId}`,
      `Execution policy: ${input.executionPolicy}`,
      "Mandatory policy: create a pull request only. Do not merge, delete branches, change permissions, change secrets, or perform destructive rollback without a RepoPilot approval.",
      "",
      "Delegate this run to the repopilot-maintainers Team Leader.",
      "The Team must execute triage, localization, patching, verification, and runbook archival.",
      "Before each Skill invocation, call repopilot_start_step with a stable idempotencyKey scoped to this run.",
      "After each Skill invocation, call repopilot_finish_step with an evidence-backed terminal status and summary.",
      "Record every material decision, tool call, result, git reference, and CI result through the RepoPilot MCP evidence tools.",
      "After Runbook archival, publish the redacted run proof to the pull request with repopilot_publish_proof_comment.",
      "",
      `Source: ${JSON.stringify(input.source)}`,
      `Resolved source context: ${JSON.stringify(sourceContext)}`
    ].join("\n");
  }

  private assertAllowedRepository(repository: string): void {
    if (!this.allowedRepositories.has(repository.toLowerCase())) {
      throw new Error(`Repository ${repository} is not in GITHUB_ALLOWED_REPOSITORIES`);
    }
  }

  private async requireRun(runId: string) {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} was not found`);
    }
    return run;
  }
}

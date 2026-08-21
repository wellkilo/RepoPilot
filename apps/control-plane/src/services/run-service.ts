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
      }
    );
  }

  async requestApproval(input: RequestApprovalInput) {
    const run = await this.requireRun(input.runId);
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
    if (input.skillName === "repository-triage" && run.status === "dispatched") {
      await this.store.transitionRun(run.id, "running");
    }
    if (input.skillName === "verification-gate" && run.status === "running") {
      await this.store.transitionRun(run.id, "verifying");
    }
    return this.store.startStep(input);
  }

  async finishStep(input: FinishStepInput) {
    const result = await this.store.finishStep(input);
    const { step } = result;
    if (result.changed) {
      recordCompletedStep(step);
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
    return this.github.getWorkflowRun(owner, repository, input.source.workflowRunId);
  }

  private buildTaskMessage(runId: string, input: CreateRunInput, sourceContext: unknown): string {
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

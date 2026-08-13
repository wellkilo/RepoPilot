import type {
  ApprovalDecisionInput,
  CreateRunInput,
  RequestApprovalInput,
  RunStatus
} from "@repopilot/contracts";

import type { GitHubClient } from "../clients/github.js";
import type { MatrixClient } from "../clients/matrix.js";
import type { RepoPilotStore } from "../db.js";

export class RunService {
  constructor(
    private readonly store: RepoPilotStore,
    private readonly github: GitHubClient,
    private readonly matrix: MatrixClient | undefined,
    private readonly allowedRepositories: ReadonlySet<string>
  ) {}

  async createAndDispatch(input: CreateRunInput, deliveryId?: string) {
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
      "Record every material decision, tool call, result, git reference, and CI result through the RepoPilot MCP evidence tools.",
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

import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  appendEvidenceSchema,
  buildRunProofBundle,
  evaluateRunProofBundle,
  finishStepSchema,
  proofCommentMarker,
  publishProofCommentSchema,
  renderProofComment,
  requestApprovalSchema,
  runbookSearchSchema,
  startStepSchema,
  type RunDetail
} from "@repopilot/contracts";
import * as z from "zod/v4";

import type { GitHubClient } from "./clients/github.js";
import type { RepoPilotStore } from "./db.js";
import type { RunService } from "./services/run-service.js";
import { observeOperation } from "./telemetry.js";

const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .describe("GitHub repository in owner/name format");

function splitRepository(repository: string): { owner: string; name: string } {
  const [owner, name] = repository.split("/");
  if (!owner || !name) {
    throw new Error("Repository must use owner/name format");
  }
  return { owner, name };
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent:
      value !== null && typeof value === "object" ? (value as Record<string, unknown>) : { value }
  };
}

function observedTool<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  operation: () => Promise<T>
): Promise<T> {
  return observeOperation(
    `mcp.tool.${name}`,
    {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": name,
      "repopilot.component": "mcp",
      ...attributes
    },
    operation
  );
}

export function createRepoPilotMcpServer(dependencies: {
  store: RepoPilotStore;
  github: GitHubClient;
  runService: RunService;
  allowedRepositories: ReadonlySet<string>;
}): McpServer {
  const { store, github, runService, allowedRepositories } = dependencies;
  const assertAllowedRepository = (repository: string) => {
    if (!allowedRepositories.has(repository.toLowerCase())) {
      throw new Error(`Repository ${repository} is not in GITHUB_ALLOWED_REPOSITORIES`);
    }
  };
  const server = new McpServer({
    name: "repopilot",
    version: "0.2.0"
  });

  server.registerTool(
    "repopilot_start_step",
    {
      description:
        "Start one idempotent Agent Skill execution step and return the durable step ID. Call before running the Skill.",
      inputSchema: startStepSchema.shape
    },
    async (input) => {
      const parsed = startStepSchema.parse(input);
      return toolResult(
        await observedTool(
          "repopilot_start_step",
          {
            "repopilot.run_id": parsed.runId,
            "repopilot.agent.name": parsed.agentName,
            "repopilot.skill.name": parsed.skillName
          },
          () => runService.startStep(parsed)
        )
      );
    }
  );

  server.registerTool(
    "repopilot_finish_step",
    {
      description:
        "Finish a running Agent Skill step with an explicit succeeded, failed, blocked, or skipped outcome and evidence-backed summary.",
      inputSchema: finishStepSchema.shape
    },
    async (input) => {
      const parsed = finishStepSchema.parse(input);
      return toolResult(
        await observedTool(
          "repopilot_finish_step",
          {
            "repopilot.step_id": parsed.stepId,
            "repopilot.step.status": parsed.status
          },
          () => runService.finishStep(parsed)
        )
      );
    }
  );

  server.registerTool(
    "repopilot_append_evidence",
    {
      description:
        "Append an immutable, hash-chained evidence record for a RepoPilot run. Use after every material decision, tool call, tool result, git reference, and CI result.",
      inputSchema: appendEvidenceSchema.shape
    },
    async (input) => {
      const parsed = appendEvidenceSchema.parse(input);
      return toolResult(
        await observedTool(
          "repopilot_append_evidence",
          {
            "repopilot.run_id": parsed.runId,
            "repopilot.evidence.type": parsed.evidenceType
          },
          () => store.appendEvidence(parsed)
        )
      );
    }
  );

  server.registerTool(
    "repopilot_request_approval",
    {
      description:
        "Request human approval for merge, branch deletion, rollback, permission or secret changes, or another high-risk tool. This does not execute the action.",
      inputSchema: requestApprovalSchema.shape
    },
    async (input) => {
      const parsed = requestApprovalSchema.parse(input);
      return toolResult(
        await observedTool(
          "repopilot_request_approval",
          {
            "repopilot.run_id": parsed.runId,
            "repopilot.approval.action": parsed.action,
            "repopilot.approval.risk_level": parsed.riskLevel
          },
          () => runService.requestApproval(parsed)
        )
      );
    }
  );

  server.registerTool(
    "repopilot_search_runbooks",
    {
      description:
        "Search verified historical RepoPilot runbooks for the same repository before choosing a repair strategy.",
      inputSchema: runbookSearchSchema.shape
    },
    async (input) => {
      const parsed = runbookSearchSchema.parse(input);
      return toolResult(
        await observedTool(
          "repopilot_search_runbooks",
          {
            "repopilot.repository": parsed.repository,
            "repopilot.runbook.limit": parsed.limit
          },
          () => store.searchRunbooks(parsed)
        )
      );
    }
  );

  server.registerTool(
    "repopilot_write_runbook",
    {
      description:
        "Write the verified repair outcome as a reusable repository runbook after CI verification.",
      inputSchema: {
        repository: repositorySchema,
        title: z.string().min(3).max(200),
        summary: z.string().min(3).max(1000),
        content: z.string().min(20).max(50_000),
        sourceRunId: z.string().uuid()
      }
    },
    async (input) =>
      toolResult(
        await observedTool(
          "repopilot_write_runbook",
          {
            "repopilot.run_id": input.sourceRunId,
            "repopilot.repository": input.repository
          },
          () => store.writeRunbook(input)
        )
      )
  );

  server.registerTool(
    "github_get_issue",
    {
      description: "Read a GitHub issue from an allowed repository.",
      inputSchema: {
        repository: repositorySchema,
        issueNumber: z.number().int().positive()
      }
    },
    async ({ repository, issueNumber }) => {
      assertAllowedRepository(repository);
      const { owner, name } = splitRepository(repository);
      return toolResult(
        await observedTool(
          "github_get_issue",
          {
            "repopilot.repository": repository,
            "repopilot.issue.number": issueNumber
          },
          () => github.getIssue(owner, name, issueNumber)
        )
      );
    }
  );

  server.registerTool(
    "github_create_pull_request",
    {
      description:
        "Create a pull request. This is the highest automatic write allowed by the default pull_request_only policy.",
      inputSchema: {
        runId: z.string().uuid(),
        repository: repositorySchema,
        title: z.string().min(3).max(256),
        body: z.string().min(1).max(60_000),
        head: z.string().min(1).max(255),
        base: z.string().min(1).max(255)
      }
    },
    async ({ runId, repository, title, body, head, base }) => {
      assertAllowedRepository(repository);
      const { owner, name } = splitRepository(repository);
      return toolResult(
        await observedTool(
          "github_create_pull_request",
          {
            "repopilot.run_id": runId,
            "repopilot.repository": repository
          },
          async () => {
            const result = await github.createPullRequest({
              owner,
              repository: name,
              title,
              body,
              head,
              base
            });
            await store.appendEvidence({
              runId,
              evidenceType: "git_reference",
              payload: {
                operation: "create_pull_request",
                repository,
                head,
                base,
                pullRequest: result
              }
            });
            return result;
          }
        )
      );
    }
  );

  server.registerTool(
    "github_get_pull_request_checks",
    {
      description:
        "Read the combined commit status for a pull request and record it as CI evidence.",
      inputSchema: {
        runId: z.string().uuid(),
        repository: repositorySchema,
        pullNumber: z.number().int().positive()
      }
    },
    async ({ runId, repository, pullNumber }) => {
      assertAllowedRepository(repository);
      const { owner, name } = splitRepository(repository);
      return toolResult(
        await observedTool(
          "github_get_pull_request_checks",
          {
            "repopilot.run_id": runId,
            "repopilot.repository": repository,
            "repopilot.pull_request.number": pullNumber
          },
          async () => {
            const result = await github.getPullRequestChecks(owner, name, pullNumber);
            await store.appendEvidence({
              runId,
              evidenceType: "ci_result",
              payload: { repository, ...result }
            });
            return result;
          }
        )
      );
    }
  );

  server.registerTool(
    "repopilot_publish_proof_comment",
    {
      description:
        "Build the current redacted Proof Bundle summary and idempotently publish it as a managed pull request comment.",
      inputSchema: publishProofCommentSchema.shape
    },
    async (input) => {
      const parsed = publishProofCommentSchema.parse(input);
      assertAllowedRepository(parsed.repository);
      const detail = await store.getRunDetail(parsed.runId);
      if (!detail) {
        throw new Error(`Run ${parsed.runId} was not found`);
      }
      assertProofPublicationTarget(detail, parsed.repository, parsed.pullNumber);
      const { owner, name } = splitRepository(parsed.repository);
      return toolResult(
        await observedTool(
          "repopilot_publish_proof_comment",
          {
            "repopilot.run_id": parsed.runId,
            "repopilot.repository": parsed.repository,
            "repopilot.pull_request.number": parsed.pullNumber
          },
          async () => {
            let bundle = buildRunProofBundle(detail, await store.verifyEvidenceChain(parsed.runId));
            let evaluation = evaluateRunProofBundle(bundle);
            const marker = proofCommentMarker(parsed.runId);
            const result = await github.upsertPullRequestComment(
              owner,
              name,
              parsed.pullNumber,
              marker,
              renderProofComment(bundle, evaluation)
            );
            const publicationRecorded = detail.evidence.some(
              (entry) =>
                entry.evidenceType === "proof_publication" &&
                entry.payload.repository === parsed.repository &&
                entry.payload.pullNumber === parsed.pullNumber
            );
            if (!publicationRecorded) {
              await store.appendEvidence({
                runId: parsed.runId,
                evidenceType: "proof_publication",
                payload: {
                  operation: "publish_proof_comment",
                  repository: parsed.repository,
                  pullNumber: parsed.pullNumber,
                  proofScore: evaluation.score,
                  grade: evaluation.grade,
                  publishedChainHead: bundle.integrity.chainHead,
                  comment: result
                }
              });
              const refreshedDetail = await store.getRunDetail(parsed.runId);
              if (!refreshedDetail) {
                throw new Error(`Run ${parsed.runId} was not found after proof publication`);
              }
              bundle = buildRunProofBundle(
                refreshedDetail,
                await store.verifyEvidenceChain(parsed.runId)
              );
              evaluation = evaluateRunProofBundle(bundle);
              await github.upsertPullRequestComment(
                owner,
                name,
                parsed.pullNumber,
                marker,
                renderProofComment(bundle, evaluation)
              );
            }
            return {
              ...result,
              runId: parsed.runId,
              pullNumber: parsed.pullNumber,
              proofScore: evaluation.score,
              grade: evaluation.grade,
              chainHead: bundle.integrity.chainHead
            };
          }
        )
      );
    }
  );

  server.registerTool(
    "github_merge_pull_request",
    {
      description:
        "Merge a pull request only after a human has approved the exact merge action. Requires an approved, version-pinned RepoPilot approval.",
      inputSchema: {
        runId: z.string().uuid(),
        repository: repositorySchema,
        pullNumber: z.number().int().positive(),
        approvalId: z.string().uuid(),
        approvalVersion: z.number().int().positive(),
        commitTitle: z.string().min(1).max(256).optional()
      }
    },
    async ({ runId, repository, pullNumber, approvalId, approvalVersion, commitTitle }) => {
      assertAllowedRepository(repository);
      return toolResult(
        await observedTool(
          "github_merge_pull_request",
          {
            "repopilot.run_id": runId,
            "repopilot.repository": repository,
            "repopilot.pull_request.number": pullNumber,
            "repopilot.approval.id": approvalId
          },
          async () => {
            await store.consumeApprovedAction(
              approvalId,
              "merge_pull_request",
              approvalVersion,
              runId
            );
            const { owner, name } = splitRepository(repository);
            const result = await github.mergePullRequest({
              owner,
              repository: name,
              pullNumber,
              commitTitle
            });
            await store.appendEvidence({
              runId,
              evidenceType: "git_reference",
              payload: {
                operation: "merge_pull_request",
                repository,
                pullNumber,
                approvalId,
                approvalVersion,
                result
              }
            });
            return result;
          }
        )
      );
    }
  );

  return server;
}

export function hasPullRequestEvidence(
  evidence: Awaited<ReturnType<RepoPilotStore["listEvidence"]>>,
  repository: string,
  pullNumber: number
): boolean {
  return evidence.some((entry) => {
    if (
      entry.evidenceType !== "git_reference" ||
      entry.payload.operation !== "create_pull_request" ||
      typeof entry.payload.repository !== "string" ||
      entry.payload.repository.toLowerCase() !== repository.toLowerCase()
    ) {
      return false;
    }
    const pullRequest = entry.payload.pullRequest;
    return (
      pullRequest !== null &&
      typeof pullRequest === "object" &&
      !Array.isArray(pullRequest) &&
      (pullRequest as Record<string, unknown>).number === pullNumber
    );
  });
}

export function assertProofPublicationTarget(
  detail: RunDetail,
  repository: string,
  pullNumber: number
): void {
  if (detail.source.repository.toLowerCase() !== repository.toLowerCase()) {
    throw new Error(`Run ${detail.id} belongs to ${detail.source.repository}, not ${repository}`);
  }
  if (detail.status !== "succeeded" && detail.status !== "failed") {
    throw new Error(
      `Run ${detail.id} must be terminal before publishing proof; current status is ${detail.status}`
    );
  }
  if (!hasPullRequestEvidence(detail.evidence, repository, pullNumber)) {
    throw new Error(`Pull request ${repository}#${pullNumber} is not linked to Run ${detail.id}`);
  }
}

export async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  body: unknown,
  dependencies: {
    store: RepoPilotStore;
    github: GitHubClient;
    runService: RunService;
    allowedRepositories: ReadonlySet<string>;
  }
): Promise<void> {
  const server = createRepoPilotMcpServer(dependencies);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  response.on("close", () => {
    void transport.close();
    void server.close();
  });
  await transport.handleRequest(request, response, body);
}

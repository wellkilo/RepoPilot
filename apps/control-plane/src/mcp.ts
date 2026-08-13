import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  appendEvidenceSchema,
  requestApprovalSchema,
  runbookSearchSchema
} from "@repopilot/contracts";
import * as z from "zod/v4";

import type { GitHubClient } from "./clients/github.js";
import type { RepoPilotStore } from "./db.js";
import type { RunService } from "./services/run-service.js";

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
    version: "0.1.0"
  });

  server.registerTool(
    "repopilot_append_evidence",
    {
      description:
        "Append an immutable, hash-chained evidence record for a RepoPilot run. Use after every material decision, tool call, tool result, git reference, and CI result.",
      inputSchema: appendEvidenceSchema.shape
    },
    async (input) => toolResult(await store.appendEvidence(appendEvidenceSchema.parse(input)))
  );

  server.registerTool(
    "repopilot_request_approval",
    {
      description:
        "Request human approval for merge, branch deletion, rollback, permission or secret changes, or another high-risk tool. This does not execute the action.",
      inputSchema: requestApprovalSchema.shape
    },
    async (input) =>
      toolResult(await runService.requestApproval(requestApprovalSchema.parse(input)))
  );

  server.registerTool(
    "repopilot_search_runbooks",
    {
      description:
        "Search verified historical RepoPilot runbooks for the same repository before choosing a repair strategy.",
      inputSchema: runbookSearchSchema.shape
    },
    async (input) => toolResult(await store.searchRunbooks(runbookSearchSchema.parse(input)))
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
    async (input) => toolResult(await store.writeRunbook(input))
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
      return toolResult(await github.getIssue(owner, name, issueNumber));
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
      return toolResult(result);
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
      const result = await github.getPullRequestChecks(owner, name, pullNumber);
      await store.appendEvidence({
        runId,
        evidenceType: "ci_result",
        payload: { repository, ...result }
      });
      return toolResult(result);
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
      await store.consumeApprovedAction(approvalId, "merge_pull_request", approvalVersion, runId);
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
      return toolResult(result);
    }
  );

  return server;
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

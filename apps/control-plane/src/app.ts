import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  approvalDecisionSchema,
  createRunSchema,
  runStatusSchema,
  type CreateRunInput
} from "@repopilot/contracts";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import rawBody from "fastify-raw-body";
import { z } from "zod";

import type { GitHubClient } from "./clients/github.js";
import type { AppConfig } from "./config.js";
import type { RepoPilotStore } from "./db.js";
import { handleMcpRequest } from "./mcp.js";
import type { RunService } from "./services/run-service.js";
import { tracer } from "./telemetry.js";

interface AppDependencies {
  config: AppConfig;
  store: RepoPilotStore;
  github: GitHubClient;
  runService: RunService;
}

const githubIssueWebhookSchema = z.object({
  action: z.enum(["opened", "reopened"]),
  repository: z.object({ full_name: z.string() }),
  issue: z.object({ number: z.number().int().positive(), pull_request: z.never().optional() })
});

const githubWorkflowWebhookSchema = z.object({
  action: z.literal("completed"),
  repository: z.object({ full_name: z.string() }),
  workflow_run: z.object({
    id: z.number().int().positive(),
    conclusion: z.string().nullable()
  })
});

const uuidParamsSchema = z.object({ id: z.string().uuid() });

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const { config, store, github, runService } = dependencies;
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info"
    },
    genReqId: () => randomUUID()
  });

  await app.register(cors, {
    origin: config.nodeEnv === "production" ? false : true
  });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const message = error instanceof Error ? error.message : "Unknown error";
    const conflict =
      message.includes("transition") ||
      message.includes("conflicted") ||
      message.toLowerCase().includes("approval");
    const notFound = message.includes("was not found");
    return reply.code(notFound ? 404 : conflict ? 409 : 400).send({
      error: notFound ? "not_found" : conflict ? "conflict" : "invalid_request",
      message
    });
  });

  app.addHook("onRequest", (request, _reply, done) => {
    const span = tracer.startSpan(`${request.method} ${request.routeOptions.url ?? request.url}`, {
      attributes: {
        "http.request.method": request.method,
        "url.path": request.url,
        "repopilot.request_id": request.id
      }
    });
    request.raw.once("close", () => span.end());
    done();
  });

  app.get("/health", async () => {
    await store.ping();
    return {
      status: "ok",
      database: "connected",
      matrix: config.matrix ? "configured" : "not_configured",
      github: config.githubToken ? "configured" : "not_configured"
    };
  });

  app.get("/api/v1/runs", async () => ({ runs: await store.listRuns() }));

  app.get<{ Params: { id: string } }>("/api/v1/runs/:id", async (request, reply) => {
    const { id } = uuidParamsSchema.parse(request.params);
    const run = await store.getRunDetail(id);
    if (!run) {
      return reply.code(404).send({ error: "run_not_found" });
    }
    return { run, evidenceChainValid: await store.verifyEvidenceChain(id) };
  });

  app.post<{ Body: CreateRunInput }>(
    "/api/v1/runs",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["source"],
          properties: {
            source: {
              oneOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "repository", "issueNumber"],
                  properties: {
                    type: { const: "github_issue" },
                    repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
                    issueNumber: { type: "integer", minimum: 1 }
                  }
                },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "repository", "workflowRunId"],
                  properties: {
                    type: { const: "github_workflow_run" },
                    repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
                    workflowRunId: { type: "integer", minimum: 1 }
                  }
                }
              ]
            },
            executionPolicy: { const: "pull_request_only", default: "pull_request_only" }
          }
        }
      }
    },
    async (request, reply) => {
      const input = createRunSchema.parse(request.body);
      const run = await runService.createAndDispatch(input);
      return reply.code(202).send({ run });
    }
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/runs/:id/status",
    async (request) => {
      const { id } = uuidParamsSchema.parse(request.params);
      const body = z.object({ status: runStatusSchema }).parse(request.body);
      return { run: await runService.transition(id, body.status) };
    }
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/approvals/:id/decision",
    async (request) => {
      const { id } = uuidParamsSchema.parse(request.params);
      const input = approvalDecisionSchema.parse(request.body);
      const decidedBy = request.headers["x-repopilot-actor"];
      if (typeof decidedBy !== "string" || decidedBy.trim() === "") {
        throw new Error("X-RepoPilot-Actor is required for approval decisions");
      }
      return { approval: await runService.decideApproval(id, input, decidedBy) };
    }
  );

  app.post("/api/v1/webhooks/github", { config: { rawBody: true } }, async (request, reply) => {
    if (!config.githubWebhookSecret) {
      return reply.code(503).send({ error: "github_webhook_not_configured" });
    }
    const signature = request.headers["x-hub-signature-256"];
    const event = request.headers["x-github-event"];
    const deliveryId = request.headers["x-github-delivery"];
    if (
      typeof signature !== "string" ||
      typeof event !== "string" ||
      typeof deliveryId !== "string" ||
      typeof request.rawBody !== "string" ||
      !github.verifyWebhookSignature(request.rawBody, signature, config.githubWebhookSecret)
    ) {
      return reply.code(401).send({ error: "invalid_webhook_signature" });
    }

    let input: CreateRunInput | null = null;
    if (event === "issues") {
      const payload = githubIssueWebhookSchema.safeParse(request.body);
      if (payload.success) {
        input = {
          source: {
            type: "github_issue",
            repository: payload.data.repository.full_name,
            issueNumber: payload.data.issue.number
          },
          executionPolicy: "pull_request_only"
        };
      }
    } else if (event === "workflow_run") {
      const payload = githubWorkflowWebhookSchema.safeParse(request.body);
      if (payload.success && payload.data.workflow_run.conclusion === "failure") {
        input = {
          source: {
            type: "github_workflow_run",
            repository: payload.data.repository.full_name,
            workflowRunId: payload.data.workflow_run.id
          },
          executionPolicy: "pull_request_only"
        };
      }
    }

    if (!input) {
      return reply.code(202).send({ accepted: false, reason: "event_not_actionable" });
    }
    const run = await runService.createAndDispatch(input, deliveryId);
    return reply.code(202).send({ accepted: true, run });
  });

  app.post("/mcp", async (request, reply) => {
    reply.hijack();
    await handleMcpRequest(request.raw, reply.raw, request.body, {
      store,
      github,
      runService,
      allowedRepositories: config.allowedRepositories
    });
  });
  app.get("/mcp", async (_request, reply) =>
    reply
      .code(405)
      .header("Allow", "POST")
      .send({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null
      })
  );
  app.delete("/mcp", async (_request, reply) =>
    reply
      .code(405)
      .header("Allow", "POST")
      .send({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null
      })
  );

  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const consoleRoot = path.resolve(currentDirectory, "../../console/dist");
  await app.register(fastifyStatic, {
    root: path.join(consoleRoot, "assets"),
    prefix: "/assets/",
    wildcard: true
  });
  const sendConsoleIndex = async (reply: FastifyReply) => {
    const index = await readFile(path.join(consoleRoot, "index.html"), "utf8");
    return reply.type("text/html; charset=utf-8").send(index);
  };
  app.get("/", async (_request, reply) => sendConsoleIndex(reply));
  app.get("/*", async (request, reply) => {
    if (request.url.startsWith("/api/") || request.url === "/mcp") {
      return reply.code(404).send({ error: "not_found" });
    }
    return sendConsoleIndex(reply);
  });

  return app;
}

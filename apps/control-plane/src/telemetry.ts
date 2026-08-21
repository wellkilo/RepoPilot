import { metrics, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import type { RunSummary, StepRecord } from "@repopilot/contracts";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

export function initializeTelemetry(config: {
  serviceName: string;
  endpoint?: string;
}): TelemetryHandle {
  if (!config.endpoint) {
    process.env.OTEL_TRACES_EXPORTER = "none";
    process.env.OTEL_METRICS_EXPORTER = "none";
  } else {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = config.endpoint.replace(/\/$/, "");
    process.env.OTEL_METRICS_EXPORTER = "otlp";
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: "0.2.0"
    }),
    ...(config.endpoint
      ? {
          traceExporter: new OTLPTraceExporter({
            url: `${config.endpoint.replace(/\/$/, "")}/v1/traces`
          })
        }
      : {})
  });
  sdk.start();
  return {
    async shutdown() {
      await sdk.shutdown();
    }
  };
}

export const tracer = trace.getTracer("repopilot-control-plane", "0.2.0");
const meter = metrics.getMeter("repopilot-control-plane", "0.2.0");
const operations = meter.createCounter("repopilot.operations", {
  description: "RepoPilot domain operations grouped by component and outcome"
});
const operationDuration = meter.createHistogram("repopilot.operation.duration", {
  description: "RepoPilot domain operation duration",
  unit: "ms"
});
const skillExecutions = meter.createCounter("repopilot.skill.executions", {
  description: "Completed Agent Skill executions grouped by Agent, Skill, and outcome"
});
const skillDuration = meter.createHistogram("repopilot.skill.duration", {
  description: "Durable Agent Skill execution duration",
  unit: "ms"
});
const completedRuns = meter.createCounter("repopilot.runs.completed", {
  description: "Completed RepoPilot runs grouped by terminal outcome"
});
const runDuration = meter.createHistogram("repopilot.run.duration", {
  description: "End-to-end RepoPilot run duration",
  unit: "ms"
});

export async function observeOperation<T>(
  spanName: string,
  attributes: Attributes,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      operations.add(1, { ...attributes, "repopilot.outcome": "success" });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      span.recordException(error instanceof Error ? error : new Error(message));
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      operations.add(1, { ...attributes, "repopilot.outcome": "failure" });
      throw error;
    } finally {
      operationDuration.record(performance.now() - startedAt, attributes);
      span.end();
    }
  });
}

export function recordCompletedStep(step: StepRecord): void {
  if (!step.startedAt || !step.endedAt) {
    return;
  }
  const startedAt = new Date(step.startedAt);
  const endedAt = new Date(step.endedAt);
  const attributes = {
    "gen_ai.operation.name": "execute_agent_skill",
    "repopilot.component": "agentteams",
    "repopilot.run_id": step.runId,
    "repopilot.step_id": step.id,
    "repopilot.agent.name": step.agentName,
    "repopilot.skill.name": step.skillName,
    "repopilot.step.status": step.status
  };
  const span = tracer.startSpan(`agent.skill.${step.skillName}`, {
    attributes,
    startTime: startedAt
  });
  if (step.status === "failed" || step.status === "blocked") {
    span.setStatus({ code: SpanStatusCode.ERROR, message: step.summary ?? step.status });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end(endedAt);
  skillExecutions.add(1, attributes);
  skillDuration.record(endedAt.getTime() - startedAt.getTime(), attributes);
}

export function recordCompletedRun(run: RunSummary): void {
  if (!["succeeded", "failed", "cancelled"].includes(run.status)) {
    return;
  }
  const startedAt = new Date(run.createdAt);
  const endedAt = new Date(run.updatedAt);
  const attributes = {
    "repopilot.component": "orchestration",
    "repopilot.run_id": run.id,
    "repopilot.repository": run.source.repository,
    "repopilot.run.status": run.status,
    "repopilot.execution.policy": run.executionPolicy
  };
  const span = tracer.startSpan("repopilot.run", {
    attributes,
    startTime: startedAt
  });
  span.setStatus({
    code: run.status === "succeeded" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    message: run.status
  });
  span.end(endedAt);
  completedRuns.add(1, attributes);
  runDuration.record(endedAt.getTime() - startedAt.getTime(), attributes);
}

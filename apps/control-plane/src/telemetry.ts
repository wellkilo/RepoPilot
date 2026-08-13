import { trace } from "@opentelemetry/api";
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
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: "0.1.0"
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

export const tracer = trace.getTracer("repopilot-control-plane", "0.1.0");

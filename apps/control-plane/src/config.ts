import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres://")),
  GITHUB_WEBHOOK_SECRET: optionalSecret,
  GITHUB_TOKEN: optionalSecret,
  GITHUB_ALLOWED_REPOSITORIES: z.string().default("wellkilo/repopilot-testbed"),
  AGENTTEAMS_MATRIX_URL: optionalSecret,
  AGENTTEAMS_MATRIX_DOMAIN: optionalSecret,
  AGENTTEAMS_ADMIN_USER: z.string().default("admin"),
  AGENTTEAMS_ADMIN_PASSWORD: optionalSecret,
  AGENTTEAMS_MANAGER_USER: z.string().default("manager"),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalSecret,
  OTEL_SERVICE_NAME: z.string().default("repopilot-control-plane")
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  githubWebhookSecret?: string;
  githubToken?: string;
  allowedRepositories: ReadonlySet<string>;
  matrix?: {
    baseUrl: string;
    domain: string;
    adminUser: string;
    adminPassword: string;
    managerUser: string;
  };
  otelEndpoint?: string;
  serviceName: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);
  const allowedRepositories = new Set(
    parsed.GITHUB_ALLOWED_REPOSITORIES.split(",")
      .map((repository) => repository.trim().toLowerCase())
      .filter(Boolean)
  );

  const matrix =
    parsed.AGENTTEAMS_MATRIX_URL && parsed.AGENTTEAMS_ADMIN_PASSWORD
      ? {
          baseUrl: parsed.AGENTTEAMS_MATRIX_URL.replace(/\/$/, ""),
          domain: parsed.AGENTTEAMS_MATRIX_DOMAIN ?? new URL(parsed.AGENTTEAMS_MATRIX_URL).host,
          adminUser: parsed.AGENTTEAMS_ADMIN_USER,
          adminPassword: parsed.AGENTTEAMS_ADMIN_PASSWORD,
          managerUser: parsed.AGENTTEAMS_MANAGER_USER
        }
      : undefined;

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    githubWebhookSecret: parsed.GITHUB_WEBHOOK_SECRET,
    githubToken: parsed.GITHUB_TOKEN,
    allowedRepositories,
    matrix,
    otelEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: parsed.OTEL_SERVICE_NAME
  };
}

import { GitHubClient } from "./clients/github.js";
import { MatrixClient } from "./clients/matrix.js";
import { loadConfig } from "./config.js";
import { RepoPilotStore } from "./db.js";
import { RunService } from "./services/run-service.js";
import { initializeTelemetry } from "./telemetry.js";

const config = loadConfig();
const telemetry = initializeTelemetry({
  serviceName: config.serviceName,
  endpoint: config.otelEndpoint
});

const { buildApp } = await import("./app.js");
const store = new RepoPilotStore(config.databaseUrl);
const github = new GitHubClient(config.githubToken);
const matrix = config.matrix ? new MatrixClient(config.matrix) : undefined;
const runService = new RunService(store, github, matrix, config.allowedRepositories);
const app = await buildApp({ config, store, github, runService });

const shutdown = async () => {
  await app.close();
  await store.close();
  await telemetry.shutdown();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await app.listen({ host: config.host, port: config.port });

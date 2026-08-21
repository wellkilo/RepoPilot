import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(repositoryRoot, "artifacts", "evaluation");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packages = [
  { name: "contracts", selector: "@repopilot/contracts" },
  { name: "control-plane", selector: "@repopilot/control-plane" },
  { name: "console", selector: "@repopilot/console" }
];

await mkdir(outputDirectory, { recursive: true });
await run(pnpm, ["--filter", "@repopilot/contracts", "build"]);

const results = [];
let failed = false;
for (const target of packages) {
  const outputPath = path.join(outputDirectory, `${target.name}.vitest.json`);
  const exitCode = await run(
    pnpm,
    [
      "--filter",
      target.selector,
      "exec",
      "vitest",
      "run",
      "--reporter=json",
      `--outputFile=${outputPath}`
    ],
    false
  );
  const report = JSON.parse(await readFile(outputPath, "utf8"));
  results.push({
    package: target.selector,
    tests: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    pending: report.numPendingTests,
    success: report.success,
    startTime: new Date(report.startTime).toISOString()
  });
  failed ||= exitCode !== 0 || report.success !== true;
}

const totals = results.reduce(
  (summary, result) => ({
    tests: summary.tests + result.tests,
    passed: summary.passed + result.passed,
    failed: summary.failed + result.failed,
    pending: summary.pending + result.pending
  }),
  { tests: 0, passed: 0, failed: 0, pending: 0 }
);
const report = {
  schemaVersion: "1.0",
  layer: "control-plane-reliability",
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch
  },
  packages: results,
  totals,
  metrics: {
    testPassRatePercent:
      totals.tests === 0 ? 0 : Number(((totals.passed / totals.tests) * 100).toFixed(2)),
    failedTests: totals.failed,
    pendingTests: totals.pending
  },
  scope:
    "Deterministic control-plane contracts only. This report does not claim model or patch-quality performance."
};
const reportPath = path.join(outputDirectory, "control-plane-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(
  `Reliability benchmark: ${totals.passed}/${totals.tests} tests passed. Report: ${reportPath}\n`
);

if (failed) {
  process.exitCode = 1;
}

function run(command, arguments_, rejectOnFailure = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const exitCode = code ?? 1;
      if (rejectOnFailure && exitCode !== 0) {
        reject(new Error(`${command} exited with ${exitCode}${signal ? ` (${signal})` : ""}`));
        return;
      }
      resolve(exitCode);
    });
  });
}

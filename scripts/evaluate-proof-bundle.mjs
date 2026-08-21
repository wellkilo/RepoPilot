import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument) {
  throw new Error("Usage: pnpm evaluate <proof-bundle.json> [evaluation-report.json]");
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const contractsModule = pathToFileURL(
  path.join(repositoryRoot, "packages", "contracts", "dist", "proof.js")
).href;
const { evaluateRunProofBundle } = await import(contractsModule);
const inputPath = path.resolve(inputArgument);
const raw = JSON.parse(await readFile(inputPath, "utf8"));
const bundle = raw.bundle ?? raw;
const evaluation = evaluateRunProofBundle(bundle);
const report = {
  source: path.basename(inputPath),
  ...evaluation
};

if (outputArgument) {
  const outputPath = path.resolve(outputArgument);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Evaluation written to ${outputPath}\n`);
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (evaluation.grade === "insufficient") {
  process.exitCode = 2;
}

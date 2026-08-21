import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(repositoryRoot, "skills", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const requiredFields = [
  "name",
  "version",
  "type",
  "path",
  "invokedBy",
  "inputs",
  "outputs",
  "invocationConditions",
  "dependencies",
  "failureHandling",
  "permissions",
  "verification"
];

if (manifest.schemaVersion !== "1.0" || !Array.isArray(manifest.skills)) {
  throw new Error("Skill manifest must use schemaVersion 1.0 and contain a skills array");
}

const names = new Set();
for (const skill of manifest.skills) {
  for (const field of requiredFields) {
    const value = skill[field];
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      throw new Error(`Skill ${skill.name ?? "<unknown>"} is missing ${field}`);
    }
  }
  if (names.has(skill.name)) {
    throw new Error(`Duplicate Skill name: ${skill.name}`);
  }
  names.add(skill.name);

  const skillPath = path.join(repositoryRoot, "skills", skill.path);
  const content = await readFile(skillPath, "utf8");
  const requiredSections = [
    "## Inputs",
    "## Outputs",
    "## Invocation Conditions",
    "## Dependencies",
    "## Failure Handling",
    "## Permission and Safety Boundary",
    "## Reuse Value"
  ];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      throw new Error(`${skill.path} is missing ${section}`);
    }
  }
  if (!content.includes(`name: ${skill.name}`) || !content.includes(`version: ${skill.version}`)) {
    throw new Error(`${skill.path} metadata does not match the release manifest`);
  }
}

const teamManifest = await readFile(
  path.join(repositoryRoot, "deploy", "agentteams", "repopilot-team.yaml"),
  "utf8"
);
for (const skill of manifest.skills) {
  if (!teamManifest.includes(`- ${skill.name}`)) {
    throw new Error(`${skill.name} is not bound to an AgentTeams Worker`);
  }
}

process.stdout.write(
  `Validated ${manifest.skills.length} versioned Skills for AgentTeams ${manifest.compatibility.agentTeams}.\n`
);

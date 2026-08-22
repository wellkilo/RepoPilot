import { describe, expect, it } from "vitest";

import type { RunSummary } from "@repopilot/contracts";

import { sourceLabel, statusLabels } from "./App";

const baseRun: RunSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  source: {
    type: "github_issue",
    repository: "wellkilo/repopilot-testbed",
    issueNumber: 1
  },
  executionPolicy: "pull_request_only",
  status: "awaiting_approval",
  traceId: "a".repeat(32),
  matrixEventId: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z"
};

describe("RepoPilot console labels", () => {
  it("renders a human-recognizable GitHub issue source", () => {
    expect(sourceLabel(baseRun)).toBe("wellkilo/repopilot-testbed · Issue #1");
  });

  it("uses an explicit approval status label", () => {
    expect(statusLabels.awaiting_approval).toBe("待审批");
  });

  it("renders failed workflow sources distinctly", () => {
    expect(
      sourceLabel({
        ...baseRun,
        source: {
          type: "github_workflow_run",
          repository: "wellkilo/repopilot-testbed",
          workflowRunId: 42
        }
      })
    ).toBe("wellkilo/repopilot-testbed · Workflow #42");
  });

  it("renders pull request review sources distinctly", () => {
    expect(
      sourceLabel({
        ...baseRun,
        source: {
          type: "github_pull_request",
          repository: "wellkilo/repopilot-testbed",
          pullNumber: 7,
          headSha: "a".repeat(40)
        }
      })
    ).toBe("wellkilo/repopilot-testbed · PR #7");
  });
});

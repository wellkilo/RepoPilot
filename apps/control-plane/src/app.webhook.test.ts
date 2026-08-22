import { describe, expect, it } from "vitest";

import { createRunInputFromGitHubWebhook } from "./app.js";

const headSha = "a".repeat(40);

function pullRequestPayload(action: string, draft = false) {
  return {
    action,
    repository: { full_name: "wellkilo/repopilot-testbed" },
    pull_request: {
      number: 7,
      draft,
      head: { sha: headSha }
    }
  };
}

describe("GitHub pull_request webhook contract", () => {
  it.each(["opened", "reopened", "synchronize", "ready_for_review"])(
    "creates a review run for %s",
    (action) => {
      expect(createRunInputFromGitHubWebhook("pull_request", pullRequestPayload(action))).toEqual({
        source: {
          type: "github_pull_request",
          repository: "wellkilo/repopilot-testbed",
          pullNumber: 7,
          headSha
        },
        executionPolicy: "pull_request_only"
      });
    }
  );

  it("ignores draft and non-actionable pull request events", () => {
    expect(
      createRunInputFromGitHubWebhook("pull_request", pullRequestPayload("opened", true))
    ).toBeNull();
    expect(
      createRunInputFromGitHubWebhook("pull_request", pullRequestPayload("closed"))
    ).toBeNull();
  });

  it("rejects malformed head SHAs", () => {
    expect(
      createRunInputFromGitHubWebhook("pull_request", {
        ...pullRequestPayload("opened"),
        pull_request: {
          ...pullRequestPayload("opened").pull_request,
          head: { sha: "main" }
        }
      })
    ).toBeNull();
  });
});

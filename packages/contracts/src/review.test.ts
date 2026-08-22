import { describe, expect, it } from "vitest";

import {
  publishReviewCommentSchema,
  pullRequestReviewMarker,
  renderPullRequestReviewComment
} from "./index.js";

const input = {
  runId: "00000000-0000-4000-8000-000000000001",
  repository: "wellkilo/repopilot-testbed",
  pullNumber: 7,
  headSha: "a".repeat(40),
  verdict: "needs_attention" as const,
  summary: "The change needs one focused correction before it is ready.",
  findings: [
    {
      severity: "high" as const,
      title: "Zero is treated as missing",
      body: "Use a nullish fallback so a valid zero score is preserved.",
      path: "src/score.ts",
      line: 18
    }
  ]
};

describe("pull request review contract", () => {
  it("validates and renders a managed, read-only review comment", () => {
    const parsed = publishReviewCommentSchema.parse(input);
    const comment = renderPullRequestReviewComment(parsed);

    expect(comment).toContain(pullRequestReviewMarker);
    expect(comment).toContain("NEEDS ATTENTION");
    expect(comment).toContain("`src/score.ts`:18");
    expect(comment).toContain("does not approve, request changes, modify code, or merge");
  });

  it("rejects non-SHA revisions and oversized finding sets", () => {
    expect(() => publishReviewCommentSchema.parse({ ...input, headSha: "main" })).toThrow();
    expect(() =>
      publishReviewCommentSchema.parse({
        ...input,
        findings: Array.from({ length: 21 }, () => input.findings[0])
      })
    ).toThrow();
  });
});

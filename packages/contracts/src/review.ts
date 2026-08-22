import { z } from "zod";

export const reviewVerdictSchema = z.enum(["pass", "needs_attention", "blocked"]);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const reviewSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export type ReviewSeverity = z.infer<typeof reviewSeveritySchema>;

export const pullRequestReviewFindingSchema = z.object({
  severity: reviewSeveritySchema,
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(2000),
  path: z.string().trim().min(1).max(500).optional(),
  line: z.number().int().positive().optional()
});
export type PullRequestReviewFinding = z.infer<typeof pullRequestReviewFindingSchema>;

export const publishReviewCommentSchema = z.object({
  runId: z.string().uuid(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  pullNumber: z.number().int().positive(),
  headSha: z.string().regex(/^[a-f0-9]{40}$/i),
  verdict: reviewVerdictSchema,
  summary: z.string().trim().min(3).max(2000),
  findings: z.array(pullRequestReviewFindingSchema).max(20)
});
export type PublishReviewCommentInput = z.infer<typeof publishReviewCommentSchema>;

export const pullRequestReviewMarker = "<!-- repopilot-review -->";

const verdictLabels: Record<ReviewVerdict, string> = {
  pass: "PASS",
  needs_attention: "NEEDS ATTENTION",
  blocked: "BLOCKED"
};

const severityLabels: Record<ReviewSeverity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO"
};

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, "<br />");
}

function renderLocation(finding: PullRequestReviewFinding): string {
  if (!finding.path) {
    return "General";
  }
  const escapedPath = `\`${finding.path.replaceAll("`", "\\`")}\``;
  return finding.line ? `${escapedPath}:${finding.line}` : escapedPath;
}

export function renderPullRequestReviewComment(input: PublishReviewCommentInput): string {
  const findings =
    input.findings.length === 0
      ? ["No actionable findings were identified for this revision."]
      : [
          "| Severity | Finding | Location | Details |",
          "| --- | --- | --- | --- |",
          ...input.findings.map(
            (finding) =>
              `| ${severityLabels[finding.severity]} | ${escapeTableCell(finding.title)} | ${renderLocation(finding)} | ${escapeTableCell(finding.body)} |`
          )
        ];

  return [
    pullRequestReviewMarker,
    "## RepoPilot PR Review",
    "",
    `**Verdict:** ${verdictLabels[input.verdict]}`,
    `**Reviewed revision:** \`${input.headSha}\``,
    "",
    input.summary,
    "",
    "### Findings",
    "",
    ...findings,
    "",
    "> This is an automated, read-only review comment. It does not approve, request changes, modify code, or merge the pull request.",
    "",
    "_Managed by RepoPilot. A new commit updates this comment instead of creating a duplicate._"
  ].join("\n");
}

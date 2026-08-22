import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GitHubClient } from "./github.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHubClient webhook verification", () => {
  it("accepts the matching HMAC SHA-256 signature", () => {
    const client = new GitHubClient(undefined);
    const body = '{"action":"opened"}';
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

    expect(client.verifyWebhookSignature(body, signature, "secret")).toBe(true);
  });

  it("rejects a malformed or mismatched signature", () => {
    const client = new GitHubClient(undefined);
    expect(client.verifyWebhookSignature("{}", "invalid", "secret")).toBe(false);
    expect(client.verifyWebhookSignature("{}", `sha256=${"0".repeat(64)}`, "secret")).toBe(false);
  });
});

describe("GitHubClient proof comment publication", () => {
  it("creates a comment when the proof marker does not exist", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            html_url: "https://github.com/acme/repo/pull/7#issuecomment-42"
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GitHubClient(
      "token",
      "https://api.example.test"
    ).upsertPullRequestComment("acme", "repo", 7, "<!-- repopilot-proof:run -->", "proof");

    expect(result).toMatchObject({ id: 42, action: "created" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.test/repos/acme/repo/issues/7/comments",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "proof" }) })
    );
  });

  it("updates the existing marked comment instead of duplicating it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 42,
              body: "<!-- repopilot-proof:run -->\nold",
              html_url: "https://github.com/acme/repo/pull/7#issuecomment-42"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            html_url: "https://github.com/acme/repo/pull/7#issuecomment-42"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GitHubClient(
      "token",
      "https://api.example.test"
    ).upsertPullRequestComment("acme", "repo", 7, "<!-- repopilot-proof:run -->", "new proof");

    expect(result).toMatchObject({ id: 42, action: "updated" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.test/repos/acme/repo/issues/comments/42",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ body: "new proof" }) })
    );
  });

  it("finds a managed comment beyond the first result page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body: "unrelated comment",
      html_url: `https://github.com/acme/repo/pull/7#issuecomment-${index + 1}`
    }));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 101,
              body: "<!-- repopilot-review -->\nold review",
              html_url: "https://github.com/acme/repo/pull/7#issuecomment-101"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 101,
            html_url: "https://github.com/acme/repo/pull/7#issuecomment-101"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GitHubClient(
      "token",
      "https://api.example.test"
    ).upsertPullRequestComment("acme", "repo", 7, "<!-- repopilot-review -->", "new review");

    expect(result).toMatchObject({ id: 101, action: "updated" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.test/repos/acme/repo/issues/7/comments?per_page=100&page=2",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.example.test/repos/acme/repo/issues/comments/101",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("GitHubClient pull request review reads", () => {
  it("maps pull request metadata and changed file patches", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number: 7,
            title: "Preserve zero scores",
            body: "Fixes fallback behavior.",
            state: "open",
            draft: false,
            html_url: "https://github.com/acme/repo/pull/7",
            base: { ref: "main", sha: "b".repeat(40) },
            head: { ref: "fix/zero", sha: "a".repeat(40) },
            user: { login: "octocat" },
            changed_files: 1,
            additions: 4,
            deletions: 1
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              sha: "c".repeat(40),
              filename: "src/score.ts",
              status: "modified",
              additions: 4,
              deletions: 1,
              changes: 5,
              patch: "@@ -1 +1 @@",
              blob_url: "https://github.com/acme/repo/blob/a/src/score.ts"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new GitHubClient("token", "https://api.example.test");

    await expect(client.getPullRequest("acme", "repo", 7)).resolves.toMatchObject({
      number: 7,
      headSha: "a".repeat(40),
      changedFiles: 1
    });
    await expect(client.listPullRequestFiles("acme", "repo", 7)).resolves.toEqual([
      expect.objectContaining({
        filename: "src/score.ts",
        patch: "@@ -1 +1 @@"
      })
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.test/repos/acme/repo/pulls/7/files?per_page=100&page=1",
      expect.any(Object)
    );
  });
});

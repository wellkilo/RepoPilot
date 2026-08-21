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
});

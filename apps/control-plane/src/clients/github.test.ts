import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { GitHubClient } from "./github.js";

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

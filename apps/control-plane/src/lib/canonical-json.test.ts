import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json.js";

describe("canonicalJson", () => {
  it("sorts nested object keys while retaining array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [2, 1] })).toBe(
      '{"a":{"b":3,"y":2},"list":[2,1],"z":1}'
    );
  });

  it("produces the same digest for equivalent objects", () => {
    const first = createHash("sha256")
      .update(canonicalJson({ b: 2, a: 1 }))
      .digest("hex");
    const second = createHash("sha256")
      .update(canonicalJson({ a: 1, b: 2 }))
      .digest("hex");

    expect(first).toBe(second);
  });
});

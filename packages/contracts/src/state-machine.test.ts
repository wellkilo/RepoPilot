import { describe, expect, it } from "vitest";

import { assertRunTransition, canTransitionRun } from "./state-machine.js";

describe("run state machine", () => {
  it("allows the safe pull-request verification path", () => {
    expect(canTransitionRun("queued", "dispatched")).toBe(true);
    expect(canTransitionRun("dispatched", "running")).toBe(true);
    expect(canTransitionRun("running", "verifying")).toBe(true);
    expect(canTransitionRun("verifying", "succeeded")).toBe(true);
  });

  it("rejects skipping directly from queued to succeeded", () => {
    expect(() => assertRunTransition("queued", "succeeded")).toThrow(
      "Invalid run transition: queued -> succeeded"
    );
  });

  it("treats terminal states as immutable", () => {
    expect(canTransitionRun("succeeded", "running")).toBe(false);
    expect(canTransitionRun("failed", "queued")).toBe(false);
    expect(canTransitionRun("cancelled", "running")).toBe(false);
  });
});

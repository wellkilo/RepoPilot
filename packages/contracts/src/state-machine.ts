import type { RunStatus } from "./index.js";

const allowedTransitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ["awaiting_dispatch", "dispatched", "cancelled", "failed"],
  awaiting_dispatch: ["dispatched", "cancelled", "failed"],
  dispatched: ["running", "cancelled", "failed"],
  running: ["awaiting_approval", "verifying", "cancelled", "failed"],
  awaiting_approval: ["running", "verifying", "cancelled", "failed"],
  verifying: ["awaiting_approval", "succeeded", "failed"],
  succeeded: [],
  failed: [],
  cancelled: []
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid run transition: ${from} -> ${to}`);
  }
}

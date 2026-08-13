import type { RunDetail, RunSummary } from "@repopilot/contracts";

interface RunListResponse {
  runs: RunSummary[];
}

interface RunDetailResponse {
  run: RunDetail;
  evidenceChainValid: boolean;
}

export async function listRuns(signal?: AbortSignal): Promise<RunSummary[]> {
  const response = await fetch("/api/v1/runs", { signal });
  if (!response.ok) {
    throw new Error(`无法读取运行记录：HTTP ${response.status}`);
  }
  return ((await response.json()) as RunListResponse).runs;
}

export async function getRun(runId: string, signal?: AbortSignal): Promise<RunDetailResponse> {
  const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}`, { signal });
  if (!response.ok) {
    throw new Error(`无法读取运行详情：HTTP ${response.status}`);
  }
  return (await response.json()) as RunDetailResponse;
}

export async function decideApproval(input: {
  approvalId: string;
  decision: "approved" | "rejected";
  comment: string;
  expectedVersion: number;
}): Promise<void> {
  const response = await fetch(
    `/api/v1/approvals/${encodeURIComponent(input.approvalId)}/decision`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RepoPilot-Actor": "console-user"
      },
      body: JSON.stringify({
        decision: input.decision,
        comment: input.comment,
        expectedVersion: input.expectedVersion
      })
    }
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `审批失败：HTTP ${response.status}`);
  }
}

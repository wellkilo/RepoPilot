import { useCallback, useEffect, useState } from "react";

import type { RunDetail, RunSummary } from "@repopilot/contracts";

import { getRun, listRuns } from "./api";

export function useRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [evidenceChainValid, setEvidenceChainValid] = useState<boolean | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const nextRuns = await listRuns();
      setRuns(nextRuns);
      const activeId = selectedRunId ?? nextRuns[0]?.id ?? null;
      setSelectedRunId(activeId);
      if (activeId) {
        const detail = await getRun(activeId);
        setSelectedRun(detail.run);
        setEvidenceChainValid(detail.evidenceChainValid);
      } else {
        setSelectedRun(null);
        setEvidenceChainValid(null);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "无法读取运行记录");
    } finally {
      setLoading(false);
    }
  }, [selectedRunId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const selectRun = useCallback(async (runId: string) => {
    setSelectedRunId(runId);
    setError(null);
    try {
      const detail = await getRun(runId);
      setSelectedRun(detail.run);
      setEvidenceChainValid(detail.evidenceChainValid);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "无法读取运行详情");
    }
  }, []);

  return {
    runs,
    selectedRun,
    selectedRunId,
    evidenceChainValid,
    error,
    loading,
    refresh,
    selectRun
  };
}

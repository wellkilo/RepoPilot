import { useMemo, useState } from "react";

import type {
  ApprovalRecord,
  EvidenceType,
  RunDetail,
  RunStatus,
  RunSummary
} from "@repopilot/contracts";

import { decideApproval } from "./api";
import { useRuns } from "./use-runs";

export const statusLabels: Record<RunStatus, string> = {
  queued: "排队",
  awaiting_dispatch: "待接入 AgentTeams",
  dispatched: "已派发",
  running: "执行中",
  awaiting_approval: "待审批",
  verifying: "验证中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消"
};

const evidenceLabels: Record<EvidenceType, string> = {
  input: "任务输入",
  decision: "决策",
  agent_message: "Agent 消息",
  tool_call: "工具调用",
  tool_result: "工具结果",
  approval: "审批",
  git_reference: "Git 证据",
  ci_result: "CI 结果",
  runbook: "经验沉淀",
  error: "错误"
};

const team = [
  { code: "L", name: "Repo Lead", duty: "拆解与调度" },
  { code: "X", name: "Locator", duty: "定位根因" },
  { code: "F", name: "Fixer", duty: "生成修复" },
  { code: "V", name: "Verifier", duty: "测试验证" },
  { code: "A", name: "Archivist", duty: "沉淀经验" }
];

export function sourceLabel(run: RunSummary): string {
  return run.source.type === "github_issue"
    ? `${run.source.repository} · Issue #${run.source.issueNumber}`
    : `${run.source.repository} · Workflow #${run.source.workflowRunId}`;
}

function shortHash(hash: string | null): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : "GENESIS";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function RunRail({
  runs,
  selectedRunId,
  selectRun
}: {
  runs: RunSummary[];
  selectedRunId: string | null;
  selectRun: (runId: string) => void;
}) {
  return (
    <aside className="run-rail" aria-label="运行记录">
      <div className="rail-heading">
        <span>运行记录</span>
        <strong>{runs.length.toString().padStart(2, "0")}</strong>
      </div>
      <div className="run-list">
        {runs.map((run, index) => (
          <button
            className={`run-ticket ${selectedRunId === run.id ? "is-active" : ""}`}
            key={run.id}
            onClick={() => selectRun(run.id)}
            type="button"
          >
            <span className="ticket-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="ticket-content">
              <span>{sourceLabel(run)}</span>
              <small>{statusLabels[run.status]}</small>
            </span>
            <span className={`status-lamp status-${run.status}`} aria-hidden="true" />
          </button>
        ))}
        {runs.length === 0 ? (
          <div className="rail-empty">
            <span>暂无运行</span>
            <small>创建 Issue 或调用 POST /api/v1/runs 开始。</small>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function EvidenceTrack({ run }: { run: RunDetail }) {
  return (
    <section className="evidence-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Evidence flight recorder</p>
          <h2>不可变证据轨道</h2>
        </div>
        <span className="track-count">{run.evidence.length} 条记录</span>
      </div>
      <div className="evidence-track">
        {run.evidence.map((entry, index) => (
          <article className="evidence-entry" key={entry.id}>
            <div className="track-marker">
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="evidence-card">
              <div className="evidence-meta">
                <strong>{evidenceLabels[entry.evidenceType]}</strong>
                <span>{formatTime(entry.createdAt)}</span>
              </div>
              <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
              <div className="hash-line">
                <span>PREV {shortHash(entry.previousHash)}</span>
                <span>CHAIN {shortHash(entry.chainHash)}</span>
              </div>
            </div>
          </article>
        ))}
        {run.evidence.length === 0 ? (
          <div className="track-empty">
            Agent 执行后，决策、工具结果和 Git 引用会依次出现在这里。
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ApprovalGate({
  approval,
  onDecided
}: {
  approval: ApprovalRecord;
  onDecided: () => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (decision: "approved" | "rejected") => {
    if (!comment.trim()) {
      setError("请填写审批依据。");
      return;
    }
    setSubmitting(decision);
    setError(null);
    try {
      await decideApproval({
        approvalId: approval.id,
        decision,
        comment: comment.trim(),
        expectedVersion: approval.version
      });
      await onDecided();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "审批失败");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <article className="approval-gate">
      <header>
        <span className={`risk risk-${approval.riskLevel}`}>{approval.riskLevel}</span>
        <div>
          <strong>{approval.action}</strong>
          <small>
            版本 {approval.version} · {approval.status}
          </small>
        </div>
      </header>
      <p>{JSON.stringify(approval.details)}</p>
      {approval.status === "pending" ? (
        <>
          <label>
            审批依据
            <textarea
              onChange={(event) => setComment(event.target.value)}
              placeholder="说明允许或拒绝此高风险动作的理由"
              value={comment}
            />
          </label>
          {error ? <div className="inline-error">{error}</div> : null}
          <div className="approval-actions">
            <button
              className="button button-approve"
              disabled={submitting !== null}
              onClick={() => void submit("approved")}
              type="button"
            >
              {submitting === "approved" ? "处理中…" : "批准动作"}
            </button>
            <button
              className="button button-reject"
              disabled={submitting !== null}
              onClick={() => void submit("rejected")}
              type="button"
            >
              {submitting === "rejected" ? "处理中…" : "拒绝动作"}
            </button>
          </div>
        </>
      ) : (
        <div className="approval-result">
          <span>{approval.decidedBy ?? "未知审批人"}</span>
          <p>{approval.comment}</p>
        </div>
      )}
    </article>
  );
}

export function App() {
  const {
    runs,
    selectedRun,
    selectedRunId,
    evidenceChainValid,
    error,
    loading,
    refresh,
    selectRun
  } = useRuns();
  const [compactPayloads, setCompactPayloads] = useState(false);

  const pendingApprovals = useMemo(
    () => selectedRun?.approvals.filter((approval) => approval.status === "pending") ?? [],
    [selectedRun]
  );

  return (
    <main className={compactPayloads ? "app compact" : "app"}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">RP</span>
          <div>
            <strong>RepoPilot</strong>
            <span>AgentTeam evidence console</span>
          </div>
        </div>
        <div className="system-strip" aria-label="系统状态">
          <span>
            <i className="online-dot" /> Control plane
          </span>
          <span>POLICY · PR ONLY</span>
          <button type="button" onClick={() => setCompactPayloads((value) => !value)}>
            {compactPayloads ? "展开证据" : "压缩证据"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <RunRail runs={runs} selectedRunId={selectedRunId} selectRun={(id) => void selectRun(id)} />

        <section className="main-deck">
          {loading ? <div className="state-panel">正在读取飞行记录器…</div> : null}
          {error ? (
            <div className="state-panel state-error">
              <strong>数据链路不可用</strong>
              <span>{error}</span>
              <button type="button" onClick={() => void refresh()}>
                重新读取
              </button>
            </div>
          ) : null}

          {!loading && !error && selectedRun ? (
            <>
              <section className="run-hero">
                <div className="run-title">
                  <p className="eyebrow">ACTIVE MAINTENANCE RUN</p>
                  <h1>{sourceLabel(selectedRun)}</h1>
                  <div className="hero-meta">
                    <span>RUN {selectedRun.id.slice(0, 8)}</span>
                    <span>TRACE {selectedRun.traceId.slice(0, 12)}</span>
                    <span>{statusLabels[selectedRun.status]}</span>
                  </div>
                </div>
                <div className={`integrity-seal ${evidenceChainValid ? "is-valid" : "is-invalid"}`}>
                  <span>{evidenceChainValid ? "CHAIN VERIFIED" : "CHAIN INVALID"}</span>
                  <strong>{selectedRun.evidence.length}</strong>
                  <small>evidence events</small>
                </div>
              </section>

              <section className="team-board" aria-label="Agent 团队">
                {team.map((agent, index) => (
                  <div className="agent-node" key={agent.name}>
                    <span className="agent-code">{agent.code}</span>
                    <div>
                      <strong>{agent.name}</strong>
                      <small>{agent.duty}</small>
                    </div>
                    {index < team.length - 1 ? <i className="handoff-line" /> : null}
                  </div>
                ))}
              </section>

              {selectedRun.approvals.length > 0 ? (
                <section className="approval-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Human checkpoint</p>
                      <h2>高风险动作门禁</h2>
                    </div>
                    <span className="track-count">{pendingApprovals.length} 待处理</span>
                  </div>
                  <div className="approval-grid">
                    {selectedRun.approvals.map((approval) => (
                      <ApprovalGate approval={approval} key={approval.id} onDecided={refresh} />
                    ))}
                  </div>
                </section>
              ) : null}

              <EvidenceTrack run={selectedRun} />
            </>
          ) : null}

          {!loading && !error && !selectedRun ? (
            <div className="state-panel state-empty">
              <strong>等待首个维护任务</strong>
              <span>打开测试仓库 Issue，或调用控制面 API 创建运行。</span>
              <code>POST /api/v1/runs</code>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

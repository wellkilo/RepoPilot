import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  assertRunTransition,
  type AppendEvidenceInput,
  type ApprovalDecisionInput,
  type ApprovalRecord,
  type CreateRunInput,
  type EvidenceRecord,
  type FinishStepInput,
  type RequestApprovalInput,
  type RunDetail,
  type RunSource,
  type RunStatus,
  type RunSummary,
  type RunbookSearchInput,
  type StartStepInput,
  type StepRecord
} from "@repopilot/contracts";
import postgres, { type Sql } from "postgres";

import { canonicalJson } from "./lib/canonical-json.js";

type DatabaseSql = Sql<Record<string, postgres.PostgresType>>;

interface RunRow {
  id: string;
  source_type: "github_issue" | "github_workflow_run";
  repository: string;
  issue_number: string | number | null;
  workflow_run_id: string | number | null;
  execution_policy: "pull_request_only";
  status: RunStatus;
  trace_id: string;
  matrix_event_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreatedRunRow extends RunRow {
  newly_created: boolean;
}

interface EvidenceRow {
  id: string;
  run_id: string;
  step_id: string | null;
  evidence_type: EvidenceRecord["evidenceType"];
  payload: Record<string, unknown>;
  payload_hash: string;
  previous_hash: string | null;
  chain_hash: string;
  created_at: Date;
}

interface StepRow {
  id: string;
  run_id: string;
  agent_name: StepRecord["agentName"];
  kind: StepRecord["skillName"];
  status: StepRecord["status"];
  summary: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
}

interface ApprovalRow {
  id: string;
  run_id: string;
  action: ApprovalRecord["action"];
  risk_level: ApprovalRecord["riskLevel"];
  status: ApprovalRecord["status"];
  version: number;
  details: Record<string, unknown>;
  decided_by: string | null;
  comment: string | null;
  created_at: Date;
  decided_at: Date | null;
  consumed_at: Date | null;
}

export interface RunbookResult {
  id: string;
  repository: string;
  title: string;
  summary: string;
  content: string;
  sourceRunId: string | null;
  score: number;
  createdAt: string;
}

export interface CreateRunOptions {
  deliveryId?: string;
}

export interface CreatedRun extends RunSummary {
  newlyCreated: boolean;
}

export interface FinishedStep {
  step: StepRecord;
  changed: boolean;
}

export class RepoPilotStore {
  readonly sql: DatabaseSql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null }
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async ping(): Promise<void> {
    await this.sql`SELECT 1`;
  }

  async createRun(input: CreateRunInput, options: CreateRunOptions = {}): Promise<CreatedRun> {
    const id = randomUUID();
    const traceId = randomBytes(16).toString("hex");
    const issueNumber = input.source.type === "github_issue" ? input.source.issueNumber : null;
    const workflowRunId =
      input.source.type === "github_workflow_run" ? input.source.workflowRunId : null;
    const deliveryId = options.deliveryId;
    const rows = deliveryId
      ? await this.sql.begin(async (transaction) => {
          await transaction`SELECT pg_advisory_xact_lock(hashtext(${deliveryId}))`;
          const existing = await transaction<RunRow[]>`
            SELECT *
            FROM runs
            WHERE delivery_id = ${deliveryId}
            LIMIT 1
          `;
          if (existing[0]) {
            return [{ ...existing[0], newly_created: false }];
          }
          const inserted = await transaction<CreatedRunRow[]>`
            INSERT INTO runs (
              id,
              source_type,
              repository,
              issue_number,
              workflow_run_id,
              delivery_id,
              execution_policy,
              trace_id
            )
            VALUES (
              ${id},
              ${input.source.type},
              ${input.source.repository.toLowerCase()},
              ${issueNumber},
              ${workflowRunId},
              ${deliveryId},
              ${input.executionPolicy},
              ${traceId}
            )
            RETURNING *, true AS newly_created
          `;
          return inserted;
        })
      : await this.sql<CreatedRunRow[]>`
          INSERT INTO runs (
            id,
            source_type,
            repository,
            issue_number,
            workflow_run_id,
            delivery_id,
            execution_policy,
            trace_id
          )
          VALUES (
            ${id},
            ${input.source.type},
            ${input.source.repository.toLowerCase()},
            ${issueNumber},
            ${workflowRunId},
            NULL,
            ${input.executionPolicy},
            ${traceId}
          )
          RETURNING *, true AS newly_created
        `;

    const row = this.requireRow(rows[0], "Run was not created");
    const run: CreatedRun = {
      ...this.mapRun(row),
      newlyCreated: row.newly_created
    };
    if (run.newlyCreated) {
      await this.appendEvidence({
        runId: run.id,
        evidenceType: "input",
        payload: {
          source: run.source,
          executionPolicy: run.executionPolicy,
          deliveryId: options.deliveryId ?? null
        }
      });
    }
    return run;
  }

  async listRuns(limit = 50): Promise<RunSummary[]> {
    const rows = await this.sql<RunRow[]>`
      SELECT *
      FROM runs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => this.mapRun(row));
  }

  async getRun(runId: string): Promise<RunSummary | null> {
    const rows = await this.sql<RunRow[]>`
      SELECT *
      FROM runs
      WHERE id = ${runId}
      LIMIT 1
    `;
    return rows[0] ? this.mapRun(rows[0]) : null;
  }

  async getRunDetail(runId: string): Promise<RunDetail | null> {
    const run = await this.getRun(runId);
    if (!run) {
      return null;
    }

    const [steps, evidence, approvals] = await Promise.all([
      this.listSteps(runId),
      this.listEvidence(runId),
      this.listApprovals(runId)
    ]);
    return { ...run, steps, evidence, approvals };
  }

  async transitionRun(runId: string, target: RunStatus): Promise<RunSummary> {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<RunRow[]>`
        SELECT *
        FROM runs
        WHERE id = ${runId}
        FOR UPDATE
      `;
      const current = this.mapRun(this.requireRow(rows[0], `Run ${runId} was not found`));
      assertRunTransition(current.status, target);

      const updatedRows = await transaction<RunRow[]>`
        UPDATE runs
        SET status = ${target}, updated_at = now()
        WHERE id = ${runId}
        RETURNING *
      `;
      return this.mapRun(this.requireRow(updatedRows[0], `Run ${runId} was not updated`));
    });
  }

  async attachMatrixEvent(runId: string, eventId: string): Promise<RunSummary> {
    const rows = await this.sql<RunRow[]>`
      UPDATE runs
      SET matrix_event_id = ${eventId}, updated_at = now()
      WHERE id = ${runId}
      RETURNING *
    `;
    return this.mapRun(this.requireRow(rows[0], `Run ${runId} was not found`));
  }

  async startStep(input: StartStepInput): Promise<StepRecord> {
    const result = await this.sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(hashtext(${`${input.runId}:${input.idempotencyKey}`}))
      `;
      const existing = await transaction<StepRow[]>`
        SELECT *
        FROM steps
        WHERE run_id = ${input.runId}
          AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `;
      if (existing[0]) {
        const step = this.mapStep(existing[0]);
        if (step.agentName !== input.agentName || step.skillName !== input.skillName) {
          throw new Error(
            `Step idempotency key ${input.idempotencyKey} is already bound to ${step.agentName}/${step.skillName}`
          );
        }
        return { step, newlyCreated: false };
      }
      const rows = await transaction<StepRow[]>`
        INSERT INTO steps (
          id,
          run_id,
          agent_name,
          kind,
          status,
          idempotency_key,
          started_at
        )
        VALUES (
          ${randomUUID()},
          ${input.runId},
          ${input.agentName},
          ${input.skillName},
          'running',
          ${input.idempotencyKey},
          now()
        )
        RETURNING *
      `;
      return {
        step: this.mapStep(this.requireRow(rows[0], "Step was not started")),
        newlyCreated: true
      };
    });
    if (result.newlyCreated) {
      await this.appendEvidence({
        runId: result.step.runId,
        stepId: result.step.id,
        evidenceType: "agent_message",
        payload: {
          event: "step_started",
          agentName: result.step.agentName,
          skillName: result.step.skillName,
          idempotencyKey: input.idempotencyKey,
          status: result.step.status
        }
      });
    }
    return result.step;
  }

  async finishStep(input: FinishStepInput): Promise<FinishedStep> {
    const result = await this.sql.begin(async (transaction) => {
      const currentRows = await transaction<StepRow[]>`
        SELECT *
        FROM steps
        WHERE id = ${input.stepId}
        FOR UPDATE
      `;
      const current = this.mapStep(
        this.requireRow(currentRows[0], `Step ${input.stepId} was not found`)
      );
      if (current.status !== "running") {
        if (current.status === input.status && current.summary === input.summary) {
          return { step: current, changed: false };
        }
        throw new Error(`Step ${input.stepId} is already ${current.status}`);
      }
      const rows = await transaction<StepRow[]>`
        UPDATE steps
        SET
          status = ${input.status},
          summary = ${input.summary},
          ended_at = now()
        WHERE id = ${input.stepId}
        RETURNING *
      `;
      return {
        step: this.mapStep(this.requireRow(rows[0], `Step ${input.stepId} was not finished`)),
        changed: true
      };
    });
    if (result.changed) {
      await this.appendEvidence({
        runId: result.step.runId,
        stepId: result.step.id,
        evidenceType: "agent_message",
        payload: {
          event: "step_finished",
          agentName: result.step.agentName,
          skillName: result.step.skillName,
          status: result.step.status,
          summary: result.step.summary
        }
      });
    }
    return result;
  }

  async listSteps(runId: string): Promise<StepRecord[]> {
    const rows = await this.sql<StepRow[]>`
      SELECT *
      FROM steps
      WHERE run_id = ${runId}
      ORDER BY created_at ASC, id ASC
    `;
    return rows.map((row) => this.mapStep(row));
  }

  async appendEvidence(input: AppendEvidenceInput): Promise<EvidenceRecord> {
    const createdAt = new Date();
    const payloadHash = createHash("sha256").update(canonicalJson(input.payload)).digest("hex");

    return this.sql.begin(async (transaction) => {
      const runRows = await transaction<{ id: string }[]>`
        SELECT id
        FROM runs
        WHERE id = ${input.runId}
        FOR UPDATE
      `;
      this.requireRow(runRows[0], `Run ${input.runId} was not found`);

      const priorRows = await transaction<{ chain_hash: string }[]>`
        SELECT chain_hash
        FROM evidence
        WHERE run_id = ${input.runId}
        ORDER BY id DESC
        LIMIT 1
      `;
      const previousHash = priorRows[0]?.chain_hash ?? null;
      const chainMaterial = canonicalJson({
        runId: input.runId,
        stepId: input.stepId ?? null,
        evidenceType: input.evidenceType,
        payloadHash,
        previousHash,
        createdAt: createdAt.toISOString()
      });
      const chainHash = createHash("sha256").update(chainMaterial).digest("hex");

      const rows = await transaction<EvidenceRow[]>`
        INSERT INTO evidence (
          run_id,
          step_id,
          evidence_type,
          payload,
          payload_hash,
          previous_hash,
          chain_hash,
          created_at
        )
        VALUES (
          ${input.runId},
          ${input.stepId ?? null},
          ${input.evidenceType},
          ${transaction.json(this.toJsonValue(input.payload))},
          ${payloadHash},
          ${previousHash},
          ${chainHash},
          ${createdAt}
        )
        RETURNING
          id::text,
          run_id,
          step_id,
          evidence_type,
          payload,
          payload_hash,
          previous_hash,
          chain_hash,
          created_at
      `;
      return this.mapEvidence(this.requireRow(rows[0], "Evidence was not appended"));
    });
  }

  async listEvidence(runId: string): Promise<EvidenceRecord[]> {
    const rows = await this.sql<EvidenceRow[]>`
      SELECT
        id::text,
        run_id,
        step_id,
        evidence_type,
        payload,
        payload_hash,
        previous_hash,
        chain_hash,
        created_at
      FROM evidence AS stored_evidence
      WHERE run_id = ${runId}
      ORDER BY stored_evidence.id ASC
    `;
    return rows.map((row) => this.mapEvidence(row));
  }

  async verifyEvidenceChain(runId: string): Promise<boolean> {
    const evidence = await this.listEvidence(runId);
    let previousHash: string | null = null;

    for (const entry of evidence) {
      const payloadHash = createHash("sha256").update(canonicalJson(entry.payload)).digest("hex");
      const chainMaterial = canonicalJson({
        runId: entry.runId,
        stepId: entry.stepId,
        evidenceType: entry.evidenceType,
        payloadHash,
        previousHash,
        createdAt: entry.createdAt
      });
      const chainHash = createHash("sha256").update(chainMaterial).digest("hex");
      if (
        payloadHash !== entry.payloadHash ||
        previousHash !== entry.previousHash ||
        chainHash !== entry.chainHash
      ) {
        return false;
      }
      previousHash = entry.chainHash;
    }
    return true;
  }

  async requestApproval(input: RequestApprovalInput): Promise<ApprovalRecord> {
    const id = randomUUID();
    const rows = await this.sql<ApprovalRow[]>`
      INSERT INTO approvals (id, run_id, action, risk_level, details)
      VALUES (
        ${id},
        ${input.runId},
        ${input.action},
        ${input.riskLevel},
        ${this.sql.json(this.toJsonValue(input.details))}
      )
      RETURNING *
    `;
    const approval = this.mapApproval(this.requireRow(rows[0], "Approval request was not created"));
    await this.appendEvidence({
      runId: input.runId,
      evidenceType: "approval",
      payload: {
        approvalId: approval.id,
        action: approval.action,
        riskLevel: approval.riskLevel,
        status: approval.status,
        version: approval.version
      }
    });
    return approval;
  }

  async listApprovals(runId: string): Promise<ApprovalRecord[]> {
    const rows = await this.sql<ApprovalRow[]>`
      SELECT *
      FROM approvals
      WHERE run_id = ${runId}
      ORDER BY created_at ASC
    `;
    return rows.map((row) => this.mapApproval(row));
  }

  async getApproval(approvalId: string): Promise<ApprovalRecord | null> {
    const rows = await this.sql<ApprovalRow[]>`
      SELECT *
      FROM approvals
      WHERE id = ${approvalId}
      LIMIT 1
    `;
    return rows[0] ? this.mapApproval(rows[0]) : null;
  }

  async decideApproval(
    approvalId: string,
    input: ApprovalDecisionInput,
    decidedBy: string
  ): Promise<ApprovalRecord> {
    const rows = await this.sql<ApprovalRow[]>`
      UPDATE approvals
      SET
        status = ${input.decision},
        version = version + 1,
        decided_by = ${decidedBy},
        comment = ${input.comment},
        decided_at = now()
      WHERE id = ${approvalId}
        AND status = 'pending'
        AND version = ${input.expectedVersion}
      RETURNING *
    `;
    const approval = this.mapApproval(
      this.requireRow(rows[0], "Approval decision conflicted with the current status or version")
    );
    await this.appendEvidence({
      runId: approval.runId,
      evidenceType: "approval",
      payload: {
        approvalId: approval.id,
        action: approval.action,
        status: approval.status,
        version: approval.version,
        decidedBy,
        comment: approval.comment
      }
    });
    return approval;
  }

  async assertApprovedAction(
    approvalId: string,
    action: ApprovalRecord["action"],
    expectedVersion: number,
    runId: string
  ): Promise<ApprovalRecord> {
    const approval = await this.getApproval(approvalId);
    if (
      !approval ||
      approval.runId !== runId ||
      approval.action !== action ||
      approval.status !== "approved" ||
      approval.version !== expectedVersion
    ) {
      throw new Error("A matching, approved, version-pinned approval is required");
    }
    return approval;
  }

  async consumeApprovedAction(
    approvalId: string,
    action: ApprovalRecord["action"],
    expectedVersion: number,
    runId: string
  ): Promise<ApprovalRecord> {
    const rows = await this.sql<ApprovalRow[]>`
      UPDATE approvals
      SET consumed_at = now()
      WHERE id = ${approvalId}
        AND run_id = ${runId}
        AND action = ${action}
        AND status = 'approved'
        AND version = ${expectedVersion}
        AND consumed_at IS NULL
      RETURNING *
    `;
    return this.mapApproval(
      this.requireRow(
        rows[0],
        "A matching, unconsumed, approved, version-pinned approval is required"
      )
    );
  }

  async searchRunbooks(input: RunbookSearchInput): Promise<RunbookResult[]> {
    const rows = await this.sql<
      {
        id: string;
        repository: string;
        title: string;
        summary: string;
        content: string;
        source_run_id: string | null;
        score: number;
        created_at: Date;
      }[]
    >`
      SELECT
        id,
        repository,
        title,
        summary,
        content,
        source_run_id,
        ts_rank_cd(search_document, websearch_to_tsquery('simple', ${input.query})) AS score,
        created_at
      FROM runbooks
      WHERE repository = ${input.repository.toLowerCase()}
        AND search_document @@ websearch_to_tsquery('simple', ${input.query})
      ORDER BY score DESC, created_at DESC
      LIMIT ${input.limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      repository: row.repository,
      title: row.title,
      summary: row.summary,
      content: row.content,
      sourceRunId: row.source_run_id,
      score: Number(row.score),
      createdAt: row.created_at.toISOString()
    }));
  }

  async writeRunbook(input: {
    repository: string;
    title: string;
    summary: string;
    content: string;
    sourceRunId: string;
  }): Promise<RunbookResult> {
    const rows = await this.sql<
      {
        id: string;
        repository: string;
        title: string;
        summary: string;
        content: string;
        source_run_id: string | null;
        created_at: Date;
      }[]
    >`
      INSERT INTO runbooks (
        repository,
        title,
        summary,
        content,
        source_run_id
      )
      VALUES (
        ${input.repository.toLowerCase()},
        ${input.title},
        ${input.summary},
        ${input.content},
        ${input.sourceRunId}
      )
      RETURNING id, repository, title, summary, content, source_run_id, created_at
    `;
    const row = this.requireRow(rows[0], "Runbook was not created");
    await this.appendEvidence({
      runId: input.sourceRunId,
      evidenceType: "runbook",
      payload: {
        runbookId: row.id,
        repository: row.repository,
        title: row.title,
        summary: row.summary
      }
    });
    return {
      id: row.id,
      repository: row.repository,
      title: row.title,
      summary: row.summary,
      content: row.content,
      sourceRunId: row.source_run_id,
      score: 1,
      createdAt: row.created_at.toISOString()
    };
  }

  private mapRun(row: RunRow): RunSummary {
    return {
      id: row.id,
      source: this.mapSource(row),
      executionPolicy: row.execution_policy,
      status: row.status,
      traceId: row.trace_id,
      matrixEventId: row.matrix_event_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private mapSource(row: RunRow): RunSource {
    if (row.source_type === "github_issue") {
      return {
        type: "github_issue",
        repository: row.repository,
        issueNumber: Number(row.issue_number)
      };
    }
    return {
      type: "github_workflow_run",
      repository: row.repository,
      workflowRunId: Number(row.workflow_run_id)
    };
  }

  private mapEvidence(row: EvidenceRow): EvidenceRecord {
    return {
      id: row.id,
      runId: row.run_id,
      stepId: row.step_id,
      evidenceType: row.evidence_type,
      payload: row.payload,
      payloadHash: row.payload_hash,
      previousHash: row.previous_hash,
      chainHash: row.chain_hash,
      createdAt: row.created_at.toISOString()
    };
  }

  private mapStep(row: StepRow): StepRecord {
    return {
      id: row.id,
      runId: row.run_id,
      agentName: row.agent_name,
      skillName: row.kind,
      status: row.status,
      summary: row.summary,
      startedAt: row.started_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString()
    };
  }

  private mapApproval(row: ApprovalRow): ApprovalRecord {
    return {
      id: row.id,
      runId: row.run_id,
      action: row.action,
      riskLevel: row.risk_level,
      status: row.status,
      version: row.version,
      details: row.details,
      decidedBy: row.decided_by,
      comment: row.comment,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      consumedAt: row.consumed_at?.toISOString() ?? null
    };
  }

  private requireRow<T>(row: T | undefined, message: string): T {
    if (row === undefined) {
      throw new Error(message);
    }
    return row;
  }

  private toJsonValue(value: Record<string, unknown>): postgres.JSONValue {
    return JSON.parse(canonicalJson(value)) as postgres.JSONValue;
  }
}

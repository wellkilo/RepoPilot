CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE run_status AS ENUM (
  'queued',
  'awaiting_dispatch',
  'dispatched',
  'running',
  'awaiting_approval',
  'verifying',
  'succeeded',
  'failed',
  'cancelled'
);

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (
    source_type IN ('github_issue', 'github_workflow_run', 'github_pull_request')
  ),
  repository TEXT NOT NULL,
  issue_number BIGINT,
  workflow_run_id BIGINT,
  pull_number BIGINT,
  head_sha TEXT,
  delivery_id TEXT UNIQUE,
  execution_policy TEXT NOT NULL CHECK (execution_policy = 'pull_request_only'),
  status run_status NOT NULL DEFAULT 'queued',
  trace_id TEXT NOT NULL UNIQUE,
  matrix_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (
      source_type = 'github_issue'
      AND issue_number IS NOT NULL
      AND workflow_run_id IS NULL
      AND pull_number IS NULL
      AND head_sha IS NULL
    )
    OR
    (
      source_type = 'github_workflow_run'
      AND workflow_run_id IS NOT NULL
      AND issue_number IS NULL
      AND pull_number IS NULL
      AND head_sha IS NULL
    )
    OR
    (
      source_type = 'github_pull_request'
      AND pull_number IS NOT NULL
      AND head_sha ~ '^[0-9a-fA-F]{40}$'
      AND issue_number IS NULL
      AND workflow_run_id IS NULL
    )
  )
);

CREATE TABLE steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked', 'skipped')),
  summary TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('medium', 'high', 'critical')),
  status approval_status NOT NULL DEFAULT 'pending',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  details JSONB NOT NULL,
  decided_by TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE evidence (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id) ON DELETE SET NULL,
  evidence_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  previous_hash TEXT,
  chain_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, chain_hash)
);

CREATE TABLE runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  source_run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  search_document TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(summary, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(content, '')), 'C')
  ) STORED,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX evidence_run_created_idx ON evidence (run_id, created_at, id);
CREATE INDEX approvals_run_status_idx ON approvals (run_id, status);
CREATE INDEX runbooks_repository_idx ON runbooks (repository);
CREATE INDEX runbooks_search_idx ON runbooks USING GIN (search_document);

CREATE OR REPLACE FUNCTION reject_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'evidence records are append-only';
END;
$$;

CREATE TRIGGER evidence_no_update
BEFORE UPDATE ON evidence
FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();

CREATE TRIGGER evidence_no_delete
BEFORE DELETE ON evidence
FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();

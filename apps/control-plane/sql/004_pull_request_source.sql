ALTER TABLE runs
ADD COLUMN IF NOT EXISTS pull_number BIGINT;

ALTER TABLE runs
ADD COLUMN IF NOT EXISTS head_sha TEXT;

ALTER TABLE runs
DROP CONSTRAINT IF EXISTS runs_source_type_check;

ALTER TABLE runs
ADD CONSTRAINT runs_source_type_check
CHECK (source_type IN ('github_issue', 'github_workflow_run', 'github_pull_request'));

ALTER TABLE runs
DROP CONSTRAINT IF EXISTS runs_check;

ALTER TABLE runs
DROP CONSTRAINT IF EXISTS runs_source_fields_check;

ALTER TABLE runs
ADD CONSTRAINT runs_source_fields_check
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
);

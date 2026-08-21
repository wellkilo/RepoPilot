ALTER TABLE steps
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

UPDATE steps
SET idempotency_key = id::text
WHERE idempotency_key IS NULL;

ALTER TABLE steps
ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS steps_run_idempotency_idx
ON steps (run_id, idempotency_key);

CREATE INDEX IF NOT EXISTS steps_run_created_idx
ON steps (run_id, created_at, id);

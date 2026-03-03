-- 20260228120000_memories_idempotency_key.sql
-- Ensure idempotency key support exists in Neon DB

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_author_idempotency_key
  ON memories (author_id, idempotency_key);

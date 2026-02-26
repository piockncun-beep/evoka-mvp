-- 20260226185000_memories_extra_columns.sql
-- Ensure metadata columns exist on memories

ALTER TABLE memories ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

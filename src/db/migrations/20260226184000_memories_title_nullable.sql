-- 20260226184000_memories_title_nullable.sql
-- Allow title to be nullable

ALTER TABLE memories
    ALTER COLUMN title DROP NOT NULL;

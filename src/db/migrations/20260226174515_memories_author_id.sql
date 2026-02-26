-- 20260226174515_memories_author_id.sql
-- Ensure memories table supports POST /api/memories requirements

CREATE TABLE IF NOT EXISTS memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id text NOT NULL,
    title text,
    content text NOT NULL,
    privacy text NOT NULL DEFAULT 'private',
    status text NOT NULL DEFAULT 'active',
    destiny text NOT NULL DEFAULT 'self',
    created_at timestamptz NOT NULL DEFAULT now(),
    idempotency_key text
);

ALTER TABLE memories ADD COLUMN IF NOT EXISTS author_id text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'private';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS destiny text NOT NULL DEFAULT 'self';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memories ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
        IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'memories'
                    AND column_name = 'user_id'
        ) THEN
                UPDATE memories
                SET author_id = user_id
                WHERE author_id IS NULL
                    AND user_id IS NOT NULL;
        END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM memories WHERE author_id IS NULL) THEN
        ALTER TABLE memories ALTER COLUMN author_id SET NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'memories_author_id_users_fk'
    ) THEN
        ALTER TABLE memories
        ADD CONSTRAINT memories_author_id_users_fk
            FOREIGN KEY (author_id)
            REFERENCES users (clerk_user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memories_author_created_at
    ON memories (author_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_author_idempotency_key
    ON memories (author_id, idempotency_key);

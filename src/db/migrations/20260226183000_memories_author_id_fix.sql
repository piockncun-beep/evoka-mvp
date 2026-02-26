-- 20260226183000_memories_author_id_fix.sql
-- Ensure memories.author_id is text and FK is valid

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'memories_author_id_users_fk'
    ) THEN
        ALTER TABLE memories
            DROP CONSTRAINT memories_author_id_users_fk;
    END IF;
END $$;

ALTER TABLE memories
    ALTER COLUMN author_id TYPE text
    USING author_id::text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'memories_author_id_users_fk'
    ) AND NOT EXISTS (
        SELECT 1
        FROM memories m
        LEFT JOIN users u ON u.clerk_user_id = m.author_id
        WHERE m.author_id IS NOT NULL
          AND u.clerk_user_id IS NULL
    ) THEN
        ALTER TABLE memories
            ADD CONSTRAINT memories_author_id_users_fk
                FOREIGN KEY (author_id)
                REFERENCES users (clerk_user_id);
    END IF;
END $$;

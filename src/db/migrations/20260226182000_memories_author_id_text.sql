-- 20260226182000_memories_author_id_text.sql
-- Normalize memories.author_id to text for Clerk user ids

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'memories'
          AND column_name = 'author_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE memories
            ALTER COLUMN author_id TYPE text
            USING author_id::text;
    END IF;
END $$;

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

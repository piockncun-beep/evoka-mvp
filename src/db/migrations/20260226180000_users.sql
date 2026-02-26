-- 20260226180000_users.sql
-- Ensure users table exists for memories author_id FK

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id text NOT NULL UNIQUE,
    email text,
    created_at timestamptz NOT NULL DEFAULT now()
);

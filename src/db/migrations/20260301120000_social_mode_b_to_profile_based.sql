-- 20260301120000_social_mode_b_to_profile_based.sql
-- Migración idempotente: modo B (text clerk ids) -> mode profile-based (uuid user_profiles.id)
-- No borra columnas legacy (author_id, follower_id, following_id).

-- 1) Columnas nuevas profile-based
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS author_profile_id uuid;

ALTER TABLE follows
  ADD COLUMN IF NOT EXISTS follower_profile_id uuid;

ALTER TABLE follows
  ADD COLUMN IF NOT EXISTS followed_profile_id uuid;

-- 2) Asegurar perfiles para todos los clerk ids conocidos
INSERT INTO user_profiles (handle, display_name, bio, avatar_url)
SELECT DISTINCT src.handle, NULL, NULL, NULL
FROM (
  SELECT u.clerk_user_id AS handle
  FROM users u
  WHERE u.clerk_user_id IS NOT NULL AND btrim(u.clerk_user_id) <> ''

  UNION

  SELECT p.author_id AS handle
  FROM posts p
  WHERE p.author_id IS NOT NULL AND btrim(p.author_id) <> ''

  UNION

  SELECT f.follower_id AS handle
  FROM follows f
  WHERE f.follower_id IS NOT NULL AND btrim(f.follower_id) <> ''

  UNION

  SELECT f.following_id AS handle
  FROM follows f
  WHERE f.following_id IS NOT NULL AND btrim(f.following_id) <> ''
) src
ON CONFLICT (handle) DO NOTHING;

-- 3) Backfill posts.author_id -> posts.author_profile_id
UPDATE posts p
SET author_profile_id = up.id
FROM user_profiles up
WHERE p.author_profile_id IS NULL
  AND p.author_id IS NOT NULL
  AND up.handle = p.author_id;

-- 4) Backfill follows.follower_id/following_id -> *_profile_id
UPDATE follows f
SET follower_profile_id = up.id
FROM user_profiles up
WHERE f.follower_profile_id IS NULL
  AND f.follower_id IS NOT NULL
  AND up.handle = f.follower_id;

UPDATE follows f
SET followed_profile_id = up.id
FROM user_profiles up
WHERE f.followed_profile_id IS NULL
  AND f.following_id IS NOT NULL
  AND up.handle = f.following_id;

-- 5) Índices profile-based (sin tocar legacy)
CREATE INDEX IF NOT EXISTS idx_posts_author_profile_created_at
  ON posts (author_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_follower_profile_created_at
  ON follows (follower_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_followed_profile_created_at
  ON follows (followed_profile_id, created_at DESC);

-- Unique profile-based (parcial para no bloquear filas legacy aún no backfilleadas)
CREATE UNIQUE INDEX IF NOT EXISTS follows_follower_profile_followed_profile_unique
  ON follows (follower_profile_id, followed_profile_id)
  WHERE follower_profile_id IS NOT NULL
    AND followed_profile_id IS NOT NULL;

-- 6) Constraints/FKs profile-based (idempotente + NOT VALID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_author_profile_id_user_profiles_id_fk'
      AND conrelid = 'posts'::regclass
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_author_profile_id_user_profiles_id_fk
      FOREIGN KEY (author_profile_id)
      REFERENCES user_profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'follows_follower_profile_id_user_profiles_id_fk'
      AND conrelid = 'follows'::regclass
  ) THEN
    ALTER TABLE follows
      ADD CONSTRAINT follows_follower_profile_id_user_profiles_id_fk
      FOREIGN KEY (follower_profile_id)
      REFERENCES user_profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'follows_followed_profile_id_user_profiles_id_fk'
      AND conrelid = 'follows'::regclass
  ) THEN
    ALTER TABLE follows
      ADD CONSTRAINT follows_followed_profile_id_user_profiles_id_fk
      FOREIGN KEY (followed_profile_id)
      REFERENCES user_profiles(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'follows_no_self_profile'
      AND conrelid = 'follows'::regclass
  ) THEN
    ALTER TABLE follows
      ADD CONSTRAINT follows_no_self_profile
      CHECK (
        follower_profile_id IS NULL
        OR followed_profile_id IS NULL
        OR follower_profile_id <> followed_profile_id
      )
      NOT VALID;
  END IF;
END $$;

-- 7) Validar constraints solo si ya no hay violaciones
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'posts_author_profile_id_user_profiles_id_fk'
      AND conrelid = 'posts'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM posts p
    LEFT JOIN user_profiles up ON up.id = p.author_profile_id
    WHERE p.author_profile_id IS NOT NULL
      AND up.id IS NULL
  ) THEN
    ALTER TABLE posts VALIDATE CONSTRAINT posts_author_profile_id_user_profiles_id_fk;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_follower_profile_id_user_profiles_id_fk'
      AND conrelid = 'follows'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM follows f
    LEFT JOIN user_profiles up ON up.id = f.follower_profile_id
    WHERE f.follower_profile_id IS NOT NULL
      AND up.id IS NULL
  ) THEN
    ALTER TABLE follows VALIDATE CONSTRAINT follows_follower_profile_id_user_profiles_id_fk;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_followed_profile_id_user_profiles_id_fk'
      AND conrelid = 'follows'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM follows f
    LEFT JOIN user_profiles up ON up.id = f.followed_profile_id
    WHERE f.followed_profile_id IS NOT NULL
      AND up.id IS NULL
  ) THEN
    ALTER TABLE follows VALIDATE CONSTRAINT follows_followed_profile_id_user_profiles_id_fk;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'follows_no_self_profile'
      AND conrelid = 'follows'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM follows f
    WHERE f.follower_profile_id IS NOT NULL
      AND f.followed_profile_id IS NOT NULL
      AND f.follower_profile_id = f.followed_profile_id
  ) THEN
    ALTER TABLE follows VALIDATE CONSTRAINT follows_no_self_profile;
  END IF;
END $$;

-- 8) Promover NOT NULL solo cuando backfill esté completo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'author_profile_id' AND is_nullable = 'YES')
     AND NOT EXISTS (SELECT 1 FROM posts WHERE author_profile_id IS NULL)
  THEN
    ALTER TABLE posts ALTER COLUMN author_profile_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'follower_profile_id' AND is_nullable = 'YES')
     AND NOT EXISTS (SELECT 1 FROM follows WHERE follower_profile_id IS NULL)
  THEN
    ALTER TABLE follows ALTER COLUMN follower_profile_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'followed_profile_id' AND is_nullable = 'YES')
     AND NOT EXISTS (SELECT 1 FROM follows WHERE followed_profile_id IS NULL)
  THEN
    ALTER TABLE follows ALTER COLUMN followed_profile_id SET NOT NULL;
  END IF;
END $$;

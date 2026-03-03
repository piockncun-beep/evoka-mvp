-- 20260301143000_user_profiles_user_id_canonical.sql
-- Canonicalización idempotente de user_profiles para modelo profile-based
-- No elimina columnas legacy (e.g. handle).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Backfill desde handle legacy si existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'handle'
  ) THEN
    UPDATE user_profiles
    SET user_id = handle
    WHERE user_id IS NULL
      AND handle IS NOT NULL
      AND btrim(handle) <> '';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_unique
  ON user_profiles (user_id)
  WHERE user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_user_id_not_blank'
      AND conrelid = 'user_profiles'::regclass
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_user_id_not_blank
      CHECK (user_id IS NULL OR btrim(user_id) <> '')
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_user_id_not_blank'
      AND conrelid = 'user_profiles'::regclass
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE user_id IS NOT NULL
      AND btrim(user_id) = ''
  ) THEN
    ALTER TABLE user_profiles VALIDATE CONSTRAINT user_profiles_user_id_not_blank;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id IS NULL) THEN
    ALTER TABLE user_profiles
      ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

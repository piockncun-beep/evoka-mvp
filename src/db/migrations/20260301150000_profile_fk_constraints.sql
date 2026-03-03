-- 20260301150000_profile_fk_constraints.sql
-- Add canonical profile-based FKs (idempotent by constraint name)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='posts_author_profile_fk') THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_author_profile_fk
      FOREIGN KEY (author_profile_id) REFERENCES user_profiles(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='follows_follower_profile_fk') THEN
    ALTER TABLE follows
      ADD CONSTRAINT follows_follower_profile_fk
      FOREIGN KEY (follower_profile_id) REFERENCES user_profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='follows_followed_profile_fk') THEN
    ALTER TABLE follows
      ADD CONSTRAINT follows_followed_profile_fk
      FOREIGN KEY (followed_profile_id) REFERENCES user_profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

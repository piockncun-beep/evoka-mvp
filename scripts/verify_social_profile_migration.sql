-- verify_social_profile_migration.sql
-- Ejecuta este bloque ANTES y DESPUÉS de la migración para comparar conteos.

WITH profile_coverage AS (
  SELECT
    (SELECT COUNT(*) FROM users u WHERE u.clerk_user_id IS NOT NULL AND btrim(u.clerk_user_id) <> '') AS users_with_clerk_id,
    (SELECT COUNT(*) FROM user_profiles up WHERE up.handle IS NOT NULL AND btrim(up.handle) <> '') AS user_profiles_total,
    (SELECT COUNT(*)
     FROM users u
     LEFT JOIN user_profiles up ON up.handle = u.clerk_user_id
     WHERE u.clerk_user_id IS NOT NULL AND btrim(u.clerk_user_id) <> '' AND up.id IS NULL) AS users_without_profile,

    (SELECT COUNT(*) FROM posts) AS posts_total,
    (SELECT COUNT(*) FROM posts WHERE author_id IS NOT NULL) AS posts_with_author_id,
    (SELECT COUNT(*) FROM posts WHERE author_profile_id IS NULL) AS posts_missing_author_profile_id,
    (SELECT COUNT(*)
     FROM posts p
     LEFT JOIN user_profiles up ON up.id = p.author_profile_id
     WHERE p.author_profile_id IS NOT NULL AND up.id IS NULL) AS posts_orphan_author_profile_id,

    (SELECT COUNT(*) FROM follows) AS follows_total,
    (SELECT COUNT(*) FROM follows WHERE follower_id IS NOT NULL) AS follows_with_follower_id,
    (SELECT COUNT(*) FROM follows WHERE following_id IS NOT NULL) AS follows_with_following_id,
    (SELECT COUNT(*) FROM follows WHERE follower_profile_id IS NULL) AS follows_missing_follower_profile_id,
    (SELECT COUNT(*) FROM follows WHERE followed_profile_id IS NULL) AS follows_missing_followed_profile_id,
    (SELECT COUNT(*)
     FROM follows f
     LEFT JOIN user_profiles up ON up.id = f.follower_profile_id
     WHERE f.follower_profile_id IS NOT NULL AND up.id IS NULL) AS follows_orphan_follower_profile_id,
    (SELECT COUNT(*)
     FROM follows f
     LEFT JOIN user_profiles up ON up.id = f.followed_profile_id
     WHERE f.followed_profile_id IS NOT NULL AND up.id IS NULL) AS follows_orphan_followed_profile_id,
    (SELECT COUNT(*)
     FROM follows
     WHERE follower_profile_id IS NOT NULL
       AND followed_profile_id IS NOT NULL
       AND follower_profile_id = followed_profile_id) AS follows_self_edges
)
SELECT * FROM profile_coverage;

-- Verifica constraints / índices profile-based
SELECT conname, convalidated
FROM pg_constraint
WHERE conname IN (
  'posts_author_profile_id_user_profiles_id_fk',
  'follows_follower_profile_id_user_profiles_id_fk',
  'follows_followed_profile_id_user_profiles_id_fk',
  'follows_no_self_profile'
)
ORDER BY conname;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_posts_author_profile_created_at',
    'idx_follows_follower_profile_created_at',
    'idx_follows_followed_profile_created_at',
    'follows_follower_profile_followed_profile_unique'
  )
ORDER BY indexname;

import { sql } from "drizzle-orm";
import { db } from "./db.js";

type ProfileRow = {
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date | string | null;
};

type MemoryCountsRow = {
  memoriesTotal: number | string | null;
  memoriesPublic: number | string | null;
  memoriesPrivate: number | string | null;
};

type SocialCountsRow = {
  followersCount: number | string | null;
  followingCount: number | string | null;
};

type MemoryItemRow = {
  id: string;
  title: string | null;
  content: string;
  privacy: string;
  createdAt: Date | string;
};

type ProfileSummaryResponse = {
  profile: {
    userId: string;
    displayName: string | null;
    username: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
  };
  counts: {
    memoriesTotal: number;
    memoriesPublic: number;
    memoriesPrivate: number;
  };
  social: {
    followersCount: number;
    followingCount: number;
  };
  memories: {
    items: Array<{
      id: string;
      title: string | null;
      excerpt: string;
      visibility: "public" | "private";
      createdAt: string;
    }>;
    nextCursor: string | null;
  };
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapVisibility(value: string): "public" | "private" {
  return value === "public" ? "public" : "private";
}

function buildExcerpt(content: string): string {
  return content.slice(0, 180);
}

export async function getProfileSummary(
  userId: string,
  cursor?: string,
): Promise<ProfileSummaryResponse> {
  void cursor;
  const [profileResult, memoriesCountResult, socialCountResult, memoriesResult] =
    await Promise.all([
      db.execute(sql`
        SELECT
          user_id AS "userId",
          display_name AS "displayName",
          bio,
          avatar_url AS "avatarUrl",
          created_at AS "createdAt"
        FROM user_profiles
        WHERE user_id = ${userId}
        LIMIT 1
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int AS "memoriesTotal",
          SUM(CASE WHEN privacy = 'public' THEN 1 ELSE 0 END)::int AS "memoriesPublic",
          SUM(CASE WHEN privacy = 'public' THEN 0 ELSE 1 END)::int AS "memoriesPrivate"
        FROM memories
        WHERE author_id = ${userId}
          AND COALESCE(is_deleted, false) = false
      `),
      db.execute(sql`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM follows f
            JOIN user_profiles up ON up.id = f.followed_profile_id
            WHERE up.user_id = ${userId}
          ) AS "followersCount",
          (
            SELECT COUNT(*)::int
            FROM follows f
            JOIN user_profiles up ON up.id = f.follower_profile_id
            WHERE up.user_id = ${userId}
          ) AS "followingCount"
      `),
      db.execute(sql`
        SELECT
          id,
          title,
          content,
          privacy,
          created_at AS "createdAt"
        FROM memories
        WHERE author_id = ${userId}
          AND COALESCE(is_deleted, false) = false
        ORDER BY created_at DESC
        LIMIT 20
      `),
    ]);

  const profileRow = (profileResult.rows[0] ?? null) as ProfileRow | null;
  const memoryCountsRow = (memoriesCountResult.rows[0] ??
    null) as MemoryCountsRow | null;
  const socialCountsRow = (socialCountResult.rows[0] ??
    null) as SocialCountsRow | null;
  const memoryRows = (memoriesResult.rows ?? []) as MemoryItemRow[];

  return {
    profile: {
      userId,
      displayName: profileRow?.displayName ?? null,
      username: null,
      bio: profileRow?.bio ?? null,
      avatarUrl: profileRow?.avatarUrl ?? null,
      createdAt: toIsoOrNull(profileRow?.createdAt),
    },
    counts: {
      memoriesTotal: toNumber(memoryCountsRow?.memoriesTotal),
      memoriesPublic: toNumber(memoryCountsRow?.memoriesPublic),
      memoriesPrivate: toNumber(memoryCountsRow?.memoriesPrivate),
    },
    social: {
      followersCount: toNumber(socialCountsRow?.followersCount),
      followingCount: toNumber(socialCountsRow?.followingCount),
    },
    memories: {
      items: memoryRows.map((row) => ({
        id: row.id,
        title: row.title ?? null,
        excerpt: buildExcerpt(row.content),
        visibility: mapVisibility(row.privacy),
        createdAt: toIsoOrNull(row.createdAt) ?? new Date(0).toISOString(),
      })),
      nextCursor: null,
    },
  };
}

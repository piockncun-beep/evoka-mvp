import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

type MemoryRow = {
  id: string;
  author_id: string;
  title: string | null;
  content: string;
  privacy: string;
  created_at: string;
  is_deleted: boolean;
};

type FollowRow = {
  follower_user_id: string;
  followed_user_id: string;
};

const profilesStore: ProfileRow[] = [];
const memoriesStore: MemoryRow[] = [];
const followsStore: FollowRow[] = [];

function extractSqlParts(statement: unknown): { text: string; values: unknown[] } {
  if (!statement || typeof statement !== "object") {
    return { text: String(statement ?? ""), values: [] };
  }

  const queryChunks = (statement as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(queryChunks)) {
    return { text: JSON.stringify(statement), values: [] };
  }

  let text = "";
  const values: unknown[] = [];

  for (const chunk of queryChunks) {
    if (
      chunk &&
      typeof chunk === "object" &&
      "value" in (chunk as Record<string, unknown>) &&
      Array.isArray((chunk as { value: unknown }).value)
    ) {
      text += ((chunk as { value: string[] }).value ?? []).join("");
      continue;
    }

    values.push(chunk);
    text += "?";
  }

  return { text, values };
}

const fakeDb = {
  execute: vi.fn(async (statement: unknown) => {
    const { text, values } = extractSqlParts(statement);
    const userId = String(values[0] ?? "");

    if (text.includes("FROM user_profiles") && text.includes("WHERE user_id = ?")) {
      const row = profilesStore.find((profile) => profile.user_id === userId);
      if (!row) return { rows: [] };
      return {
        rows: [
          {
            userId: row.user_id,
            displayName: row.display_name,
            bio: row.bio,
            avatarUrl: row.avatar_url,
            createdAt: row.created_at,
          },
        ],
      };
    }

    if (text.includes("COUNT(*)::int AS \"memoriesTotal\"") && text.includes("FROM memories")) {
      const scoped = memoriesStore.filter(
        (memory) => memory.author_id === userId && !memory.is_deleted,
      );
      const memoriesPublic = scoped.filter((memory) => memory.privacy === "public").length;
      const memoriesPrivate = scoped.length - memoriesPublic;
      return {
        rows: [
          {
            memoriesTotal: scoped.length,
            memoriesPublic,
            memoriesPrivate,
          },
        ],
      };
    }

    if (text.includes("AS \"followersCount\"") && text.includes("AS \"followingCount\"")) {
      const followersCount = followsStore.filter(
        (follow) => follow.followed_user_id === userId,
      ).length;
      const followingCount = followsStore.filter(
        (follow) => follow.follower_user_id === userId,
      ).length;
      return {
        rows: [
          {
            followersCount,
            followingCount,
          },
        ],
      };
    }

    if (text.includes("SELECT") && text.includes("FROM memories") && text.includes("LIMIT 20")) {
      const rows = memoriesStore
        .filter((memory) => memory.author_id === userId && !memory.is_deleted)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20)
        .map((memory) => ({
          id: memory.id,
          title: memory.title,
          content: memory.content,
          privacy: memory.privacy,
          createdAt: memory.created_at,
        }));

      return { rows };
    }

    return { rows: [] };
  }),
};

vi.mock("../auth.js", () => ({
  authMiddleware: (
    req: { headers: { authorization?: string }; auth?: { userId: string } },
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
    next: () => void,
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" },
      });
    }
    req.auth = { userId: authHeader.slice(7) };
    next();
  },
}));

vi.mock("../db.js", () => ({
  db: fakeDb,
}));

process.env.NODE_ENV = "test";

const { app } = await import("../index.js");

describe("GET /api/me/profile-summary", () => {
  beforeEach(() => {
    profilesStore.length = 0;
    memoriesStore.length = 0;
    followsStore.length = 0;
    fakeDb.execute.mockClear();
  });

  it("returns 401 when no auth token", async () => {
    const res = await request(app).get("/api/me/profile-summary");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      },
    });
  });

  it("returns 200 with exact shape and consistent counts", async () => {
    profilesStore.push({
      user_id: "user_test_123",
      display_name: "Felipe",
      bio: "Bio demo",
      avatar_url: "https://example.com/avatar.png",
      created_at: "2026-03-01T10:00:00.000Z",
    });

    memoriesStore.push(
      {
        id: "mem_1",
        author_id: "user_test_123",
        title: "Pública",
        content: "contenido publico",
        privacy: "public",
        created_at: "2026-03-02T10:00:00.000Z",
        is_deleted: false,
      },
      {
        id: "mem_2",
        author_id: "user_test_123",
        title: null,
        content: "contenido privado",
        privacy: "private",
        created_at: "2026-03-01T10:00:00.000Z",
        is_deleted: false,
      },
      {
        id: "mem_3",
        author_id: "user_test_123",
        title: "No pública",
        content: "contenido dedicado",
        privacy: "dedicated",
        created_at: "2026-02-28T10:00:00.000Z",
        is_deleted: false,
      },
      {
        id: "mem_4",
        author_id: "other_user",
        title: "Otro usuario",
        content: "debe excluirse",
        privacy: "public",
        created_at: "2026-03-02T12:00:00.000Z",
        is_deleted: false,
      },
    );

    followsStore.push(
      { follower_user_id: "follower_a", followed_user_id: "user_test_123" },
      { follower_user_id: "follower_b", followed_user_id: "user_test_123" },
      { follower_user_id: "user_test_123", followed_user_id: "followed_a" },
    );

    const res = await request(app)
      .get("/api/me/profile-summary")
      .set("Authorization", "Bearer user_test_123");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: {
        profile: {
          userId: "user_test_123",
          displayName: "Felipe",
          username: null,
          bio: "Bio demo",
          avatarUrl: "https://example.com/avatar.png",
          createdAt: "2026-03-01T10:00:00.000Z",
        },
        counts: {
          memoriesTotal: 3,
          memoriesPublic: 1,
          memoriesPrivate: 2,
        },
        social: {
          followersCount: 2,
          followingCount: 1,
        },
        memories: {
          items: [
            {
              id: "mem_1",
              title: "Pública",
              excerpt: "contenido publico",
              visibility: "public",
              createdAt: "2026-03-02T10:00:00.000Z",
            },
            {
              id: "mem_2",
              title: null,
              excerpt: "contenido privado",
              visibility: "private",
              createdAt: "2026-03-01T10:00:00.000Z",
            },
            {
              id: "mem_3",
              title: "No pública",
              excerpt: "contenido dedicado",
              visibility: "private",
              createdAt: "2026-02-28T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      },
    });
  });
});

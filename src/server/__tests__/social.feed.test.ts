import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PostRow = {
  id: string;
  content: string;
  visibility: "public" | "followers";
  created_at: string;
  author_profile_id: string;
};

type ProfileRow = {
  id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
};

type FollowRow = {
  follower_profile_id: string;
  followed_profile_id: string;
};

const postsStore: PostRow[] = [];
const profilesStore: ProfileRow[] = [];
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

function sortByCreatedAtDesc<T extends { created_at: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const createdDiff =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    return b.id.localeCompare(a.id);
  });
}

function toFeedItem(post: PostRow) {
  const author = profilesStore.find((profile) => profile.id === post.author_profile_id);
  return {
    id: post.id,
    content: post.content,
    visibility: post.visibility,
    created_at: post.created_at,
    author_profile_id: post.author_profile_id,
    author_handle: author?.handle ?? null,
    author_display_name: author?.display_name ?? null,
  };
}

const fakeDb = {
  execute: vi.fn(async (statement: unknown) => {
    const { text, values } = extractSqlParts(statement);

    if (text.includes("FROM user_profiles") && text.includes("WHERE user_id = ?")) {
      const userId = String(values[0] ?? "");
      const found = profilesStore.find((profile) => profile.user_id === userId);
      if (!found) return { rows: [] };
      return {
        rows: [
          {
            id: found.id,
            handle: found.handle,
            displayName: found.display_name,
            avatarUrl: null,
          },
        ],
      };
    }

    if (text.includes("INSERT INTO user_profiles")) {
      return { rows: [] };
    }

    if (
      text.includes("FROM user_profiles") &&
      text.includes("WHERE user_id = ?") &&
      text.includes("SELECT id")
    ) {
      const userId = String(values[0] ?? "");
      const found = profilesStore.find((profile) => profile.user_id === userId);
      return { rows: found ? [{ id: found.id }] : [] };
    }

    if (text.includes("FROM posts p") && text.includes("WHERE p.visibility = 'public'")) {
      const limit =
        [...values].reverse().find((value) => typeof value === "number") ?? 20;
      const rows = sortByCreatedAtDesc(
        postsStore.filter((post) => post.visibility === "public"),
      )
        .slice(0, Number(limit))
        .map(toFeedItem);
      return { rows };
    }

    if (text.includes("FROM posts p") && text.includes("f.follower_profile_id")) {
      const profileIds = values.filter((value) => typeof value === "string") as string[];
      const viewerProfileId = profileIds[0] ?? "";
      const limit =
        [...values].reverse().find((value) => typeof value === "number") ?? 20;

      const followedProfileIds = followsStore
        .filter((follow) => follow.follower_profile_id === viewerProfileId)
        .map((follow) => follow.followed_profile_id);

      const rows = sortByCreatedAtDesc(
        postsStore.filter((post) => {
          if (post.author_profile_id === viewerProfileId) return true;
          if (!followedProfileIds.includes(post.author_profile_id)) return false;
          return post.visibility === "public" || post.visibility === "followers";
        }),
      )
        .slice(0, Number(limit))
        .map(toFeedItem);

      return { rows };
    }

    return { rows: [] };
  }),
};

vi.mock("../auth.js", () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    req.auth = { userId: authHeader.slice(7) };
    next();
  },
}));

vi.mock("../db.js", () => ({
  db: fakeDb,
}));

vi.mock("../lib/safeLogEvent.js", () => ({
  safeLogEvent: vi.fn(async () => undefined),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: vi.fn(async (userId: string) => ({
        id: userId,
      })),
    },
  }),
}));

process.env.NODE_ENV = "test";

const { default: socialRouter } = await import("../social.js");
const app = express();
app.use(express.json());
app.use("/api/social", socialRouter);

function seedBase() {
  profilesStore.push(
    {
      id: "profile_viewer",
      user_id: "viewer_user",
      handle: "viewer",
      display_name: "Viewer",
    },
    {
      id: "profile_author",
      user_id: "author_user",
      handle: "author",
      display_name: "Author",
    },
    {
      id: "profile_other",
      user_id: "other_user",
      handle: "other",
      display_name: "Other",
    },
  );
}

describe("social feed endpoints", () => {
  beforeEach(() => {
    postsStore.length = 0;
    profilesStore.length = 0;
    followsStore.length = 0;
    fakeDb.execute.mockClear();
    seedBase();
  });

  it("A) viewer sin follows: public responde 200 y following solo own posts", async () => {
    postsStore.push(
      {
        id: "post_viewer_1",
        content: "post propio",
        visibility: "followers",
        created_at: "2026-03-01T10:00:00.000Z",
        author_profile_id: "profile_viewer",
      },
      {
        id: "post_author_public",
        content: "post publico autor",
        visibility: "public",
        created_at: "2026-03-01T09:00:00.000Z",
        author_profile_id: "profile_author",
      },
      {
        id: "post_author_followers",
        content: "post followers autor",
        visibility: "followers",
        created_at: "2026-03-01T08:00:00.000Z",
        author_profile_id: "profile_author",
      },
    );

    const publicRes = await request(app)
      .get("/api/social/feed/public?limit=20")
      .set("Authorization", "Bearer viewer_user");

    expect(publicRes.status).toBe(200);
    expect(Array.isArray(publicRes.body?.items)).toBe(true);

    const followingRes = await request(app)
      .get("/api/social/feed/following?limit=20")
      .set("Authorization", "Bearer viewer_user");

    expect(followingRes.status).toBe(200);
    const ids = (followingRes.body?.items ?? []).map((item: { id: string }) => item.id);
    expect(ids).toContain("post_viewer_1");
    expect(ids).not.toContain("post_author_public");
    expect(ids).not.toContain("post_author_followers");
  });

  it("B) viewer sigue a author: following incluye followers del seguido", async () => {
    followsStore.push({
      follower_profile_id: "profile_viewer",
      followed_profile_id: "profile_author",
    });

    postsStore.push({
      id: "post_author_followers",
      content: "solo seguidores",
      visibility: "followers",
      created_at: "2026-03-01T12:00:00.000Z",
      author_profile_id: "profile_author",
    });

    const res = await request(app)
      .get("/api/social/feed/following?limit=20")
      .set("Authorization", "Bearer viewer_user");

    expect(res.status).toBe(200);
    const ids = (res.body?.items ?? []).map((item: { id: string }) => item.id);
    expect(ids).toContain("post_author_followers");
  });

  it("C) viewer NO sigue a author: following NO incluye followers de no seguido", async () => {
    postsStore.push({
      id: "post_author_followers",
      content: "solo seguidores",
      visibility: "followers",
      created_at: "2026-03-01T12:00:00.000Z",
      author_profile_id: "profile_author",
    });

    const res = await request(app)
      .get("/api/social/feed/following?limit=20")
      .set("Authorization", "Bearer viewer_user");

    expect(res.status).toBe(200);
    const ids = (res.body?.items ?? []).map((item: { id: string }) => item.id);
    expect(ids).not.toContain("post_author_followers");
  });
});

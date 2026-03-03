import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { sql } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueueItem = {
  type: "limit" | "where" | "orderBy";
  value: unknown[];
};

const selectQueue: QueueItem[] = [];
const executeQueue: Array<{ rows?: unknown[] }> = [];
const insertQueue: unknown[] = [];
const insertValuesCalls: unknown[] = [];
const safeLogEventMock = vi.fn(async () => undefined);
const clerkGetUserMock = vi.fn(async (userId: string) => ({
  id: userId,
  username: "felipe",
  firstName: "Felipe",
  lastName: "Arriaran",
  fullName: "Felipe Arriaran",
  imageUrl: "https://example.com/a.png",
  primaryEmailAddress: {
    emailAddress: "felipe@example.com",
  },
  primaryEmailAddressId: "email_primary",
  emailAddresses: [
    {
      id: "email_primary",
      emailAddress: "felipe@example.com",
    },
  ],
}));

function enqueueSelectLimit(value: unknown[]) {
  selectQueue.push({ type: "limit", value });
}

function enqueueSelectWhere(value: unknown[]) {
  selectQueue.push({ type: "where", value });
}

function enqueueExecuteRows(rows: unknown[]) {
  executeQueue.push({ rows });
}

function enqueueInsertReturning(rows: unknown[]) {
  insertQueue.push(rows);
}

type SocialEventRow = {
  event_type: string;
  actor_profile_id: string;
  target_profile_id: string | null;
  post_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

const socialEventsStore: SocialEventRow[] = [];

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
  select: vi.fn(() => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => {
        const item = selectQueue.shift() ?? {
          type: "where" as const,
          value: [],
        };
        if (item.type === "limit") {
          return {
            limit: () => item.value,
          };
        }
        return item.value;
      },
      orderBy: () => {
        const item = selectQueue.shift() ?? {
          type: "orderBy" as const,
          value: [],
        };
        return item.value;
      },
      limit: () => {
        const item = selectQueue.shift() ?? {
          type: "limit" as const,
          value: [],
        };
        return item.value;
      },
    };

    return chain;
  }),
  execute: vi.fn(async (statement: unknown) => {
    const { text, values } = extractSqlParts(statement);

    if (text.includes("INSERT INTO social_events")) {
      const [eventType, actorProfileId, targetProfileId, postId, metaRaw] = values;
      socialEventsStore.push({
        event_type: String(eventType ?? "unknown_event"),
        actor_profile_id: String(actorProfileId ?? ""),
        target_profile_id: targetProfileId ? String(targetProfileId) : null,
        post_id: postId ? String(postId) : null,
        meta:
          typeof metaRaw === "string"
            ? ((JSON.parse(metaRaw) as Record<string, unknown>) ?? {})
            : {},
        created_at: new Date().toISOString(),
      });
      return { rows: [] };
    }

    if (text.includes("DELETE FROM social_events")) {
      const actorIds = values
        .filter((value) => typeof value === "string")
        .map((value) => String(value));

      if (actorIds.length === 0) {
        socialEventsStore.length = 0;
      } else {
        for (let i = socialEventsStore.length - 1; i >= 0; i -= 1) {
          if (actorIds.includes(socialEventsStore[i].actor_profile_id)) {
            socialEventsStore.splice(i, 1);
          }
        }
      }

      return { rows: [] };
    }

    if (text.includes("FROM social_events")) {
      const actorId = values.find((value) => typeof value === "string");
      const rows = actorId
        ? socialEventsStore.filter(
            (row) => row.actor_profile_id === String(actorId),
          )
        : [...socialEventsStore];
      return { rows };
    }

    return executeQueue.shift() ?? { rows: [] };
  }),
  insert: vi.fn(() => ({
    values: (value: unknown) => {
      insertValuesCalls.push(value);
      return {
      onConflictDoNothing: () => ({
        returning: () =>
          (insertQueue.shift() as Array<Record<string, unknown>> | undefined) ??
          [],
      }),
      returning: () =>
        (insertQueue.shift() as Array<Record<string, unknown>> | undefined) ??
        [],
      };
    },
  })),
  delete: vi.fn(() => ({
    where: () => ({
      returning: () => [],
    }),
  })),
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
  safeLogEvent: safeLogEventMock,
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: clerkGetUserMock,
    },
  }),
}));

process.env.NODE_ENV = "test";

const { default: socialRouter } = await import("../social.js");
const app = express();
app.use(express.json());
app.use("/api/social", socialRouter);

const POST_ID = "11111111-1111-4111-8111-111111111111";

describe("social visibility hardening", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    executeQueue.length = 0;
    insertQueue.length = 0;
    insertValuesCalls.length = 0;
    socialEventsStore.length = 0;
    safeLogEventMock.mockClear();
    fakeDb.select.mockClear();
    fakeDb.execute.mockClear();
    clerkGetUserMock.mockClear();
  });

  it("hidrata handle/display_name cuando vienen vacíos", async () => {
    clerkGetUserMock.mockResolvedValueOnce({
      id: "user_test_123",
      username: "felipe",
      firstName: "Felipe",
      lastName: "Arriaran",
      fullName: "Felipe Arriaran",
      imageUrl: "https://example.com/a.png",
      primaryEmailAddress: {
        emailAddress: "felipe@example.com",
      },
      primaryEmailAddressId: "email_primary",
      emailAddresses: [
        {
          id: "email_primary",
          emailAddress: "felipe@example.com",
        },
      ],
    });

    enqueueExecuteRows([
      {
        id: "viewer_profile",
        handle: "",
        displayName: "",
        avatarUrl: "",
      },
    ]);
    enqueueExecuteRows([]);
    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([]);

    const res = await request(app)
      .get("/api/social/feed/following")
      .set("Authorization", "Bearer user_test_123");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.items)).toBe(true);
    expect(clerkGetUserMock).toHaveBeenCalledWith("user_test_123");

    const upsertCall = fakeDb.execute.mock.calls[1] as unknown[] | undefined;
    const upsertSql = JSON.stringify(upsertCall?.[0]);
    expect(upsertSql).toContain("INSERT INTO user_profiles");
    expect(upsertSql).toContain("display_name");
    expect(upsertSql).toContain("CASE");
    expect(upsertSql).toContain("felipe");
    expect(upsertSql).toContain("Felipe Arriaran");
    expect(upsertSql).toContain("https://example.com/a.png");
    expect(upsertSql).not.toContain('""');
  });

  it("a) viewer NO sigue al autor: no puede ver post followers (403)", async () => {
    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([]);
    enqueueExecuteRows([
      {
        id: POST_ID,
        visibility: "followers",
      },
    ]);

    const res = await request(app)
      .get(`/api/social/posts/${POST_ID}`)
      .set("Authorization", "Bearer viewer_user");

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("FORBIDDEN");
    expect(safeLogEventMock).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        event_name: "social_visibility_denied",
        post_ref: POST_ID,
        visibility: "followers",
      }),
    );
  });

  it("b) viewer sigue al autor: sí puede ver post followers (200)", async () => {
    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([
      {
        id: POST_ID,
        authorProfileId: "author_profile",
        visibility: "followers",
      },
    ]);

    enqueueSelectLimit([
      {
        id: POST_ID,
        content: "visible",
        visibility: "followers",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        authorProfileId: "author_profile",
        authorHandle: "author_user",
        authorDisplayName: "Author",
      },
    ]);

    enqueueSelectWhere([{ value: 0 }]);
    enqueueSelectWhere([{ value: 0 }]);
    enqueueSelectWhere([{ value: 0 }]);
    enqueueSelectLimit([]);

    const res = await request(app)
      .get(`/api/social/posts/${POST_ID}`)
      .set("Authorization", "Bearer viewer_user");

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.data?.post?.id).toBe(POST_ID);
  });

  it("c) autor ve su propio post followers (200)", async () => {
    enqueueExecuteRows([{ id: "author_profile" }]);
    enqueueExecuteRows([
      {
        id: POST_ID,
        authorProfileId: "author_profile",
        visibility: "followers",
      },
    ]);

    enqueueSelectLimit([
      {
        id: POST_ID,
        content: "own post",
        visibility: "followers",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        authorProfileId: "author_profile",
        authorHandle: "author_user",
        authorDisplayName: "Author",
      },
    ]);

    enqueueSelectWhere([{ value: 0 }]);
    enqueueSelectWhere([{ value: 0 }]);
    enqueueSelectWhere([{ value: 0 }]);
    enqueueSelectLimit([]);

    const res = await request(app)
      .get(`/api/social/posts/${POST_ID}`)
      .set("Authorization", "Bearer author_user");

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);
  });

  it("d) feed following no incluye followers de no-seguidos", async () => {
    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([
      {
        id: "post_followed_public",
        content: "public-followed",
        visibility: "public",
        createdAt: "2026-02-28T10:00:00.000Z",
        updatedAt: "2026-02-28T10:00:00.000Z",
        authorProfileId: "followed_profile",
        authorHandle: "followed_user",
        authorDisplayName: null,
      },
      {
        id: "post_own_followers",
        content: "own-followers",
        visibility: "followers",
        createdAt: "2026-02-28T09:30:00.000Z",
        updatedAt: "2026-02-28T09:30:00.000Z",
        authorProfileId: "viewer_profile",
        authorHandle: "viewer_user",
        authorDisplayName: null,
      },
      {
        id: "post_followers_followed",
        content: "followers-followed",
        visibility: "followers",
        createdAt: "2026-02-28T09:00:00.000Z",
        updatedAt: "2026-02-28T09:00:00.000Z",
        authorProfileId: "followed_profile",
        authorHandle: "followed_user",
        authorDisplayName: null,
      },
    ]);

    const res = await request(app)
      .get("/api/social/feed/following")
      .set("Authorization", "Bearer viewer_user");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.items)).toBe(true);

    const ids = (res.body?.items ?? []).map(
      (item: { id: string }) => item.id,
    );
    expect(ids).toContain("post_followed_public");
    expect(ids).toContain("post_own_followers");
    expect(ids).toContain("post_followers_followed");
    expect(ids).not.toContain("post_public_stranger");
    expect(ids).not.toContain("post_followers_not_followed");
  });

  it("e) comentar/inspire/share en post no visible -> 403", async () => {
    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([]);
    enqueueExecuteRows([
      {
        id: POST_ID,
        visibility: "followers",
      },
    ]);

    const commentRes = await request(app)
      .post(`/api/social/posts/${POST_ID}/comments`)
      .set("Authorization", "Bearer viewer_user")
      .send({ content: "test comment" });

    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([]);
    enqueueExecuteRows([
      {
        id: POST_ID,
        visibility: "followers",
      },
    ]);

    const inspireRes = await request(app)
      .post(`/api/social/posts/${POST_ID}/inspire`)
      .set("Authorization", "Bearer viewer_user");

    enqueueExecuteRows([{ id: "viewer_profile" }]);
    enqueueExecuteRows([]);
    enqueueExecuteRows([
      {
        id: POST_ID,
        visibility: "followers",
      },
    ]);

    const shareRes = await request(app)
      .post(`/api/social/posts/${POST_ID}/share`)
      .set("Authorization", "Bearer viewer_user");

    expect(commentRes.status).toBe(403);
    expect(inspireRes.status).toBe(403);
    expect(shareRes.status).toBe(403);

    expect(safeLogEventMock).toHaveBeenCalledTimes(3);
    expect(safeLogEventMock).toHaveBeenNthCalledWith(
      1,
      fakeDb,
      expect.objectContaining({
        event_name: "social_visibility_denied",
        post_ref: POST_ID,
        visibility: "followers",
      }),
    );
  });

  it("create post => inserta social_events post_created", async () => {
    const actorProfileId = "viewer_profile_post";

    await fakeDb.execute(sql`
      DELETE FROM social_events
      WHERE actor_profile_id IN (${actorProfileId}::uuid)
    `);

    enqueueExecuteRows([
      {
        id: actorProfileId,
        handle: "viewer_user",
        displayName: "Viewer User",
        avatarUrl: "https://example.com/me.png",
      },
    ]);

    enqueueInsertReturning([
      {
        id: "22222222-2222-4222-8222-222222222222",
        authorId: "user_post_creator",
        authorProfileId: actorProfileId,
        content: "nuevo post",
        visibility: "public",
      },
    ]);

    const res = await request(app)
      .post("/api/social/posts")
      .set("Authorization", "Bearer user_post_creator")
      .send({ content: "nuevo post", visibility: "public" });

    expect(res.status).toBe(201);

    const postInsertPayload = insertValuesCalls.find(
      (value) =>
        !!value &&
        typeof value === "object" &&
        "content" in (value as Record<string, unknown>) &&
        "visibility" in (value as Record<string, unknown>) &&
        "authorProfileId" in (value as Record<string, unknown>),
    ) as
      | {
          authorId?: string;
        }
      | undefined;

    expect(postInsertPayload?.authorId).toBe("user_post_creator");

    const eventsResult = await fakeDb.execute(sql`
      SELECT event_type, actor_profile_id
      FROM social_events
      WHERE actor_profile_id = ${actorProfileId}::uuid
    `);

    const rows = eventsResult.rows as SocialEventRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event_type).toBe("post_created");
    expect(rows[0]?.actor_profile_id).toBe(actorProfileId);
  });

  it("follow => inserta social_events user_followed", async () => {
    const actorProfileId = "viewer_profile_follow";
    const followedProfileId = "followed_profile_target";

    await fakeDb.execute(sql`
      DELETE FROM social_events
      WHERE actor_profile_id IN (${actorProfileId}::uuid)
    `);

    enqueueExecuteRows([
      {
        id: actorProfileId,
        handle: "viewer_user",
        displayName: "Viewer User",
        avatarUrl: "https://example.com/me.png",
      },
    ]);

    enqueueSelectLimit([
      {
        id: followedProfileId,
        userId: "target_user",
      },
    ]);

    enqueueInsertReturning([{ id: "follow_row_1" }]);

    const res = await request(app)
      .post("/api/social/follow/target_user")
      .set("Authorization", "Bearer user_follow_actor");

    expect(res.status).toBe(200);
    expect(res.body?.ok).toBe(true);

    const eventsResult = await fakeDb.execute(sql`
      SELECT event_type, actor_profile_id, target_profile_id
      FROM social_events
      WHERE actor_profile_id = ${actorProfileId}::uuid
    `);

    const rows = eventsResult.rows as SocialEventRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event_type).toBe("user_followed");
    expect(rows[0]?.target_profile_id).toBe(followedProfileId);
  });
});

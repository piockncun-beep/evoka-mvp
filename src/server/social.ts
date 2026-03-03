import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { createClerkClient } from "@clerk/backend";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import z from "zod";
import { authMiddleware } from "./auth.js";
import { db } from "./db.js";
import { safeLogEvent } from "./lib/safeLogEvent.js";
import {
  follows,
  notifications,
  postComments,
  postReactions,
  postShares,
  posts,
  userProfiles,
} from "../db/schema/social.js";

const router = Router();
router.use(authMiddleware);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  visibility: z.enum(["public", "followers"]).default("public"),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
) {
  return res.status(status).json({
    ok: false,
    error: { code, message, details, requestId },
  });
}

function getActorUserId(req: Request, res: Response): string | undefined {
  const actorUserId = req.auth?.userId;
  if (!actorUserId) {
    fail(res, 401, "UNAUTHORIZED", "Missing authenticated user");
    return undefined;
  }
  return actorUserId;
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY || "",
});

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function emailPrefix(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const prefix = email.slice(0, at).trim();
  return prefix.length > 0 ? prefix : null;
}

function fallbackHandleFromUserId(clerkUserId: string): string {
  const compact = clerkUserId.replace(/[^a-zA-Z0-9]/g, "");
  const suffix = compact.slice(-6) || randomUUID().slice(-6);
  return `user_${suffix}`;
}

function userIdSuffix(userId: string): string {
  const compact = userId.replace(/[^a-zA-Z0-9]/g, "");
  return compact.slice(-6) || "unknown";
}

async function resolveProfileSeedFromClerk(
  clerkUserId: string,
): Promise<{
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}> {
  const requestId = randomUUID();
  let username: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let fullName: string | null = null;
  let imageUrl: string | null = null;
  let primaryEmail: string | null = null;

  try {
    const clerkUser = (await clerkClient.users.getUser(clerkUserId)) as {
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      fullName?: string | null;
      imageUrl?: string | null;
      primaryEmailAddress?: { emailAddress?: string | null } | null;
      primaryEmailAddressId?: string | null;
      emailAddresses?: Array<{
        id?: string;
        emailAddress?: string | null;
      }>;
    };

    username = normalizeNonEmptyString(clerkUser.username);
    firstName = normalizeNonEmptyString(clerkUser.firstName);
    lastName = normalizeNonEmptyString(clerkUser.lastName);
    fullName = normalizeNonEmptyString(clerkUser.fullName);
    imageUrl = normalizeNonEmptyString(clerkUser.imageUrl);

    primaryEmail = normalizeNonEmptyString(
      clerkUser.primaryEmailAddress?.emailAddress,
    );

    if (
      !primaryEmail &&
      clerkUser.primaryEmailAddressId &&
      clerkUser.emailAddresses
    ) {
      const primary = clerkUser.emailAddresses.find(
        (item) => item.id === clerkUser.primaryEmailAddressId,
      );
      primaryEmail = normalizeNonEmptyString(primary?.emailAddress);
    }

    if (!primaryEmail && Array.isArray(clerkUser.emailAddresses)) {
      primaryEmail = normalizeNonEmptyString(
        clerkUser.emailAddresses[0]?.emailAddress,
      );
    }
  } catch {
    console.warn("social_profile_seed_failed", {
      requestId,
      userIdSuffix: userIdSuffix(clerkUserId),
    });
  }

  const fallbackFromEmail = emailPrefix(primaryEmail);
  const handle =
    username ?? fallbackFromEmail ?? fallbackHandleFromUserId(clerkUserId);
  const nameFromFirstLast = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName =
    (nameFromFirstLast.length > 0 ? nameFromFirstLast : null) ??
    fullName ??
    handle;

  return {
    handle,
    displayName,
    avatarUrl: imageUrl,
  };
}

async function getOrCreateViewerProfileId(
  clerkUserId: string,
): Promise<string> {
  const existing = await db.execute(sql`
    SELECT
      id,
      handle,
      display_name AS "displayName",
      avatar_url AS "avatarUrl"
    FROM user_profiles
    WHERE user_id = ${clerkUserId}
    LIMIT 1
  `);

  const [existingRow] = existing.rows as Array<{
    id: string;
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  }>;

  const hasHandleField =
    !!existingRow && Object.prototype.hasOwnProperty.call(existingRow, "handle");
  const hasDisplayNameField =
    !!existingRow &&
    Object.prototype.hasOwnProperty.call(existingRow, "displayName");
  const hasAvatarField =
    !!existingRow && Object.prototype.hasOwnProperty.call(existingRow, "avatarUrl");

  const missingHandle =
    hasHandleField && normalizeNonEmptyString(existingRow?.handle) === null;
  const missingDisplayName =
    hasDisplayNameField && normalizeNonEmptyString(existingRow?.displayName) === null;
  const missingAvatar =
    hasAvatarField && normalizeNonEmptyString(existingRow?.avatarUrl) === null;

  if (existingRow?.id && !missingHandle && !missingDisplayName && !missingAvatar) {
    return existingRow.id;
  }

  const seed = await resolveProfileSeedFromClerk(clerkUserId);

  await db.execute(sql`
    INSERT INTO user_profiles (
      id,
      user_id,
      handle,
      display_name,
      avatar_url,
      bio,
      is_public,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      ${clerkUserId},
      ${seed.handle},
      ${seed.displayName},
      ${seed.avatarUrl},
      NULL,
      true,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
      SET handle = CASE
                     WHEN user_profiles.handle IS NULL OR btrim(user_profiles.handle) = ''
                       THEN excluded.handle
                     ELSE user_profiles.handle
                   END,
          display_name = CASE
                           WHEN user_profiles.display_name IS NULL OR btrim(user_profiles.display_name) = ''
                             THEN excluded.display_name
                           ELSE user_profiles.display_name
                         END,
          avatar_url = CASE
                         WHEN user_profiles.avatar_url IS NULL OR btrim(user_profiles.avatar_url) = ''
                           THEN excluded.avatar_url
                         ELSE user_profiles.avatar_url
                       END,
          updated_at = now()
  `);

  const resolved = await db.execute(sql`
    SELECT id
    FROM user_profiles
    WHERE user_id = ${clerkUserId}
    LIMIT 1
  `);

  const [resolvedRow] = resolved.rows as Array<{ id: string }>;
  if (!resolvedRow?.id) {
    throw new Error("Unable to resolve actor profile");
  }
  return resolvedRow.id;
}

async function resolveProfileFromParam(userIdParam: string) {
  if (UUID_RE.test(userIdParam)) {
    const [byId] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, userIdParam))
      .limit(1);
    if (byId) return byId;
  }

  const [byHandle] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userIdParam))
    .limit(1);

  return byHandle;
}

type PostAccessDecision = {
  allowed: boolean;
  reason?: "forbidden" | "not_found";
  post: {
    id: string;
    authorProfileId: string;
    visibility: "public" | "followers";
  } | null;
};

async function canViewPostOrFetch(
  postId: string,
  viewerProfileId: string,
): Promise<PostAccessDecision> {
  const allowedResult = await db.execute(sql`
    SELECT
      p.id,
      p.author_profile_id AS "authorProfileId",
      p.visibility
    FROM posts p
    WHERE p.id = ${postId}
      AND (
        p.visibility = 'public'::post_visibility
        OR p.author_profile_id = ${viewerProfileId}
        OR (
          p.visibility = 'followers'::post_visibility
          AND EXISTS (
            SELECT 1
            FROM follows f
            WHERE f.follower_profile_id = ${viewerProfileId}
              AND f.followed_profile_id = p.author_profile_id
          )
        )
      )
    LIMIT 1
  `);

  const [allowedRow] = allowedResult.rows as Array<{
    id: string;
    authorProfileId: string;
    visibility: "public" | "followers";
  }>;

  if (allowedRow) {
    return {
      allowed: true,
      post: {
        id: allowedRow.id,
        authorProfileId: allowedRow.authorProfileId,
        visibility: allowedRow.visibility,
      },
    };
  }

  const existsResult = await db.execute(sql`
    SELECT
      p.id,
      p.visibility
    FROM posts p
    WHERE p.id = ${postId}
    LIMIT 1
  `);

  const [existingPost] = existsResult.rows as Array<{
    id: string;
    visibility: "public" | "followers";
  }>;

  if (!existingPost) {
    return {
      allowed: false,
      reason: "not_found",
      post: null,
    };
  }

  return {
    allowed: false,
    reason: "forbidden",
    post: {
      id: existingPost.id,
      authorProfileId: "",
      visibility: existingPost.visibility,
    },
  };
}

async function canViewPost(
  viewerProfileId: string,
  postId: string,
): Promise<PostAccessDecision> {
  const decision = await canViewPostOrFetch(postId, viewerProfileId);
  return decision;
}

async function logVisibilityDenied(params: {
  requestId: string;
  actorUserId: string;
  postId: string;
  visibility?: "public" | "followers";
}) {
  await safeLogEvent(db, {
    requestId: params.requestId,
    actor_id: params.actorUserId,
    event_name: "social_visibility_denied",
    post_ref: params.postId,
    visibility: params.visibility,
    meta: {
      source: "social",
    },
  });
}

async function emitSocialEvent(params: {
  requestId: string;
  eventType:
    | "post_created"
    | "user_followed"
    | "post_commented"
    | "post_inspired"
    | "post_shared";
  actorProfileId: string;
  targetProfileId?: string | null;
  postId?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.execute(sql`
      INSERT INTO social_events (
        event_type,
        actor_profile_id,
        target_profile_id,
        post_id,
        meta,
        created_at
      )
      VALUES (
        ${params.eventType},
        ${params.actorProfileId}::uuid,
        ${params.targetProfileId ?? null}::uuid,
        ${params.postId ?? null}::uuid,
        ${JSON.stringify(params.meta ?? {})}::jsonb,
        now()
      )
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.warn("emitSocialEvent failed", {
      requestId: params.requestId,
      eventType: params.eventType,
      message,
    });
  }
}

router.post("/follow/:userId", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const target = await resolveProfileFromParam(req.params.userId);

    if (!target) {
      return fail(
        res,
        404,
        "USER_NOT_FOUND",
        "Target user profile not found",
        undefined,
        requestId,
      );
    }
    if (target.id === viewerProfileId || target.userId === actorUserId) {
      return fail(
        res,
        400,
        "NO_SELF_FOLLOW",
        "You cannot follow yourself",
        undefined,
        requestId,
      );
    }

    const [inserted] = await db
      .insert(follows)
      .values({
        followerProfileId: viewerProfileId,
        followedProfileId: target.id,
      })
      .onConflictDoNothing({
        target: [follows.followerProfileId, follows.followedProfileId],
      })
      .returning({ id: follows.id });

    if (inserted) {
      await emitSocialEvent({
        requestId,
        eventType: "user_followed",
        actorProfileId: viewerProfileId,
        targetProfileId: target.id,
      });

      await safeLogEvent(db, {
        requestId,
        actor_id: actorUserId,
        event_name: "social_follow_created",
        actor_profile_ref: viewerProfileId,
        target_profile_ref: target.id,
        meta: {
          source: "social",
        },
      });

      await db.insert(notifications).values({
        recipientProfileId: target.id,
        actorProfileId: viewerProfileId,
        notificationType: "new_follower",
        payload: {
          event_name: "social_follow_created",
          actor_id: actorUserId,
          actor_profile_id: viewerProfileId,
          author_profile_id: target.id,
        },
      });
    }

    return ok(res, {
      following: true,
      alreadyFollowing: !inserted,
      actorProfileId: viewerProfileId,
      targetProfileId: target.id,
    });
  } catch (error) {
    console.error("POST /api/social/follow/:userId failed", {
      requestId,
      error,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not follow user",
      undefined,
      requestId,
    );
  }
});

router.delete("/follow/:userId", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const target = await resolveProfileFromParam(req.params.userId);

    if (!target) {
      return fail(
        res,
        404,
        "USER_NOT_FOUND",
        "Target user profile not found",
        undefined,
        requestId,
      );
    }
    if (target.id === viewerProfileId || target.userId === actorUserId) {
      return fail(
        res,
        400,
        "NO_SELF_FOLLOW",
        "You cannot unfollow yourself",
        undefined,
        requestId,
      );
    }

    const deleted = await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerProfileId, viewerProfileId),
          eq(follows.followedProfileId, target.id),
        ),
      )
      .returning({ id: follows.id });

    if (deleted.length > 0) {
      await safeLogEvent(db, {
        requestId,
        actor_id: actorUserId,
        event_name: "social_follow_deleted",
        actor_profile_ref: viewerProfileId,
        target_profile_ref: target.id,
        meta: {
          source: "social",
        },
      });
    }

    return ok(res, {
      following: false,
      wasFollowing: deleted.length > 0,
      actorProfileId: viewerProfileId,
      targetProfileId: target.id,
    });
  } catch (error) {
    console.error("DELETE /api/social/follow/:userId failed", {
      requestId,
      error,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not unfollow user",
      undefined,
      requestId,
    );
  }
});

router.get("/following", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;
  const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
  if (!viewerProfileId) return;

  try {
    const rows = await db
      .select({
        profileId: userProfiles.id,
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(userProfiles, eq(userProfiles.id, follows.followedProfileId))
      .where(eq(follows.followerProfileId, viewerProfileId))
      .orderBy(desc(follows.createdAt));

    return ok(res, { items: rows });
  } catch (error) {
    console.error("GET /api/social/following failed", { requestId, error });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not list following",
      undefined,
      requestId,
    );
  }
});

router.get("/followers", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;
  const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
  if (!viewerProfileId) return;

  try {
    const rows = await db
      .select({
        profileId: userProfiles.id,
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(userProfiles, eq(userProfiles.id, follows.followerProfileId))
      .where(eq(follows.followedProfileId, viewerProfileId))
      .orderBy(desc(follows.createdAt));

    return ok(res, { items: rows });
  } catch (error) {
    console.error("GET /api/social/followers failed", { requestId, error });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not list followers",
      undefined,
      requestId,
    );
  }
});

router.post("/posts", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(
      res,
      400,
      "VALIDATION_ERROR",
      "Invalid post payload",
      parsed.error.flatten(),
      requestId,
    );
  }

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const [created] = await db
      .insert(posts)
      .values({
        authorId: actorUserId,
        authorProfileId: viewerProfileId,
        content: parsed.data.content,
        visibility: parsed.data.visibility,
      })
      .returning();

    await safeLogEvent(db, {
      requestId,
      actor_id: actorUserId,
      event_name: "social_post_created",
      actor_profile_ref: viewerProfileId,
      post_ref: created.id,
      visibility: created.visibility,
      content_length: parsed.data.content.length,
    });

    await emitSocialEvent({
      requestId,
      eventType: "post_created",
      actorProfileId: viewerProfileId,
      postId: created.id,
      meta: {
        visibility: created.visibility,
      },
    });

    return ok(res, { post: created }, 201);
  } catch (error) {
    console.error("POST /api/social/posts failed", { requestId, error });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not create post",
      undefined,
      requestId,
    );
  }
});

function parseFeedLimit(rawLimit: unknown): number {
  const parsed = Number.parseInt(String(rawLimit ?? "20"), 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, parsed));
}

router.get("/feed/public", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const limit = parseFeedLimit(req.query.limit);

  try {
    await getOrCreateViewerProfileId(actorUserId);

    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.content,
        p.visibility,
        p.created_at,
        p.author_profile_id,
        up.handle AS author_handle,
        up.display_name AS author_display_name
      FROM posts p
      LEFT JOIN user_profiles up ON up.id = p.author_profile_id
      WHERE p.visibility = 'public'::post_visibility
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit}
    `);

    return res.status(200).json({
      items: rows.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("social_feed_public_failed", { requestId, message });
    return res.status(500).json({
      message: "No se pudo cargar el feed.",
    });
  }
});

router.get("/feed/following", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const limit = parseFeedLimit(req.query.limit);

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;

    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.content,
        p.visibility,
        p.created_at,
        p.author_profile_id,
        up.handle AS author_handle,
        up.display_name AS author_display_name
      FROM posts p
      LEFT JOIN user_profiles up ON up.id = p.author_profile_id
      WHERE (
        p.author_profile_id = ${viewerProfileId}
        OR (
          EXISTS (
            SELECT 1
            FROM follows f
            WHERE f.follower_profile_id = ${viewerProfileId}
              AND f.followed_profile_id = p.author_profile_id
          )
          AND (
            p.visibility = 'public'::post_visibility
            OR p.visibility = 'followers'::post_visibility
          )
        )
      )
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit}
    `);

    return res.status(200).json({
      items: rows.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("social_feed_following_failed", { requestId, message });
    return res.status(500).json({
      message: "No se pudo cargar el feed.",
    });
  }
});

router.get("/posts/:id", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const postId = req.params.id;
  if (!UUID_RE.test(postId)) {
    return fail(
      res,
      400,
      "INVALID_POST_ID",
      "Post id must be a UUID v4",
      undefined,
      requestId,
    );
  }

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const visibility = await canViewPost(viewerProfileId, postId);

    if (!visibility.allowed && visibility.reason === "not_found") {
      return fail(
        res,
        404,
        "POST_NOT_FOUND",
        "Post not found",
        undefined,
        requestId,
      );
    }
    if (!visibility.allowed) {
      await logVisibilityDenied({
        requestId,
        actorUserId,
        postId,
        visibility: visibility.post?.visibility,
      });
      return fail(
        res,
        403,
        "FORBIDDEN",
        "You cannot view this post",
        undefined,
        requestId,
      );
    }

    const [row] = await db
      .select({
        id: posts.id,
        content: posts.content,
        visibility: posts.visibility,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        authorProfileId: posts.authorProfileId,
        authorHandle: userProfiles.userId,
        authorDisplayName: userProfiles.displayName,
      })
      .from(posts)
      .innerJoin(userProfiles, eq(userProfiles.id, posts.authorProfileId))
      .where(eq(posts.id, postId))
      .limit(1);

    const [
      { value: inspiresCount },
      { value: sharesCount },
      { value: commentsCount },
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(postReactions)
        .where(
          and(
            eq(postReactions.postId, postId),
            eq(postReactions.reactionType, "inspire"),
          ),
        ),
      db
        .select({ value: count() })
        .from(postShares)
        .where(eq(postShares.postId, postId)),
      db
        .select({ value: count() })
        .from(postComments)
        .where(eq(postComments.postId, postId)),
    ]);

    const [inspiredByActor] = await db
      .select({ id: postReactions.id })
      .from(postReactions)
      .where(
        and(
          eq(postReactions.postId, postId),
          eq(postReactions.profileId, viewerProfileId),
          eq(postReactions.reactionType, "inspire"),
        ),
      )
      .limit(1);

    return ok(res, {
      post: row,
      stats: {
        inspires: Number(inspiresCount),
        shares: Number(sharesCount),
        comments: Number(commentsCount),
        inspiredByActor: !!inspiredByActor,
      },
    });
  } catch (error) {
    console.error("GET /api/social/posts/:id failed", { requestId, error });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not load post",
      undefined,
      requestId,
    );
  }
});

router.post("/posts/:id/inspire", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const postId = req.params.id;
  if (!UUID_RE.test(postId)) {
    return fail(
      res,
      400,
      "INVALID_POST_ID",
      "Post id must be a UUID v4",
      undefined,
      requestId,
    );
  }

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const visibility = await canViewPost(viewerProfileId, postId);

    if (!visibility.allowed && visibility.reason === "not_found") {
      return fail(
        res,
        404,
        "POST_NOT_FOUND",
        "Post not found",
        undefined,
        requestId,
      );
    }
    if (!visibility.allowed) {
      await logVisibilityDenied({
        requestId,
        actorUserId,
        postId,
        visibility: visibility.post?.visibility,
      });
      return fail(
        res,
        403,
        "FORBIDDEN",
        "You cannot inspire this post",
        undefined,
        requestId,
      );
    }

    const [existing] = await db
      .select({ id: postReactions.id })
      .from(postReactions)
      .where(
        and(
          eq(postReactions.postId, postId),
          eq(postReactions.profileId, viewerProfileId),
          eq(postReactions.reactionType, "inspire"),
        ),
      )
      .limit(1);

    if (existing) {
      await db.delete(postReactions).where(eq(postReactions.id, existing.id));

      await safeLogEvent(db, {
        requestId,
        actor_id: actorUserId,
        event_name: "social_post_inspire_removed",
        actor_profile_ref: viewerProfileId,
        post_ref: postId,
        target_profile_ref: visibility.post.authorProfileId,
        visibility: visibility.post.visibility,
      });

      return ok(res, { inspired: false });
    }

    await db.insert(postReactions).values({
      postId,
      profileId: viewerProfileId,
      reactionType: "inspire",
    });

    await safeLogEvent(db, {
      requestId,
      actor_id: actorUserId,
      event_name: "social_post_inspired",
      actor_profile_ref: viewerProfileId,
      post_ref: postId,
      target_profile_ref: visibility.post.authorProfileId,
      visibility: visibility.post.visibility,
    });

    await emitSocialEvent({
      requestId,
      eventType: "post_inspired",
      actorProfileId: viewerProfileId,
      targetProfileId: visibility.post.authorProfileId,
      postId,
    });

    if (visibility.post.authorProfileId !== viewerProfileId) {
      await db.insert(notifications).values({
        recipientProfileId: visibility.post.authorProfileId,
        actorProfileId: viewerProfileId,
        postId,
        notificationType: "post_inspired",
        payload: {
          event_name: "social_post_inspired",
          actor_id: actorUserId,
          actor_profile_id: viewerProfileId,
          post_id: postId,
          author_profile_id: visibility.post.authorProfileId,
          visibility: visibility.post.visibility,
        },
      });
    }

    return ok(res, { inspired: true });
  } catch (error) {
    console.error("POST /api/social/posts/:id/inspire failed", {
      requestId,
      error,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not toggle inspire",
      undefined,
      requestId,
    );
  }
});

router.post("/posts/:id/share", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const postId = req.params.id;
  if (!UUID_RE.test(postId)) {
    return fail(
      res,
      400,
      "INVALID_POST_ID",
      "Post id must be a UUID v4",
      undefined,
      requestId,
    );
  }

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const visibility = await canViewPost(viewerProfileId, postId);

    if (!visibility.allowed && visibility.reason === "not_found") {
      return fail(
        res,
        404,
        "POST_NOT_FOUND",
        "Post not found",
        undefined,
        requestId,
      );
    }
    if (!visibility.allowed) {
      await logVisibilityDenied({
        requestId,
        actorUserId,
        postId,
        visibility: visibility.post?.visibility,
      });
      return fail(
        res,
        403,
        "FORBIDDEN",
        "You cannot share this post",
        undefined,
        requestId,
      );
    }

    const [inserted] = await db
      .insert(postShares)
      .values({
        postId,
        profileId: viewerProfileId,
      })
      .onConflictDoNothing({
        target: [postShares.postId, postShares.profileId],
      })
      .returning({ id: postShares.id });

    await safeLogEvent(db, {
      requestId,
      actor_id: actorUserId,
      event_name: "social_post_shared",
      actor_profile_ref: viewerProfileId,
      post_ref: postId,
      target_profile_ref: visibility.post.authorProfileId,
      visibility: visibility.post.visibility,
      idempotent: !inserted,
    });

    if (inserted) {
      await emitSocialEvent({
        requestId,
        eventType: "post_shared",
        actorProfileId: viewerProfileId,
        targetProfileId: visibility.post.authorProfileId,
        postId,
      });
    }

    if (inserted && visibility.post.authorProfileId !== viewerProfileId) {
      await db.insert(notifications).values({
        recipientProfileId: visibility.post.authorProfileId,
        actorProfileId: viewerProfileId,
        postId,
        notificationType: "post_shared",
        payload: {
          event_name: "social_post_shared",
          actor_id: actorUserId,
          actor_profile_id: viewerProfileId,
          post_id: postId,
          author_profile_id: visibility.post.authorProfileId,
          visibility: visibility.post.visibility,
        },
      });
    }

    return ok(res, { shared: true, idempotent: !inserted });
  } catch (error) {
    console.error("POST /api/social/posts/:id/share failed", {
      requestId,
      error,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not share post",
      undefined,
      requestId,
    );
  }
});

router.post("/posts/:id/comments", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const postId = req.params.id;
  if (!UUID_RE.test(postId)) {
    return fail(
      res,
      400,
      "INVALID_POST_ID",
      "Post id must be a UUID v4",
      undefined,
      requestId,
    );
  }

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(
      res,
      400,
      "VALIDATION_ERROR",
      "Invalid comment payload",
      parsed.error.flatten(),
      requestId,
    );
  }

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const visibility = await canViewPost(viewerProfileId, postId);

    if (!visibility.allowed && visibility.reason === "not_found") {
      return fail(
        res,
        404,
        "POST_NOT_FOUND",
        "Post not found",
        undefined,
        requestId,
      );
    }
    if (!visibility.allowed) {
      await logVisibilityDenied({
        requestId,
        actorUserId,
        postId,
        visibility: visibility.post?.visibility,
      });
      return fail(
        res,
        403,
        "FORBIDDEN",
        "You cannot comment on this post",
        undefined,
        requestId,
      );
    }

    const [created] = await db
      .insert(postComments)
      .values({
        postId,
        authorProfileId: viewerProfileId,
        content: parsed.data.content,
      })
      .returning();

    await safeLogEvent(db, {
      requestId,
      actor_id: actorUserId,
      event_name: "social_comment_created",
      actor_profile_ref: viewerProfileId,
      post_ref: postId,
      target_profile_ref: visibility.post.authorProfileId,
      visibility: visibility.post.visibility,
      content_length: parsed.data.content.length,
    });

    await emitSocialEvent({
      requestId,
      eventType: "post_commented",
      actorProfileId: viewerProfileId,
      targetProfileId: visibility.post.authorProfileId,
      postId,
      meta: {
        commentId: created.id,
      },
    });

    if (visibility.post.authorProfileId !== viewerProfileId) {
      await db.insert(notifications).values({
        recipientProfileId: visibility.post.authorProfileId,
        actorProfileId: viewerProfileId,
        postId,
        commentId: created.id,
        notificationType: "comment_received",
        payload: {
          event_name: "social_comment_created",
          actor_id: actorUserId,
          actor_profile_id: viewerProfileId,
          post_id: postId,
          comment_id: created.id,
          author_profile_id: visibility.post.authorProfileId,
          visibility: visibility.post.visibility,
          content_length: parsed.data.content.length,
        },
      });
    }

    return ok(res, { comment: created }, 201);
  } catch (error) {
    console.error("POST /api/social/posts/:id/comments failed", {
      requestId,
      error,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not create comment",
      undefined,
      requestId,
    );
  }
});

router.get("/posts/:id/comments", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  const postId = req.params.id;
  if (!UUID_RE.test(postId)) {
    return fail(
      res,
      400,
      "INVALID_POST_ID",
      "Post id must be a UUID v4",
      undefined,
      requestId,
    );
  }

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);
    if (!viewerProfileId) return;
    const visibility = await canViewPost(viewerProfileId, postId);

    if (!visibility.allowed && visibility.reason === "not_found") {
      return fail(
        res,
        404,
        "POST_NOT_FOUND",
        "Post not found",
        undefined,
        requestId,
      );
    }
    if (!visibility.allowed) {
      await logVisibilityDenied({
        requestId,
        actorUserId,
        postId,
        visibility: visibility.post?.visibility,
      });
      return fail(
        res,
        403,
        "FORBIDDEN",
        "You cannot view comments for this post",
        undefined,
        requestId,
      );
    }

    const items = await db
      .select({
        id: postComments.id,
        content: postComments.content,
        createdAt: postComments.createdAt,
        updatedAt: postComments.updatedAt,
        authorProfileId: postComments.authorProfileId,
        authorHandle: userProfiles.userId,
        authorDisplayName: userProfiles.displayName,
      })
      .from(postComments)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, postComments.authorProfileId),
      )
      .where(
        and(eq(postComments.postId, postId), isNotNull(postComments.content)),
      )
      .orderBy(desc(postComments.createdAt), desc(postComments.id));

    return ok(res, { items });
  } catch (error) {
    console.error("GET /api/social/posts/:id/comments failed", {
      requestId,
      error,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not load comments",
      undefined,
      requestId,
    );
  }
});

router.get("/notifications", async (req, res) => {
  const requestId = randomUUID();
  const actorUserId = getActorUserId(req, res);
  if (!actorUserId) return;

  try {
    const viewerProfileId = await getOrCreateViewerProfileId(actorUserId);

    const result = await db.execute(sql`
      SELECT *
      FROM social_events
      WHERE target_profile_id = ${viewerProfileId}::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("GET /api/social/notifications failed", {
      requestId,
      message,
    });
    return fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Could not load notifications",
      undefined,
      requestId,
    );
  }
});

export default router;

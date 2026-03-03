import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const postVisibility = pgEnum("post_visibility", [
  "public",
  "followers",
]);
export const mediaType = pgEnum("media_type", [
  "image",
  "video",
  "audio",
  "link",
]);
export const reactionType = pgEnum("reaction_type", ["inspire"]);
export const notificationType = pgEnum("notification_type", [
  "new_follower",
  "post_inspired",
  "post_shared",
  "comment_received",
  "recommendation",
]);

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    displayName: text("display_name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdUnique: uniqueIndex("user_profiles_user_id_unique").on(table.userId),
    createdAtIdx: index("idx_user_profiles_created_at").on(table.createdAt),
  }),
);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    followerProfileId: uuid("follower_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    followedProfileId: uuid("followed_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    followerFollowedUnique: uniqueIndex("follows_follower_followed_unique").on(
      table.followerProfileId,
      table.followedProfileId,
    ),
    followerCreatedAtIdx: index("idx_follows_follower_created_at").on(
      table.followerProfileId,
      table.createdAt,
    ),
    followedCreatedAtIdx: index("idx_follows_followed_created_at").on(
      table.followedProfileId,
      table.createdAt,
    ),
    noSelf: check(
      "follows_no_self",
      sql`${table.followerProfileId} <> ${table.followedProfileId}`,
    ),
  }),
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    authorId: text("author_id").notNull(),
    authorProfileId: uuid("author_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    visibility: postVisibility("visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    authorCreatedAtIdx: index("idx_posts_author_created_at").on(
      table.authorProfileId,
      table.createdAt,
    ),
    visibilityCreatedAtIdx: index("idx_posts_visibility_created_at").on(
      table.visibility,
      table.createdAt,
    ),
  }),
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    mediaType: mediaType("media_type").notNull(),
    url: text("url").notNull(),
    altText: text("alt_text"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postPositionUnique: uniqueIndex("post_media_post_position_unique").on(
      table.postId,
      table.position,
    ),
    postCreatedAtIdx: index("idx_post_media_post_created_at").on(
      table.postId,
      table.createdAt,
    ),
    positionCheck: check(
      "post_media_position_non_negative",
      sql`${table.position} >= 0`,
    ),
  }),
);

export const postReactions = pgTable(
  "post_reactions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    reactionType: reactionType("reaction_type").notNull().default("inspire"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postProfileReactionUnique: uniqueIndex(
      "post_reactions_post_profile_reaction_unique",
    ).on(table.postId, table.profileId, table.reactionType),
    postCreatedAtIdx: index("idx_post_reactions_post_created_at").on(
      table.postId,
      table.createdAt,
    ),
    profileCreatedAtIdx: index("idx_post_reactions_profile_created_at").on(
      table.profileId,
      table.createdAt,
    ),
  }),
);

export const postShares = pgTable(
  "post_shares",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postProfileUnique: uniqueIndex("post_shares_post_profile_unique").on(
      table.postId,
      table.profileId,
    ),
    postCreatedAtIdx: index("idx_post_shares_post_created_at").on(
      table.postId,
      table.createdAt,
    ),
    profileCreatedAtIdx: index("idx_post_shares_profile_created_at").on(
      table.profileId,
      table.createdAt,
    ),
  }),
);

export const postComments = pgTable(
  "post_comments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorProfileId: uuid("author_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postCreatedAtIdx: index("idx_post_comments_post_created_at").on(
      table.postId,
      table.createdAt,
    ),
    parentCommentIdx: index("idx_post_comments_parent_comment_id").on(
      table.parentCommentId,
    ),
    parentCommentFk: foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
      name: "post_comments_parent_comment_id_post_comments_id_fk",
    }).onDelete("set null"),
  }),
);

export const userAffinity = pgTable(
  "user_affinity",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sourceProfileId: uuid("source_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    targetProfileId: uuid("target_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    score: real("score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceTargetUnique: uniqueIndex("user_affinity_source_target_unique").on(
      table.sourceProfileId,
      table.targetProfileId,
    ),
    sourceScoreIdx: index("idx_user_affinity_source_score").on(
      table.sourceProfileId,
      table.score,
    ),
    updatedAtIdx: index("idx_user_affinity_updated_at").on(table.updatedAt),
    noSelf: check(
      "user_affinity_no_self",
      sql`${table.sourceProfileId} <> ${table.targetProfileId}`,
    ),
    scoreRange: check(
      "user_affinity_score_range",
      sql`${table.score} >= 0 AND ${table.score} <= 1`,
    ),
  }),
);

export const userProfileSnapshot = pgTable(
  "user_profile_snapshot",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    followersCount: integer("followers_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    postsCount: integer("posts_count").notNull().default(0),
    inspiredCount: integer("inspired_count").notNull().default(0),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    profileSnapshotAtUnique: uniqueIndex(
      "user_profile_snapshot_profile_snapshot_at_unique",
    ).on(table.profileId, table.snapshotAt),
    profileSnapshotAtIdx: index(
      "idx_user_profile_snapshot_profile_snapshot_at",
    ).on(table.profileId, table.snapshotAt),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    recipientProfileId: uuid("recipient_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    actorProfileId: uuid("actor_profile_id").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    postId: uuid("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    commentId: uuid("comment_id").references(() => postComments.id, {
      onDelete: "set null",
    }),
    notificationType: notificationType("notification_type").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => ({
    recipientCreatedAtIdx: index("idx_notifications_recipient_created_at").on(
      table.recipientProfileId,
      table.createdAt,
    ),
    recipientIsReadCreatedAtIdx: index(
      "idx_notifications_recipient_is_read_created_at",
    ).on(table.recipientProfileId, table.isRead, table.createdAt),
    recipientTypeCreatedAtIdx: index(
      "idx_notifications_recipient_type_created_at",
    ).on(table.recipientProfileId, table.notificationType, table.createdAt),
    noSelfActor: check(
      "notifications_no_self_actor",
      sql`${table.actorProfileId} IS NULL OR ${table.actorProfileId} <> ${table.recipientProfileId}`,
    ),
  }),
);

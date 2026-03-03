CREATE TYPE "public"."media_type" AS ENUM('image', 'video', 'audio', 'link');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_follower', 'post_inspired', 'post_shared', 'comment_received', 'recommendation');--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('public', 'followers');--> statement-breakpoint
CREATE TYPE "public"."reaction_type" AS ENUM('inspire');--> statement-breakpoint

CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_profile_id" uuid NOT NULL,
	"content" text NOT NULL,
	"visibility" "post_visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_profile_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_profile_id" uuid NOT NULL,
	"followed_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_no_self" CHECK ("follows"."follower_profile_id" <> "follows"."followed_profile_id")
);--> statement-breakpoint

CREATE TABLE "post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"url" text NOT NULL,
	"alt_text" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_media_position_non_negative" CHECK ("post_media"."position" >= 0)
);--> statement-breakpoint

CREATE TABLE "post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"reaction_type" "reaction_type" DEFAULT 'inspire' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "post_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "user_affinity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_affinity_no_self" CHECK ("user_affinity"."source_profile_id" <> "user_affinity"."target_profile_id"),
	CONSTRAINT "user_affinity_score_range" CHECK ("user_affinity"."score" >= 0 AND "user_affinity"."score" <= 1)
);--> statement-breakpoint

CREATE TABLE "user_profile_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"posts_count" integer DEFAULT 0 NOT NULL,
	"inspired_count" integer DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"actor_profile_id" uuid,
	"post_id" uuid,
	"comment_id" uuid,
	"notification_type" "notification_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_no_self_actor" CHECK ("notifications"."actor_profile_id" IS NULL OR "notifications"."actor_profile_id" <> "notifications"."recipient_profile_id")
);--> statement-breakpoint

ALTER TABLE "posts" ADD CONSTRAINT "posts_author_profile_id_user_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_profile_id_user_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_comment_id_post_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."post_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_profile_id_user_profiles_id_fk" FOREIGN KEY ("follower_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_profile_id_user_profiles_id_fk" FOREIGN KEY ("followed_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_profile_id_user_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_shares" ADD CONSTRAINT "post_shares_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_shares" ADD CONSTRAINT "post_shares_profile_id_user_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_affinity" ADD CONSTRAINT "user_affinity_source_profile_id_user_profiles_id_fk" FOREIGN KEY ("source_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_affinity" ADD CONSTRAINT "user_affinity_target_profile_id_user_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_snapshot" ADD CONSTRAINT "user_profile_snapshot_profile_id_user_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_profile_id_user_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_profile_id_user_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "user_profiles_handle_unique" ON "user_profiles" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_created_at" ON "user_profiles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_author_created_at" ON "posts" USING btree ("author_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_visibility_created_at" ON "posts" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "idx_post_comments_post_created_at" ON "post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_post_comments_parent_comment_id" ON "post_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_follower_followed_unique" ON "follows" USING btree ("follower_profile_id","followed_profile_id");--> statement-breakpoint
CREATE INDEX "idx_follows_follower_created_at" ON "follows" USING btree ("follower_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_follows_followed_created_at" ON "follows" USING btree ("followed_profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_media_post_position_unique" ON "post_media" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "idx_post_media_post_created_at" ON "post_media" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_post_profile_reaction_unique" ON "post_reactions" USING btree ("post_id","profile_id","reaction_type");--> statement-breakpoint
CREATE INDEX "idx_post_reactions_post_created_at" ON "post_reactions" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_post_reactions_profile_created_at" ON "post_reactions" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_shares_post_profile_unique" ON "post_shares" USING btree ("post_id","profile_id");--> statement-breakpoint
CREATE INDEX "idx_post_shares_post_created_at" ON "post_shares" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_post_shares_profile_created_at" ON "post_shares" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_affinity_source_target_unique" ON "user_affinity" USING btree ("source_profile_id","target_profile_id");--> statement-breakpoint
CREATE INDEX "idx_user_affinity_source_score" ON "user_affinity" USING btree ("source_profile_id","score");--> statement-breakpoint
CREATE INDEX "idx_user_affinity_updated_at" ON "user_affinity" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profile_snapshot_profile_snapshot_at_unique" ON "user_profile_snapshot" USING btree ("profile_id","snapshot_at");--> statement-breakpoint
CREATE INDEX "idx_user_profile_snapshot_profile_snapshot_at" ON "user_profile_snapshot" USING btree ("profile_id","snapshot_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_created_at" ON "notifications" USING btree ("recipient_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_is_read_created_at" ON "notifications" USING btree ("recipient_profile_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_type_created_at" ON "notifications" USING btree ("recipient_profile_id","notification_type","created_at");
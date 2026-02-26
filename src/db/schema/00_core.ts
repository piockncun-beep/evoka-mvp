import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: text('author_id').notNull().references(() => users.clerkUserId),
  title: text('title'),
  content: text('content').notNull(),
  privacy: text('privacy').notNull().default('private'),
  destiny: text('destiny').notNull().default('self'),
  status: text('status').notNull().default('active'),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  isDeleted: boolean('is_deleted').notNull().default(false),
}, (table) => ({
  authorCreatedIdx: index('idx_memories_author_created_at').on(table.authorId, table.createdAt),
  authorIdempotencyKeyUnique: uniqueIndex('idx_memories_author_idempotency_key').on(table.authorId, table.idempotencyKey),
}));
import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const app_events = pgTable('app_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  memory_id: uuid('memory_id'),
  event: text('event').notNull(),
  signal: boolean('signal'),
  comment: text('comment'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

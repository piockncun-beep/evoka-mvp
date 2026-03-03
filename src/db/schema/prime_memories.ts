import {
  pgTable,
  uuid,
  text,
  timestamp,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { memories } from "./00_core";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
});

export const primeMemories = pgTable("prime_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoryId: uuid("memory_id")
    .notNull()
    .references(() => memories.id),
  summary: text("summary").notNull(),
  emotion: text("emotion").notNull(),
  topics: text("topics")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  question: text("question").notNull(),
  embeddingRaw: vector("embedding_raw").notNull(),
  embeddingNormalized: vector("embedding_normalized").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

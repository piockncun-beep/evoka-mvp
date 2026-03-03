import { users } from '../../db/schema/00_core.js';

type EnsureUserExistsDb = {
  insert: (table: typeof users) => {
    values: (values: { clerkUserId: string }) => {
      onConflictDoNothing: (args: { target: unknown }) => {
        returning: (selection: { clerkUserId: unknown }) => Promise<unknown[]>;
      };
    };
  };
};

export async function ensureUserExists(db: EnsureUserExistsDb, clerkUserId: string) {
  const inserted = await db
    .insert(users)
    .values({ clerkUserId })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning({ clerkUserId: users.clerkUserId });

  if (process.env.NODE_ENV !== 'production' && inserted.length > 0) {
    console.log('users upserted', { clerkUserId });
  }
}
// src/server/lib/prime/budget.ts
import { sql } from "drizzle-orm";
import { safeLogEvent } from "../safeLogEvent.js";

type SqlExecutor = {
  execute: (
    query: unknown,
  ) => Promise<{ rows?: Array<Record<string, unknown>> }>;
};

type SqlTransactionalExecutor = SqlExecutor & {
  transaction: <T>(callback: (trx: SqlExecutor) => Promise<T>) => Promise<T>;
};

export function getMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7); // 'YYYY-MM'
}

export async function ensureBudgetRow(
  db: unknown,
  monthKey: string,
  limitUsd: number,
) {
  const executor = db as SqlExecutor;
  await executor.execute(sql`
    INSERT INTO llm_budget (month, usd_limit)
    VALUES (${monthKey}, ${limitUsd})
    ON CONFLICT (month) DO NOTHING;
  `);
}

export async function reserveBudget(
  db: unknown,
  monthKey: string,
  amountUsd: number,
  mode: "hard" | "soft",
) {
  const executor = db as SqlTransactionalExecutor;
  // Transacción
  const tx = await executor.transaction(async (trx) => {
    const rows = await trx.execute(sql`
      SELECT * FROM llm_budget WHERE month = ${monthKey} FOR UPDATE;
    `);
    const row = rows.rows?.[0];
    if (!row) throw new Error("Budget row missing");
    const spent = parseFloat(row.usd_spent);
    const limit = parseFloat(row.usd_limit);
    if (spent + amountUsd > limit) {
      if (mode === "hard") return { allowed: false };
      return { allowed: true, over: true };
    }
    await trx.execute(sql`
      UPDATE llm_budget SET usd_spent = usd_spent + ${amountUsd}, updated_at = now() WHERE month = ${monthKey};
    `);
    return { allowed: true };
  });
  return tx;
}

export async function recordBudgetEvent(
  db: unknown,
  userId: string,
  meta: Record<string, unknown>,
) {
  const event = meta.allowed ? "llm_budget_spend" : "llm_budget_blocked";
  await safeLogEvent(db, {
    actor_id: userId,
    event_name: event,
    meta: {
      meta,
    },
  });
}

// src/server/lib/prime/budget.ts
import { sql } from 'drizzle-orm';

export function getMonthKey(date = new Date()): string {
  return date.toISOString().slice(0,7); // 'YYYY-MM'
}

export async function ensureBudgetRow(db: any, monthKey: string, limitUsd: number) {
  await db.execute(sql`
    INSERT INTO llm_budget (month, usd_limit)
    VALUES (${monthKey}, ${limitUsd})
    ON CONFLICT (month) DO NOTHING;
  `);
}

export async function reserveBudget(db: any, monthKey: string, amountUsd: number, mode: 'hard'|'soft') {
  // Transacción
  const tx = await db.transaction(async (trx: any) => {
    const rows = await trx.execute(sql`
      SELECT * FROM llm_budget WHERE month = ${monthKey} FOR UPDATE;
    `);
    const row = rows.rows?.[0];
    if (!row) throw new Error('Budget row missing');
    const spent = parseFloat(row.usd_spent);
    const limit = parseFloat(row.usd_limit);
    if (spent + amountUsd > limit) {
      if (mode === 'hard') return { allowed: false };
      return { allowed: true, over: true };
    }
    await trx.execute(sql`
      UPDATE llm_budget SET usd_spent = usd_spent + ${amountUsd}, updated_at = now() WHERE month = ${monthKey};
    `);
    return { allowed: true };
  });
  return tx;
}

export async function recordBudgetEvent(db: any, userId: string, meta: any) {
  const event = meta.allowed ? 'llm_budget_spend' : 'llm_budget_blocked';
  await db.execute(sql`
    INSERT INTO app_events (user_id, event, meta, created_at)
    VALUES (${userId}, ${event}, ${JSON.stringify(meta)}, now());
  `);
}

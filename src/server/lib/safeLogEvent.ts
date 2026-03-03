import { sql } from "drizzle-orm";

type SafeLogEventPayload = {
  requestId?: string;
  actor_id: string;
  event_name: string;
  actor_profile_ref?: string | null;
  post_ref?: string | null;
  comment_ref?: string | null;
  target_profile_ref?: string | null;
  visibility?: string | null;
  content_length?: number | null;
  idempotent?: boolean | null;
  meta?: Record<string, unknown> | null;
};

const ALLOWED_META_KEYS = new Set([
  "event_name",
  "actor_id",
  "actor_profile_ref",
  "post_ref",
  "comment_ref",
  "target_profile_ref",
  "visibility",
  "content_length",
  "idempotent",
  "meta",
]);

const BLOCKED_TEXT_KEYS = new Set([
  "content",
  "comment",
  "text",
  "body",
  "message",
  "prompt",
  "post_content",
  "comment_content",
]);

function sanitizeValue(value: unknown, removedKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, removedKeys));
  }

  if (value && typeof value === "object") {
    const nested: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalizedKey = key.toLowerCase();
      if (BLOCKED_TEXT_KEYS.has(normalizedKey)) {
        removedKeys.add(normalizedKey);
        continue;
      }
      if (nestedValue === undefined) continue;
      nested[key] = sanitizeValue(nestedValue, removedKeys);
    }
    return nested;
  }

  return value;
}

function sanitizeMeta(raw: Record<string, unknown> | null | undefined): {
  sanitized: Record<string, unknown>;
  removedKeys: string[];
} {
  if (!raw) {
    return {
      sanitized: {},
      removedKeys: [],
    };
  }

  const removedKeys = new Set<string>();
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.toLowerCase();
    if (BLOCKED_TEXT_KEYS.has(normalizedKey)) {
      removedKeys.add(normalizedKey);
      continue;
    }
    if (value === undefined) continue;
    if (ALLOWED_META_KEYS.has(key)) {
      sanitized[key] = sanitizeValue(value, removedKeys);
      continue;
    }
    sanitized[key] = sanitizeValue(value, removedKeys);
  }
  return {
    sanitized,
    removedKeys: Array.from(removedKeys),
  };
}

export async function safeLogEvent(
  db: unknown,
  payload: SafeLogEventPayload,
): Promise<void> {
  const { sanitized: telemetry, removedKeys } = sanitizeMeta(payload.meta);

  if (removedKeys.length > 0) {
    console.warn("meta_sanitized", {
      requestId: payload.requestId,
      eventName: payload.event_name,
      actorId: payload.actor_id,
      removedKeys,
    });
  }

  const row = {
    event_name: payload.event_name,
    actor_id: payload.actor_id,
    actor_profile_ref: payload.actor_profile_ref
      ? String(payload.actor_profile_ref)
      : null,
    post_ref: payload.post_ref ? String(payload.post_ref) : null,
    comment_ref: payload.comment_ref ? String(payload.comment_ref) : null,
    target_profile_ref: payload.target_profile_ref
      ? String(payload.target_profile_ref)
      : null,
    visibility: payload.visibility ?? null,
    content_length: payload.content_length ?? null,
    idempotent: payload.idempotent ?? null,
    meta: Object.keys(telemetry).length > 0 ? telemetry : null,
  };

  try {
    const executor = db as { execute: (query: unknown) => Promise<unknown> };
    await executor.execute(sql`
      INSERT INTO app_events (
        event_name,
        actor_id,
        actor_profile_ref,
        post_ref,
        comment_ref,
        target_profile_ref,
        visibility,
        content_length,
        idempotent,
        meta,
        created_at
      )
      VALUES (
        ${row.event_name},
        ${row.actor_id},
        ${row.actor_profile_ref},
        ${row.post_ref},
        ${row.comment_ref},
        ${row.target_profile_ref},
        ${row.visibility},
        ${row.content_length},
        ${row.idempotent},
        ${row.meta ? sql`${JSON.stringify(row.meta)}::jsonb` : null},
        now()
      )
    `);
  } catch (error) {
    const err = error as { name?: string; message?: string };
    console.warn("safeLogEvent failed", {
      requestId: payload.requestId,
      eventName: payload.event_name,
      actorId: payload.actor_id,
      error: {
        name: err?.name,
        message: err?.message,
      },
    });
  }
}

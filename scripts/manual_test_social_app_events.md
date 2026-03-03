# Manual test: `social_post_created` en `app_events` (sin texto)

## Prerrequisitos

- Backend corriendo: `pnpm api` o `pnpm dev`
- `DATABASE_URL` apuntando a Neon
- Token Clerk válido en variable `AUTH_TOKEN`

## 1) Crear post social

```bash
curl -i -X POST http://localhost:8787/api/social/posts \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Post de prueba para auditoría","visibility":"public"}'
```

Esperado:

- HTTP `201`
- Body con `ok: true`

## 2) Verificar evento en Neon

```sql
SELECT
  id,
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
FROM public.app_events
WHERE event_name = 'social_post_created'
ORDER BY created_at DESC
LIMIT 1;
```

Esperado:

- `event_name = 'social_post_created'`
- `post_ref` no nulo
- `content_length` con valor numérico
- `meta` NO contiene texto del post

## 3) Validar que meta no guarda `content/comment/text/body/message`

```sql
SELECT
  id,
  event_name,
  meta
FROM public.app_events
WHERE event_name = 'social_post_created'
  AND (
    meta ? 'content'
    OR meta ? 'comment'
    OR meta ? 'text'
    OR meta ? 'body'
    OR meta ? 'message'
  )
ORDER BY created_at DESC
LIMIT 5;
```

Esperado:

- `0 rows`

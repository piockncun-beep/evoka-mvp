## 1) Resumen ejecutivo

- Se implementó social/feed v1 con schema Drizzle + migración SQL para 10 tablas sociales, enums, FKs, índices y constraints base.
- Se agregaron endpoints Express autenticados con Clerk para follow, posts, feed con cursor, inspire toggle, share idempotente y comments.
- El feed `following` usa paginación por cursor `(created_at, id)` con orden estable `created_at DESC, id DESC`.
- Telemetría social en `app_events` se diseñó solo con metadata (sin texto de `posts/comments`), pero hay un riesgo de compatibilidad de columna `meta` en DB (ver auditoría).
- No se detectan triggers `updated_at` para tablas sociales: **NO IMPLEMENTADO**.

## 2) Lo que se implementó

- `src/db/schema/social.ts` — schema Drizzle social v1 (tablas, enums, índices, checks, FKs).
- `src/db/migrations/0008_charming_tana_nile.sql` — DDL SQL social v1 aplicado por migración.
- `src/db/migrations/meta/0008_snapshot.json` — snapshot Drizzle de la migración `0008`.
- `src/db/migrations/meta/_journal.json` — journal de migraciones, entrada para `0008_charming_tana_nile`.
- `src/server/social.ts` — router Express social/feed con auth, validaciones y errores consistentes.
- `src/server/index.ts` — montaje de rutas `/api/social`.
- `src/db/schema/memories.ts` — ajuste de import para compatibilidad `drizzle-kit`.
- `src/db/schema/prime_memories.ts` — ajuste de import para compatibilidad `drizzle-kit`.

## 3) Base de datos (Neon)

### DDL aplicado

- Enums: `post_visibility`, `media_type`, `reaction_type`, `notification_type`.
- Tablas social v1: `user_profiles`, `follows`, `posts`, `post_media`, `post_reactions`, `post_shares`, `post_comments`, `user_affinity`, `user_profile_snapshot`, `notifications`.
- Índices clave incluidos:
  - Feed/posts: `idx_posts_author_created_at`, `idx_posts_visibility_created_at`.
    - Follows: `idx_follows_follower_created_at`, `idx_follows_followed_created_at`, unique `follows_follower_followed_unique`.
      - Reactions/shares/comments: índices por `post_id` y por `profile_id` cuando aplica.
        - Notifications: `idx_notifications_recipient_created_at`, `idx_notifications_recipient_is_read_created_at`, `idx_notifications_recipient_type_created_at`.
        - Constraints:
          - `no_self`: `follows_no_self`, `user_affinity_no_self`, `notifications_no_self_actor`.
            - rango: `user_affinity_score_range`.
              - unicidad: follows/reactions/shares/media-position/snapshot.
              - Triggers `updated_at`: **NO IMPLEMENTADO** (solo defaults `now()` en columnas).

              ### FK/relaciones y ON DELETE
              - `posts.author_profile_id -> user_profiles.id` (`ON DELETE CASCADE`).
              - `follows.* -> user_profiles.id` (`ON DELETE CASCADE`).
              - `post_media.post_id -> posts.id` (`ON DELETE CASCADE`).
              - `post_reactions.post_id -> posts.id` y `profile_id -> user_profiles.id` (`ON DELETE CASCADE`).
              - `post_shares.post_id -> posts.id` y `profile_id -> user_profiles.id` (`ON DELETE CASCADE`).
              - `post_comments.post_id -> posts.id` y `author_profile_id -> user_profiles.id` (`ON DELETE CASCADE`).
              - `post_comments.parent_comment_id -> post_comments.id` (`ON DELETE SET NULL`).
              - `notifications.recipient_profile_id -> user_profiles.id` (`ON DELETE CASCADE`).
              - `notifications.actor_profile_id/post_id/comment_id` (`ON DELETE SET NULL`).

              ### Riesgos de integridad detectados
              - `app_events` en SQL histórico visible no muestra columna `meta`, pero backend social inserta `meta::jsonb` → riesgo de error runtime en eventos.
              - No hay trigger de actualización automática para `updated_at` en `posts`, `post_comments`, `user_profiles`, `user_affinity`.
              - Validaciones de longitud de contenido están en backend; no hay `CHECK` SQL para `posts.content` / `post_comments.content`.

              ## 4) Backend (Express)

              ### Endpoints implementados (todos con auth Clerk por `router.use(authMiddleware)`)
              - `POST /api/social/follow/:userId`
              - `DELETE /api/social/follow/:userId`
              - `GET /api/social/following`
              - `GET /api/social/followers`
              - `POST /api/social/posts`
              - `GET /api/social/feed/following?cursor=`
              - `GET /api/social/posts/:id`
              - `POST /api/social/posts/:id/inspire` (toggle)
              - `POST /api/social/posts/:id/share` (idempotente)
              - `POST /api/social/posts/:id/comments`
              - `GET /api/social/posts/:id/comments`

              ### Validaciones críticas
              - Actor siempre desde `req.auth.userId` (resuelto a `user_profiles`).
              - `NO_SELF_FOLLOW` validado en follow/unfollow.
              - Longitud `posts.content`: `1..5000`.
              - Longitud `comments.content`: `1..2000`.
              - `postId` validado como UUID v4.
              - Cursor feed validado (`createdAt` datetime + `id` uuid).
              - Share idempotente con `onConflictDoNothing` sobre `(post_id, profile_id)`.

              ### Manejo de errores (HTTP)
              - `400`: validación (`VALIDATION_ERROR`), cursor inválido, `postId` inválido, self-follow.
              - `401`: no autenticado (`UNAUTHORIZED`).
              - `403`: acceso denegado por visibilidad/follow.
              - `404`: post o usuario objetivo no encontrado.
              - `500`: `INTERNAL_ERROR` con `requestId`.
              - Respuesta consistente: `{ ok: true, data }` / `{ ok: false, error: { code, message, details?, requestId? } }`.

              ## 5) Drizzle

              ### Schema y migraciones
              - Schema social: `src/db/schema/social.ts`.
              - Migración social: `0008_charming_tana_nile` en `src/db/migrations/0008_charming_tana_nile.sql`.
              - Snapshot/meta: `src/db/migrations/meta/0008_snapshot.json`, `src/db/migrations/meta/_journal.json`.

              ### Comandos usados
              - `pnpm db:generate`
              - `pnpm db:migrate`

              ## 6) Telemetría (app_events)

              Eventos agregados (nombres exactos):
              - `social_follow_created`
              - `social_follow_deleted`
              - `social_post_created`
              - `social_post_inspired`
              - `social_post_inspire_removed`
              - `social_post_shared`
              - `social_comment_created`

              Payload metadata observado:
              - `event_name`, `actor_id`, `actor_profile_id`, `author_id`/`author_profile_id`, `post_id`, `comment_id`, `visibility`, `content_length`, `idempotent`.
              - Regla “sin texto en app_events”: **CUMPLIDA en social.ts** (no guarda `content` de posts/comments).

              ## 7) Auditoría corta Neon/Postgres (máx 12 bullets)
              - Índice feed por tiempo: `idx_posts_visibility_created_at` y `idx_posts_author_created_at` existen.
              - Índices follows por follower/followed existen (`idx_follows_follower_created_at`, `idx_follows_followed_created_at`).
              - Índices reactions/shares por post existen (`idx_post_reactions_post_created_at`, `idx_post_shares_post_created_at`).
              - Índices notifications por usuario existen (`idx_notifications_recipient_*`).
              - Unique follows: `follows_follower_followed_unique` existe.
              - Unique reactions: `post_reactions_post_profile_reaction_unique` existe.
              - Unique shares: `post_shares_post_profile_unique` existe.
              - Check `no_self` en follows/user_affinity/notifications existe.
              - FK de comments anidados (`parent_comment_id`) existe con `ON DELETE SET NULL`.
              - Triggers `updated_at`: **NO IMPLEMENTADO**.
              - Riesgo: inserción de `app_events.meta` puede fallar si la columna no existe en DB actual.
              - Riesgo: sin RLS; acceso se controla solo en backend.

              Mejoras concretas:
              - Implementar RLS por `user_profiles.id` + políticas para feed/read/write.
              - Agregar trigger reusable `set_updated_at()` en tablas con `updated_at`.
              - Mover contadores (`followers/posts/inspires`) a job async/materialized strategy.

              ## 8) Checklist Hecho / Falta

              | Ítem                                    | Estado | Nota                            |
              | --------------------------------------- | ------ | ------------------------------- |
              | Schema social v1 (10 tablas)            | Hecho  | En schema + migración `0008`    |
              | Enums social                            | Hecho  | 4 enums definidos               |
              | Índices y constraints clave             | Hecho  | Includes unique/check/no_self   |
              | Endpoints social/feed                   | Hecho  | 11 endpoints implementados      |
              | Feed cursor `(created_at,id)`           | Hecho  | Orden desc + tie-breaker id     |
              | Regla visibilidad feed                  | Hecho  | `public` o `followers` si sigue |
              | Telemetría sin texto de contenido       | Hecho  | Metadata-only en social         |
              | Trigger `updated_at`                    | Falta  | NO IMPLEMENTADO                 |
              | Validación DB de longitudes con CHECK   | Falta  | Solo validación backend         |
              | Verificación directa en Neon desde aquí | Falta  | Sin acceso DB en este entorno   |

              ## 9) Instrucciones para reproducir local
              1. Instalar dependencias:
                 - `pnpm install`
                 2. Configurar entorno:
                    - `cp .env.example .env`
                      - definir `DATABASE_URL` (Neon) y `CLERK_SECRET_KEY`.
                      3. Generar migraciones (si cambias schema):
                         - `pnpm db:generate`
                         4. Ejecutar migraciones:
                            - `pnpm db:migrate`
                            5. Levantar API y frontend:
                               - `pnpm dev`
                               6. Probar endpoints social con token Clerk Bearer en `/api/social/*`.
                               7. Verificar lint de backend social:
                                  - `pnpm exec eslint src/server/social.ts src/server/index.ts`

                                  ### Commits (si disponibles)
                                  - Commits recientes visibles:
                                    - `91c72d7` — `chore(dev): enforce strictPort and single dev entrypoint`
                                      - `3fd17cd` — `refactor(db): unify memories schema`
                                        - `e7fb50d` — `test(api): cover post memories`
                                        - Commits específicos del trabajo social/feed en este estado: **NO DISPONIBLE** (cambios están sin commit en working tree).

                                        ***

                                        ## SQL AUDITORÍA

                                        ```sql
                                        -- 1) Listar tablas del esquema public
                                        SELECT table_name
                                        FROM information_schema.tables
                                        WHERE table_schema = 'public'
                                        ORDER BY table_name;
                                        ```

                                        ````sql
                                        -- 2) Listar índices por tabla (public)
                                        SELECT
                                          tablename,
                                            indexname,
                                              indexdef
                                              FROM pg_indexes
                                              WHERE schemaname = 'public'
                                              ORDER BY tablename, indexname;
                                              ```

                                              ```sql
                                              -- 3) Listar constraints UNIQUE/CHECK por tabla
                                              SELECT
                                                tc.table_name,
                                                  tc.constraint_name,
                                                    tc.constraint_type,
                                                      cc.check_clause
                                                      FROM information_schema.table_constraints tc
                                                      LEFT JOIN information_schema.check_constraints cc
                                                        ON cc.constraint_name = tc.constraint_name
                                                        WHERE tc.table_schema = 'public'
                                                          AND tc.constraint_type IN ('UNIQUE', 'CHECK')
                                                          ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
                                                          ```

                                                          ```sql
                                                          -- 4) Verificar triggers relacionados a updated_at
                                                          SELECT
                                                            event_object_table AS table_name,
                                                              trigger_name,
                                                                action_timing,
                                                                  event_manipulation,
                                                                    action_statement
                                                                    FROM information_schema.triggers
                                                                    WHERE trigger_schema = 'public'
                                                                      AND (
                                                                          trigger_name ILIKE '%updated_at%'
                                                                              OR action_statement ILIKE '%updated_at%'
                                                                                )
                                                                                ORDER BY event_object_table, trigger_name;
                                                                                ```

                                                                                ```sql
                                                                                -- 5) Top 5 posts recientes + joins de follow/reactions/shares
                                                                                SELECT
                                                                                  p.id AS post_id,
                                                                                    p.created_at,
                                                                                      p.visibility,
                                                                                        p.author_profile_id,
                                                                                          COALESCE(r.reactions_count, 0) AS reactions_count,
                                                                                            COALESCE(s.shares_count, 0) AS shares_count,
                                                                                              COALESCE(f.followers_count, 0) AS followers_count
                                                                                              FROM posts p
                                                                                              LEFT JOIN (
                                                                                                SELECT post_id, COUNT(*) AS reactions_count
                                                                                                  FROM post_reactions
                                                                                                    GROUP BY post_id
                                                                                                    ) r ON r.post_id = p.id
                                                                                                    LEFT JOIN (
                                                                                                      SELECT post_id, COUNT(*) AS shares_count
                                                                                                        FROM post_shares
                                                                                                          GROUP BY post_id
                                                                                                          ) s ON s.post_id = p.id
                                                                                                          LEFT JOIN (
                                                                                                            SELECT followed_profile_id AS author_profile_id, COUNT(*) AS followers_count
                                                                                                              FROM follows
                                                                                                                GROUP BY followed_profile_id
                                                                                                                ) f ON f.author_profile_id = p.author_profile_id
                                                                                                                ORDER BY p.created_at DESC, p.id DESC
                                                                                                                LIMIT 5;
                                                                                                                ```

                                                                                                                ```sql
                                                                                                                -- (Opcional) Verificar columnas de app_events para metadata JSON
                                                                                                                SELECT
                                                                                                                  column_name,
                                                                                                                    data_type
                                                                                                                    FROM information_schema.columns
                                                                                                                    WHERE table_schema = 'public'
                                                                                                                      AND table_name = 'app_events'
                                                                                                                      ORDER BY ordinal_position;
                                                                                                                      ```
                                        ````

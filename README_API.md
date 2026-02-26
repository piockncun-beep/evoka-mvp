# Budget Guard (5 USD/mes)

El backend Express implementa un guardia de presupuesto mensual para OpenAI usando Neon/Postgres y Drizzle.

**¿Cómo funciona?**
- Antes de cada llamada a OpenAI (análisis PRIME o embeddings), se verifica el gasto mensual en la tabla `llm_budget`.
- Si el gasto estimado supera el límite (por defecto 5 USD/mes, configurable), el sistema responde con fallback determinístico (sin error, provider='fallback_budget_exceeded').
- Si el gasto está dentro del límite, se reserva el monto estimado y se realiza la llamada real a OpenAI.
- Al recibir respuesta, se ajusta el gasto real si es mayor al estimado (opcional, preferencia conservadora).
- Todos los eventos de gasto y bloqueos se registran en la tabla `app_events` con meta detallada: provider, mes, estimado, real, tokens, modelo, latencia.

**Variables en `.env.example`:**
  - PRIME_BUDGET_LIMIT_USD=5
  - PRIME_BUDGET_MONTHLY=true
  - PRIME_BUDGET_MODE=hard
  - PRIME_BUDGET_ENABLED=true
  - PRIME_INPUT_USD_PER_1K=0.0005
  - PRIME_OUTPUT_USD_PER_1K=0.0015
  - EMBEDDING_USD_PER_1K=0.00002

**Corte mensual:**
- El presupuesto se resetea automáticamente cada mes por clave 'YYYY-MM'.
- No requiere intervención manual.

**UX:**
- Si el presupuesto se excede, el backend responde éxito usando fallback y meta provider='fallback_budget_exceeded'.
- Los endpoints nunca rompen por presupuesto.

**Logging:**
- Todos los endpoints POST /api/memories y /api/memories/search incluyen en app_events meta:
  - provider: openai | fallback_budget_exceeded | fallback_error | mock
  - budget_month
  - estimated_usd
  - real_usd (si disponible)
  - usage tokens (si disponible)

**Reset automático:**
- El corte mensual ocurre por monthKey, sin cron ni scripts.

**Tabla llm_budget:**
- month text PRIMARY KEY (formato 'YYYY-MM')
- usd_spent numeric(10,4) NOT NULL DEFAULT 0
- usd_limit numeric(10,2) NOT NULL DEFAULT 5
- updated_at timestamptz NOT NULL DEFAULT now()
# OpenAI setup

Para usar PRIME v1 con OpenAI:

- Agrega en tu `.env`:
  - OPENAI_API_KEY=<tu key>
  - PRIME_PROVIDER=openai
  - PRIME_MODEL=gpt-4.1-mini (o el modelo que prefieras)
  - EMBEDDING_MODEL=text-embedding-3-small
  - EMBEDDING_DIM=1536

Si no hay key o PRIME_PROVIDER=mock, se usa fallback determinístico.

Puedes probar endpoints normalmente. El análisis PRIME y embeddings serán reales si hay key, o simulados si no.
# EVOKA MVP - API Endpoints

## Requisitos
- Tener Clerk configurado y obtener un token JWT válido (ver docs Clerk)
- Backend corriendo en http://localhost:8787

## Crear memoria
```
curl -X POST http://localhost:8787/api/memories \
  -H "Authorization: Bearer <CLERK_TOKEN>" \
  -H "Idempotency-Key: <UUID_OR_CLIENT_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hoy recorde a mi abuela y senti mucha nostalgia.", "title": "Abuela", "privacy": "private", "status": "active", "destiny": "self"}'
```

Notas:
- `authorId` nunca va en el body, siempre sale del token.
- Repite la misma request con el mismo `Idempotency-Key` para obtener 200 con `{ "idempotent": true }`.

Ejemplo idempotente:
```
curl -X POST http://localhost:8787/api/memories \
  -H "Authorization: Bearer <CLERK_TOKEN>" \
  -H "Idempotency-Key: 6c5b8c1e-7f9b-4a2e-9a07-6f9b1a2c3d4e" \
  -H "Content-Type: application/json" \
  -d '{"content": "Mi primer dia de trabajo.", "privacy": "private"}'
```

## Buscar memorias relacionadas (semántica)
```
curl -X POST http://localhost:8787/api/memories/search \
  -H "Authorization: Bearer <CLERK_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "recuerdo de infancia"}'
```

## Feedback PRIME (👍/👎)
```
curl -X POST http://localhost:8787/api/memories/<MEMORY_ID>/feedback \
  -H "Authorization: Bearer <CLERK_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"signal": true, "comment": "Muy preciso"}'
```

## Notas
- Todos los endpoints requieren header Authorization con token Clerk válido.
- El análisis PRIME y embeddings están simulados en esta fase.
- Ver código para detalles de payload de respuesta.

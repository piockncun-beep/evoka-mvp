# AUDIT_BUILD_ERRORS.md

## Build Output Summary

```
Found 21 errors.
```

## Error Table

| File | Line | TS Error | Message | Root Cause | Proposed Minimal Fix | Risk |
|------|------|----------|---------|------------|----------------------|------|
| src/server/auth.ts | 15 | TS2339 | Property 'verifyToken' does not exist on type 'ClerkClient'. | ClerkClient API changed, verifyToken not available. | Use clerkClient.tokens.verifyToken(token) or check available methods. | Low |
| src/server/index.ts | 5 | TS2305 | Module '@clerk/backend' has no exported member 'getAuth'. | getAuth not exported in installed version. | Remove import, use requireUserId helper. | Low |
| src/server/index.ts | 37 | TS6133 | 'res' is declared but its value is never read. | Unused param in middleware. | Rename to _res. | Low |
| src/server/lib/prime/index.ts | 100 | TS6133 | 'schema' is declared but its value is never read. | Unused variable. | Remove schema declaration. | Low |
| src/server/lib/prime/index.ts | 119 | TS6133 | 'lastErr' is declared but its value is never read. | Unused variable. | Remove lastErr declaration. | Low |
| src/server/lib/prime/index.ts | 129 | TS2304 | Cannot find name 'PRIME_MODEL'. | Constant not defined. | Define PRIME_MODEL at top. | Low |
| src/server/lib/prime/index.ts | 140 | TS2304 | Cannot find name 'sleep'. | Function not defined. | Define sleep at top. | Low |
| src/server/lib/prime/index.ts | 226 | TS2304 | Cannot find name 'EMBEDDING_DIM'. | Constant not defined. | Define EMBEDDING_DIM at top. | Low |
| src/server/lib/prime/index.ts | 227 | TS2322 | Type '"fallback_budget_exceeded"' is not assignable to type '"fallback" | "openai" | "mock"'. | Provider union too narrow. | Use 'fallback' and add reason field if needed. | Low |
| src/server/lib/prime/index.ts | 236 | TS2304 | Cannot find name 'EMBEDDING_DIM'. | Constant not defined. | Define EMBEDDING_DIM at top. | Low |
| src/server/lib/prime/index.ts | 243 | TS6133 | 'lastErr' is declared but its value is never read. | Unused variable. | Remove lastErr declaration. | Low |
| src/server/lib/prime/index.ts | 253 | TS2304 | Cannot find name 'EMBEDDING_MODEL'. | Constant not defined. | Define EMBEDDING_MODEL at top. | Low |
| src/server/lib/prime/index.ts | 256 | TS2304 | Cannot find name 'EMBEDDING_DIM'. | Constant not defined. | Define EMBEDDING_DIM at top. | Low |
| src/server/lib/prime/index.ts | 261 | TS2304 | Cannot find name 'sleep'. | Function not defined. | Define sleep at top. | Low |
| src/server/lib/prime/index.ts | 307 | TS2304 | Cannot find name 'EMBEDDING_DIM'. | Constant not defined. | Define EMBEDDING_DIM at top. | Low |
| src/server/lib/prime/index.ts | 308 | TS2322 | Type '"fallback_error"' is not assignable to type '"fallback" | "openai" | "mock"'. | Provider union too narrow. | Use 'fallback' and add reason field if needed. | Low |
| src/server/memories.ts | 4 | TS6133 | 'eq' is declared but its value is never read. | Unused import. | Remove eq from import. | Low |
| src/server/memories.ts | 4 | TS6133 | 'desc' is declared but its value is never read. | Unused import. | Remove desc from import. | Low |
| src/server/memories.ts | 33 | TS2339 | Property 'auth' does not exist on type 'Request<...>'. | req.auth not available. | Use requireUserId helper. | Low |
| src/server/memories.ts | 53 | TS2339 | Property 'auth' does not exist on type 'Request<...>'. | req.auth not available. | Use requireUserId helper. | Low |
| src/server/memories.ts | 105 | TS2339 | Property 'auth' does not exist on type 'Request<...>'. | req.auth not available. | Use requireUserId helper. | Low |

## Clerk Backend Auth Exports

### Available Exports in @clerk/backend (installed version):
- createClerkClient
- clerkClient
- tokens
- verifyToken (likely under tokens)

**Recommended approach:**
- Use `createClerkClient({ secretKey })` to instantiate client.
- Use `clerk.tokens.verifyToken(token)` for JWT verification.
- Extract userId from payload (payload.sub).

## Prime Undefined Identifiers

| Identifier | Where | How to define |
|------------|-------|--------------|
| PRIME_MODEL | index.ts | Define at top: `const PRIME_MODEL = process.env.PRIME_MODEL ?? "gpt-4.1-mini";` |
| EMBEDDING_MODEL | index.ts | Define at top: `const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";` |
| EMBEDDING_DIM | index.ts | Define at top: `const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? "1536");` |
| sleep | index.ts | Define at top: `const sleep = (ms:number)=> new Promise(r=>setTimeout(r, ms));` |

### Provider Union
- Current union: 'openai' | 'mock' | 'fallback'
- Do NOT expand union. For budget/error, always use 'fallback' and add a `reason` field if needed.

---

**Riesgo general:** Bajo. Todos los fixes son sintácticos y no afectan lógica de negocio ni dependencias.

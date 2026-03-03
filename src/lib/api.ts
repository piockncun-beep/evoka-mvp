// src/lib/api.ts
// Helper para llamadas API protegidas con Clerk

type ApiFetchOptions<TBody = unknown> = {
  method?: string;
  body?: TBody;
  token: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function apiFetch<TResponse, TBody = unknown>(
  path: string,
  opts: ApiFetchOptions<TBody>,
): Promise<TResponse> {
  const { method = 'GET', body, token } = opts;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  // Usar ruta relativa para proxy Vite
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null as unknown);
    const normalizedError = isRecord(err) ? err : {};
    throw { status: res.status, ...normalizedError };
  }
  return (await res.json()) as TResponse;
}

// src/lib/telemetry.ts
// Simple helper para registrar eventos en app_events


export async function sendEvent(
  event: string,
  meta: Record<string, unknown>,
  token: string,
) {
  try {
    const res = await fetch('/api/app_events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event, meta }),
    });

    if (res.status === 404) {
      return;
    }
  } catch {
    // Silenciar errores de telemetría
    return;
  }
}

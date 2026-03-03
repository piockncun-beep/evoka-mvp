import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type SocialEventRow = {
  id?: string;
  event_type?: string;
  created_at?: string;
  actor_profile_id?: string | null;
  target_profile_id?: string | null;
  post_id?: string | null;
  meta?: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

export default function Notifications() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<SocialEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadNotifications() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw { status: 401 };

        const data = await apiFetch<SocialEventRow[]>("/api/social/notifications", {
          method: "GET",
          token,
        });

        if (!isMounted) return;
        setItems(Array.isArray(data) ? (data as SocialEventRow[]) : []);
      } catch (err: unknown) {
        if (!isMounted) return;
        const status = readStatus(err);
        if (status === 401) {
          setError("Debes iniciar sesión");
        } else if (status === 403) {
          setError("No autorizado");
        } else {
          setError("No se pudieron cargar las notificaciones");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [getToken]);

  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>
        <div className="max-w-2xl mx-auto bg-neutral-900 p-6 rounded">
          <h2 className="text-3xl font-bold mb-3">Notifications</h2>

          {loading ? <p className="text-neutral-300">Cargando...</p> : null}

          {!loading && error ? (
            <p className="text-red-400">{error}</p>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <p className="text-neutral-300">Sin notificaciones</p>
          ) : null}

          {!loading && !error && items.length > 0 ? (
            <ul className="space-y-3">
              {items.map((row, index) => {
                const key = row.id || `${row.created_at || ""}-${index}`;
                const metaKeys =
                  row.meta && typeof row.meta === "object"
                    ? Object.keys(row.meta).join(", ")
                    : "";

                return (
                  <li key={key} className="border border-neutral-800 rounded p-3">
                    <div className="text-sm text-white">
                      {row.event_type || "unknown_event"}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString()
                        : "Sin fecha"}
                    </div>
                    <div className="text-xs text-neutral-300 mt-2 space-y-1">
                      {row.actor_profile_id ? (
                        <div>actor_profile_id: {row.actor_profile_id}</div>
                      ) : null}
                      {row.target_profile_id ? (
                        <div>target_profile_id: {row.target_profile_id}</div>
                      ) : null}
                      {row.post_id ? <div>post_id: {row.post_id}</div> : null}
                      {metaKeys ? <div>meta keys: {metaKeys}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </SignedIn>
    </>
  );
}
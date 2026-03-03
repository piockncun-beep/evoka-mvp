import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type VisibilityFilter = "all" | "public" | "private";

type ProfileSummaryResponse = {
  profile: {
    userId: string;
    displayName: string | null;
    username: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
  };
  counts: {
    memoriesTotal: number;
    memoriesPublic: number;
    memoriesPrivate: number;
  };
  social: {
    followersCount: number;
    followingCount: number;
  };
  memories: {
    items: Array<{
      id: string;
      title: string | null;
      excerpt: string;
      visibility: "public" | "private";
      createdAt: string;
    }>;
    nextCursor: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function toDisplayName(data: ProfileSummaryResponse["profile"]): string {
  return data.displayName || data.username || "Usuario";
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "U";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function truncateExcerpt(value: string): string {
  return value.length > 140 ? `${value.slice(0, 140)}…` : value;
}

export default function Profile() {
  const { getToken } = useAuth();
  const [data, setData] = useState<ProfileSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VisibilityFilter>("all");

  useEffect(() => {
    let isMounted = true;

    async function loadProfileSummary() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) throw { status: 401 };

        const response = await apiFetch<ProfileSummaryResponse>(
          "/api/me/profile-summary",
          {
            method: "GET",
            token,
          },
        );

        if (!isMounted) return;
        setData(response);
      } catch (err: unknown) {
        if (!isMounted) return;
        const status = readStatus(err);
        if (status === 401) {
          setError("Debes iniciar sesión");
        } else if (status === 403) {
          setError("No autorizado");
        } else {
          setError("No se pudo cargar el perfil");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProfileSummary();

    return () => {
      isMounted = false;
    };
  }, [getToken]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.memories.items;
    return data.memories.items.filter((item) => item.visibility === filter);
  }, [data, filter]);

  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>
        <div className="max-w-3xl mx-auto bg-neutral-900 p-6 rounded">
          <h2 className="text-3xl font-bold mb-4">Perfil Demo</h2>

          {loading ? <p className="text-neutral-300">Cargando perfil…</p> : null}

          {!loading && error ? <p className="text-red-400">{error}</p> : null}

          {!loading && !error && data ? (
            <>
              <section className="border border-neutral-800 rounded p-4 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  {data.profile.avatarUrl ? (
                    <img
                      src={data.profile.avatarUrl}
                      alt="Avatar"
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center font-semibold">
                      {toInitials(toDisplayName(data.profile))}
                    </div>
                  )}
                  <div>
                    <div className="text-xl font-semibold">{toDisplayName(data.profile)}</div>
                    <div className="text-xs text-neutral-400">{data.profile.userId}</div>
                  </div>
                </div>

                {data.profile.bio ? (
                  <p className="text-neutral-300 mb-2 whitespace-pre-wrap">{data.profile.bio}</p>
                ) : null}

                {data.profile.createdAt ? (
                  <div className="text-xs text-neutral-500">
                    Miembro desde {formatDate(data.profile.createdAt)}
                  </div>
                ) : null}
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="border border-neutral-800 rounded p-3">
                  <h3 className="font-semibold mb-2">Memorias</h3>
                  <div className="text-sm text-neutral-300">Total: {data.counts.memoriesTotal}</div>
                  <div className="text-sm text-neutral-300">Públicas: {data.counts.memoriesPublic}</div>
                  <div className="text-sm text-neutral-300">Privadas: {data.counts.memoriesPrivate}</div>
                </div>
                <div className="border border-neutral-800 rounded p-3">
                  <h3 className="font-semibold mb-2">Social</h3>
                  <div className="text-sm text-neutral-300">Seguidores: {data.social.followersCount}</div>
                  <div className="text-sm text-neutral-300">Siguiendo: {data.social.followingCount}</div>
                </div>
              </section>

              <section className="border border-neutral-800 rounded p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-semibold">Historial de memorias</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`px-3 py-1 rounded text-sm ${
                        filter === "all" ? "bg-blue-600" : "bg-neutral-800"
                      }`}
                      onClick={() => setFilter("all")}
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded text-sm ${
                        filter === "public" ? "bg-blue-600" : "bg-neutral-800"
                      }`}
                      onClick={() => setFilter("public")}
                    >
                      Públicas
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded text-sm ${
                        filter === "private" ? "bg-blue-600" : "bg-neutral-800"
                      }`}
                      onClick={() => setFilter("private")}
                    >
                      Privadas
                    </button>
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <p className="text-neutral-400">No hay memorias para este filtro.</p>
                ) : (
                  <ul className="space-y-3">
                    {filteredItems.map((item) => (
                      <li key={item.id} className="border border-neutral-800 rounded p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="font-medium">{item.title || "Sin título"}</div>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              item.visibility === "public"
                                ? "bg-emerald-700"
                                : "bg-neutral-700"
                            }`}
                          >
                            {item.visibility}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500 mb-2">
                          {formatDate(item.createdAt)}
                        </div>
                        <p className="text-sm text-neutral-300 whitespace-pre-wrap">
                          {truncateExcerpt(item.excerpt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </SignedIn>
    </>
  );
}

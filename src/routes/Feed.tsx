import { useEffect, useState } from "react";
import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type FeedPost = {
  id: string;
  content?: string;
  visibility: "public" | "followers";
  created_at: string;
  author_profile_id: string;
  author_handle: string | null;
  author_display_name: string | null;
};

type FeedResponse = {
  items: FeedPost[];
};

type FeedTab = "public" | "following";

type ApiLikeError = {
  status?: number;
  error?: string | { message?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toApiLikeError(error: unknown): ApiLikeError {
  if (!isRecord(error)) return {};
  const status = typeof error.status === "number" ? error.status : undefined;
  const nested = error.error;
  if (typeof nested === "string") return { status, error: nested };
  if (isRecord(nested)) {
    const message = typeof nested.message === "string" ? nested.message : undefined;
    return { status, error: { message } };
  }
  return { status };
}

export default function Feed() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<FeedPost[]>([]);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers">("public");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FeedTab>("public");

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw { status: 401 };

      const path =
        activeTab === "public"
          ? "/api/social/feed/public?limit=20"
          : "/api/social/feed/following?limit=20";
      const data = await apiFetch<FeedResponse | { data?: FeedResponse }>(path, {
        method: "GET",
        token,
      });
      const parsed =
        ((data as FeedResponse | { data?: FeedResponse })?.items
          ? (data as FeedResponse)
          : ((data as { data?: FeedResponse })?.data ?? { items: [] })) || {
          items: [],
        };
      setItems(parsed.items || []);
    } catch (err: unknown) {
      const apiError = toApiLikeError(err);
      if (apiError.status === 401) {
        setError("Debes iniciar sesión");
      } else if (apiError.status === 403) {
        setError("No autorizado");
      } else {
        const status = apiError.status ? ` (${apiError.status})` : "";
        setError(`No se pudo cargar el feed${status}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw { status: 401 };

      await apiFetch<unknown>("/api/social/posts", {
        method: "POST",
        body: { content, visibility },
        token,
      });

      setContent("");
      await loadFeed();
    } catch (err: unknown) {
      const apiError = toApiLikeError(err);
      if (apiError.status === 401) {
        setError("Debes iniciar sesión");
      } else if (apiError.status === 403) {
        setError("No autorizado");
      } else {
        const message =
          typeof apiError.error === "string"
            ? apiError.error
            : apiError.error?.message;
        setError(message || "No se pudo crear el post");
      }
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, [activeTab]);

  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Feed</h2>

          <form onSubmit={handleCreatePost} className="mb-6 bg-neutral-900 p-4 rounded">
            <label className="block mb-2 font-semibold">Crear post</label>
            <textarea
              className="w-full p-2 mb-3 bg-neutral-800 text-white rounded resize-none"
              placeholder="¿Qué estás pensando?"
              minLength={1}
              maxLength={5000}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              disabled={submitting}
            />

            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-neutral-300">Visibilidad</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "public" | "followers")}
                className="bg-neutral-800 p-2 rounded"
                disabled={submitting}
              >
                <option value="public">public</option>
                <option value="followers">followers</option>
              </select>
            </div>

            <button
              type="submit"
              className="bg-blue-600 px-4 py-2 rounded disabled:opacity-50"
              disabled={submitting || !content.trim()}
            >
              {submitting ? "Publicando…" : "Publicar"}
            </button>
            {error && <div className="text-red-400 mt-2">{error}</div>}
          </form>

          <section className="bg-neutral-900 p-4 rounded">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                className={`px-3 py-1 rounded ${
                  activeTab === "public" ? "bg-blue-600" : "bg-neutral-800"
                }`}
                onClick={() => setActiveTab("public")}
                disabled={loading}
              >
                Para ti
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded ${
                  activeTab === "following" ? "bg-blue-600" : "bg-neutral-800"
                }`}
                onClick={() => setActiveTab("following")}
                disabled={loading}
              >
                Siguiendo
              </button>
            </div>

            {loading ? <p className="text-neutral-400">Cargando feed…</p> : null}

            {!loading && error ? <p className="text-red-400">{error}</p> : null}

            {!loading && items.length === 0 ? (
              <p className="text-neutral-400">Aún no hay posts para mostrar.</p>
            ) : null}

            <ul className="space-y-3">
              {items.map((post) => (
                <li key={post.id} className="border border-neutral-800 rounded p-3">
                  <div className="text-sm text-neutral-400 mb-2">
                    {post.author_display_name || post.author_handle || "Usuario"} ·{" "}
                    {post.visibility}
                  </div>
                  <p className="text-white whitespace-pre-wrap">
                    {post.content || `Post ${post.id}`}
                  </p>
                  <div className="text-xs text-neutral-500 mt-2">
                    {new Date(post.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SignedIn>
    </>
  );
}
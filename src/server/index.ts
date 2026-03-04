import "dotenv/config";
import express from "express";
import type { Request } from "express";
import cors from "cors";
import z from "zod";
import { authMiddleware } from "./auth.js";
import { db } from "./db.js";
import { users } from "../db/schema/00_core.js";
import memoriesRouter from "./memories.js";
import socialRouter from "./social.js";
import { getProfileSummary } from "./profileSummary.js";

declare module "express" {
  interface Request {
    auth?: { userId: string };
  }
}

const app = express();
const PORT = 8787;

// CORS
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "64kb" }));

// Logging in dev
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log("ORIGIN", req.headers.origin);
    if (req.method === "POST" && req.path === "/api/memories") {
      console.log("POST /api/memories body", req.body);
    }
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req: Request, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  }
  res.json({ userId });
});

app.post("/api/me/sync", authMiddleware, async (req: Request, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  }
  const bodySchema = z.object({
    email: z.string().email().optional(),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid body" });
  }
  await db
    .insert(users)
    .values({
      clerkUserId: userId,
      email: body.data.email,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: body.data.email,
      },
    });
  res.json({ ok: true });
});

app.get("/api/me/profile-summary", authMiddleware, async (req: Request, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  }

  try {
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const summary = await getProfileSummary(userId, cursor);
    return res.json({ ok: true, data: summary });
  } catch (error) {
    console.error("GET /api/me/profile-summary failed", { userId, error });
    return res.status(500).json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Could not load profile summary",
      },
    });
  }
});

app.post("/api/app_events", authMiddleware, (_req: Request, res) => {
  res.status(204).end();
});

app.use("/api/memories", memoriesRouter);
app.use("/api/social", socialRouter);
app.use("/api", socialRouter);

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };

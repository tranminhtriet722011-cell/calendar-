/**
 * Application factory.
 *
 * `createApp` is used by the server entrypoint and by the integration tests, so tests exercise the
 * same middleware stack, permission checks and error contract as production.
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DB } from "./db";
import { errorHandler, notFoundHandler, requireUser, type AuthedRequest } from "./http";
import { authRoutes } from "./routes/auth";
import { taskRoutes } from "./routes/tasks";
import { calendarRoutes } from "./routes/calendar";
import { planningRoutes } from "./routes/planning";
import { scheduleRoutes } from "./routes/schedule";
import { activityRoutes } from "./routes/activity";
import { exportUserData } from "./store";

export interface AppOptions {
  db: DB;
  /** When set, the built single-page client is served from this directory. */
  staticDir?: string;
}

/** Conservative defaults: no framing, no sniffing, no referrer leakage (spec J1). */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  next();
}

export function createApp(options: AppOptions): Express {
  const { db } = options;
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "ape", time: Date.now() });
  });

  app.use("/api/auth", authRoutes(db));
  app.use("/api/tasks", taskRoutes(db));
  app.use("/api/calendar", calendarRoutes(db));
  app.use("/api", planningRoutes(db));
  app.use("/api/schedule", scheduleRoutes(db));
  app.use("/api/activity", activityRoutes(db));

  app.get("/api/export", requireUser(db), (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    res.setHeader("Content-Disposition", `attachment; filename="ape-export-${user.username}.json"`);
    res.json(exportUserData(db, user.id));
  });

  app.use("/api", notFoundHandler);

  if (options.staticDir && existsSync(options.staticDir)) {
    app.use(express.static(options.staticDir, { index: false, maxAge: "1h" }));
    // SPA fallback: unknown non-API paths render the client shell.
    app.get("*splat", (_req, res, next) => {
      const indexFile = resolve(options.staticDir as string, "index.html");
      if (existsSync(indexFile)) res.sendFile(indexFile);
      else next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

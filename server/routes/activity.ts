/**
 * Activity timeline, undo and data export (spec D8, AT40, AT44, AT30/AT31 via `server/undo.ts`).
 */

import { Router } from "express";
import type { DB } from "../db";
import { notFound } from "../errors";
import { optionalInt, requireUser, type AuthedRequest } from "../http";
import { exportUserData, getAudit, listAudit } from "../store";
import { undoAuditEntry, undoPreview } from "../undo";
export function activityRoutes(db: DB): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const limit = optionalInt(req.query.limit, "limit", 1, 500) ?? 100;
    const actor = typeof req.query.actor === "string" ? req.query.actor : undefined;
    const entries = listAudit(db, user.id, limit).filter((entry) => (actor ? entry.actor === actor : true));
    res.json({ entries: entries.map((entry) => ({ ...entry, preview: undoPreview(entry) })) });
  });

  router.get("/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const entry = getAudit(db, user.id, req.params.id);
    if (!entry) throw notFound("Activity entry not found.");
    res.json({ entry, preview: undoPreview(entry) });
  });

  /**
   * AT30/AT31: restore when the current schedule is still compatible, otherwise return a precise
   * conflict preview instead of blindly restoring.
   */
  router.post("/:id/undo", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const outcome = undoAuditEntry(db, user.id, req.params.id);
    if (!outcome.ok) {
      res.status(409).json({
        error: { code: outcome.code, message: outcome.message, details: outcome.conflicts ?? null },
        outcome,
      });
      return;
    }
    res.json({ outcome, entries: listAudit(db, user.id, 20) });
  });

  /** AT44 lives at `GET /api/export` (registered on the app so the path stays unambiguous). */
  return router;
}

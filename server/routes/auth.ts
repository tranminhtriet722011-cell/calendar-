/** Registration, sign-in, session lifecycle and user settings. No external identity provider. */

import { Router } from "express";
import type { DB } from "../db";
import { badRequest, unauthorized } from "../errors";
import { hashPassword, isStrongEnough, verifyPassword } from "../auth";
import { asString, optionalClock, optionalIntStrict, optionalObject, optionalString, requireUser, type AuthedRequest } from "../http";
import { createSession, createUser, deleteSession, findUserByUsername, updateSettings, DEFAULT_SETTINGS, type AppSettings } from "../store";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function publicUser(user: { id: string; username: string; timezone: string; settings: AppSettings; createdAt: number }) {
  return { id: user.id, username: user.username, timezone: user.timezone, settings: user.settings, createdAt: user.createdAt };
}

export function authRoutes(db: DB): Router {
  const router = Router();

  router.post("/register", async (req, res) => {
    const username = asString(req.body?.username, "username", 64).toLowerCase();
    const password = asString(req.body?.password, "password", 200);
    const timezone = optionalString(req.body?.timezone, "timezone", 64) ?? "Asia/Ho_Chi_Minh";

    if (!USERNAME_RE.test(username)) {
      throw badRequest("Username must be 3–32 characters using letters, digits, dot, underscore or hyphen.");
    }
    if (!isStrongEnough(password)) {
      throw badRequest("Password must be at least 8 characters.");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw badRequest("Unknown time zone.", { timezone });
    }
    if (findUserByUsername(db, username)) {
      throw badRequest("That username is already taken.");
    }

    const user = createUser(db, username, await hashPassword(password), timezone);
    const token = createSession(db, user.id);
    res.status(201).json({ token, user: publicUser(user) });
  });

  router.post("/login", async (req, res) => {
    const username = asString(req.body?.username, "username", 64).toLowerCase();
    const password = asString(req.body?.password, "password", 200);
    const record = findUserByUsername(db, username);
    // Same error for unknown user and wrong password: no account enumeration.
    if (!record || !(await verifyPassword(password, record.passwordHash))) {
      throw unauthorized("Incorrect username or password.");
    }
    const token = createSession(db, record.id);
    res.json({ token, user: publicUser(record) });
  });

  router.post("/logout", (req, res) => {
    const header = req.header("authorization");
    const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    if (token) deleteSession(db, token);
    res.status(204).end();
  });

  router.get("/me", requireUser(db), (req, res) => {
    res.json({ user: publicUser((req as unknown as AuthedRequest).user) });
  });

  router.patch("/settings", requireUser(db), (req, res) => {
    const current = (req as unknown as AuthedRequest).user;
    const incoming = optionalObject(req.body?.settings, "settings");
    // REV-001 / FUP-01..05: every section and clock field is validated while the merged object is
    // built, BEFORE updateSettings is called — a 400 anywhere below therefore leaves the stored
    // settings byte-identical (no partial write). A malformed section shape is refused too, so a
    // wrong-typed container cannot silently no-op past its own field validation.
    const working = optionalObject(incoming?.workingHours, "settings.workingHours");
    const rest = optionalObject(incoming?.softRest, "settings.softRest");
    const merged: AppSettings = {
      workingHours: {
        start: optionalClock(working?.start, "settings.workingHours.start") ?? current.settings.workingHours.start,
        end: optionalClock(working?.end, "settings.workingHours.end") ?? current.settings.workingHours.end,
        days: Array.isArray(working?.days)
          ? working.days.filter((value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6)
          : current.settings.workingHours.days,
      },
      softRest: {
        enabled: typeof rest?.enabled === "boolean" ? rest.enabled : current.settings.softRest.enabled,
        start: optionalClock(rest?.start, "settings.softRest.start") ?? current.settings.softRest.start,
        end: optionalClock(rest?.end, "settings.softRest.end") ?? current.settings.softRest.end,
      },
      // D-040 (APE-BATCH-003): strict like the clock fields — `""`, `" "`, `"25"`, `true`, `[]`
      // and out-of-range values are 400s naming the field, not silent coercions (REV-FUP-04).
      // Absent/null keeps the stored value. The 0–120 bounds are the clamp this input has carried
      // since the first vertical slice, promoted from silent clamping to explicit validation.
      graceMinutes: optionalIntStrict(incoming?.graceMinutes, "settings.graceMinutes", 0, 120)
        ?? current.settings.graceMinutes,
    };
    // D-039 (APE-BATCH-003): an inverted or zero-width window used to pass through here and reach
    // the scheduler as a negative-width range that free-slot arithmetic silently drops (measured
    // live: 22:00→08:00 produced a −840-minute working window and "Only 0 free minutes"; 08:00→08:00
    // produced zero-width windows). Overnight windows are NOT handled correctly, so per the
    // decision rule both inverted and equal windows are refused with a 400 naming the field —
    // validated on the MERGED values so a partial patch cannot smuggle an inversion past it.
    if (merged.workingHours.start >= merged.workingHours.end) {
      throw badRequest("`settings.workingHours.end` must be after `settings.workingHours.start`.", { field: "settings.workingHours.end" });
    }
    if (merged.softRest.start >= merged.softRest.end) {
      throw badRequest("`settings.softRest.end` must be after `settings.softRest.start`.", { field: "settings.softRest.end" });
    }
    if (merged.workingHours.days.length === 0) throw badRequest("Select at least one working day.");
    const timezone = optionalString(req.body?.timezone, "timezone", 64);
    if (timezone !== undefined) {
      // REV-A-04: validate exactly like registration — a stored unknown zone would turn every
      // zone-dependent endpoint into a RangeError 500 for this account.
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      } catch {
        throw badRequest("Unknown time zone.");
      }
    }
    const updated = updateSettings(db, current.id, merged, timezone);
    res.json({ user: publicUser(updated), defaults: DEFAULT_SETTINGS });
  });

  return router;
}

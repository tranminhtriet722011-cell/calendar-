/**
 * Calendar endpoints: fixed events, time blocks, conflict handling and the Today view.
 *
 * Conflict policy (spec F3/H3, AT09/AT10/AT13, Decision D-013):
 *  - Placement never happens silently on top of something else; the client gets the violations
 *    back and must confirm an override explicitly.
 *  - Protected rest can never be overridden by a placement.
 *  - An override the user is allowed to make is recorded as an audit exception.
 *  - The scheduler/agent path never passes `override`, so H1/H2/H3 hold for every proposal.
 */

import { Router } from "express";
import type { DB } from "../db";
import { badRequest, conflict as conflictError, notFound } from "../errors";
import { rangesOverlap, subtractRanges, totalMinutes, dayKey, dayKeysBetween, dayKeyToInstant, type Range } from "../domain/time";
import { asString, optionalBool, optionalEnum, optionalInstant, optionalString, optionalTitle, requireUser, type AuthedRequest } from "../http";
import {
  buildScheduleContext,
  createBlock,
  createEvent,
  deleteEvent,
  habitPeriod,
  listBlocks,
  listCheckins,
  listEvents,
  listHabits,
  listPauses,
  listTasks,
  listWorkSessions,
  recordAudit,
  requireBlock,
  requireEvent,
  requireTask,
  setBlockStatus,
  updateBlock,
  updateEvent,
  type Block,
  type CalendarEvent,
} from "../store";

const DAY_MS = 24 * 60 * 60 * 1000;

interface OverlapFinding {
  kind: "event" | "block" | "rest_protected";
  id: string;
  label: string;
  locked: boolean;
  start: number;
  end: number;
}

function findOverlaps(db: DB, userId: string, range: Range, ignoreBlockId?: string, ignoreEventId?: string): OverlapFinding[] {
  const events = listEvents(db, userId, range.start - DAY_MS, range.end + DAY_MS);
  const blocks = listBlocks(db, userId, range.start - DAY_MS, range.end + DAY_MS);
  const findings: OverlapFinding[] = [];
  for (const event of events) {
    if (event.id === ignoreEventId) continue;
    if (!rangesOverlap(range, { start: event.startAt, end: event.endAt })) continue;
    findings.push({
      kind: event.kind === "rest_protected" ? "rest_protected" : "event",
      id: event.id,
      label: event.title,
      locked: event.locked,
      start: event.startAt,
      end: event.endAt,
    });
  }
  for (const block of blocks) {
    if (block.id === ignoreBlockId || block.status === "released") continue;
    if (!rangesOverlap(range, { start: block.startAt, end: block.endAt })) continue;
    findings.push({ kind: "block", id: block.id, label: block.taskId, locked: block.locked, start: block.startAt, end: block.endAt });
  }
  return findings;
}

export function calendarRoutes(db: DB): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const now = Date.now();
    const from = optionalInstant(req.query.from, "from") ?? now - DAY_MS / 2;
    const to = optionalInstant(req.query.to, "to") ?? from + 7 * DAY_MS;
    if (to <= from) throw badRequest("`to` must be after `from`.");
    const events = listEvents(db, user.id, from, to);
    const blocks = listBlocks(db, user.id, from, to);
    const context = buildScheduleContext(user, db, from, to);
    const free = subtractRanges(context.workingWindows, context.busy);
    res.json({
      range: { from, to },
      events,
      blocks,
      workingWindows: context.workingWindows,
      softRest: context.softRest,
      free,
      freeMinutes: totalMinutes(free),
    });
  });

  router.post("/events", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const title = asString(req.body?.title, "title", 200);
    const startAt = optionalInstant(req.body?.startAt, "startAt");
    const endAt = optionalInstant(req.body?.endAt, "endAt");
    if (startAt === undefined || startAt === null || endAt === undefined || endAt === null) {
      throw badRequest("startAt and endAt are required.");
    }
    // REV-A-06: the same answer as every other range endpoint for an invalid range.
    if (endAt <= startAt) throw badRequest("An event must end after it starts.");
    const kind = optionalEnum<"fixed" | "rest_protected" | "rest_soft">(req.body?.kind, "kind", [
      "fixed",
      "rest_protected",
      "rest_soft",
    ]);

    // REV-A-01/AT10: creating an event obeys exactly the same gate as moving one or placing a
    // block — protected rest is refused outright, and a locked/fixed item needs `override` plus an
    // explicit `confirm` before it may be overlapped. The scan runs *before* the insert, so the
    // new event can never appear as its own conflict (REV-026).
    const findings = findOverlaps(db, user.id, { start: startAt, end: endAt });
    const protectedRest = findings.filter((finding) => finding.kind === "rest_protected");
    if (protectedRest.length > 0) {
      throw conflictError("That time is protected rest and cannot be scheduled over (H5).", { conflicts: protectedRest });
    }
    const hard = findings.filter((finding) => finding.locked);
    const override = optionalBool(req.body?.override, "override") ?? false;
    if (hard.length > 0 && !override) {
      throw conflictError("That time overlaps a fixed event. Confirm an override to place it anyway.", {
        conflicts: hard,
        canOverride: true,
      });
    }
    if (hard.length > 0 && override && req.body?.confirm !== true) {
      throw conflictError("Overriding a fixed event requires an explicit confirmation.", { conflicts: hard });
    }

    const event = createEvent(db, user.id, {
      title,
      startAt,
      endAt,
      kind,
      locked: optionalBool(req.body?.locked, "locked"),
    });
    // AT10/REV-026: an agreed overlap is an *exception* and must be visible in the activity trail —
    // the same `schedule.exception` entry a block placement writes. The reason states what actually
    // happened (REV-A-08): only a confirmed hard override may claim a confirmation.
    if (findings.length > 0) {
      recordAudit(db, {
        userId: user.id,
        actor: "user",
        action: "schedule.exception",
        entityType: "event",
        entityId: event.id,
        before: null,
        after: { event, conflicts: findings },
        reason: String(
          optionalString(req.body?.reason, "reason", 300) ??
            (hard.length > 0
              ? "Manual conflict override confirmed by user"
              : "Event created with overlapping items reported to the user"),
        ),
        undoable: true,
      });
    }
    res.status(201).json({ event, conflicts: findings });
  });

  /**
   * Moving/resizing an event goes through the *same* validator as a manual placement (spec F1,
   * review REV-013): protected rest is never movable onto, a locked/fixed item needs an explicit
   * override + confirmation, and the agreed exception is audited. A pure lock toggle or title edit
   * changes no time range and is never blocked by overlaps the user already accepted.
   */
  router.patch("/events/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const body = req.body ?? {};
    const existing = requireEvent(db, user.id, req.params.id);
    const startAt = optionalInstant(body.startAt, "startAt") ?? existing.startAt;
    const endAt = optionalInstant(body.endAt, "endAt") ?? existing.endAt;
    if (endAt <= startAt) throw badRequest("An event must end after it starts.");

    const rangeMoves = startAt !== existing.startAt || endAt !== existing.endAt;
    let conflicts: OverlapFinding[] = [];
    let hardCount = 0;
    if (rangeMoves) {
      const findings = findOverlaps(db, user.id, { start: startAt, end: endAt }, undefined, existing.id);
      const protectedRest = findings.filter((finding) => finding.kind === "rest_protected");
      if (protectedRest.length > 0) {
        throw conflictError("That time is protected rest and cannot be scheduled over (H5).", { conflicts: protectedRest });
      }
      const hard = findings.filter((finding) => finding.locked);
      hardCount = hard.length;
      const override = optionalBool(body.override, "override") ?? false;
      if (hard.length > 0 && !override) {
        throw conflictError("That time overlaps a fixed event. Confirm an override to move it anyway.", {
          conflicts: hard,
          canOverride: true,
        });
      }
      if (hard.length > 0 && override && body.confirm !== true) {
        throw conflictError("Overriding a fixed event requires an explicit confirmation.", { conflicts: hard });
      }
      conflicts = findings;
    }

    const event = updateEvent(
      db,
      user.id,
      req.params.id,
      {
        title: optionalTitle(body.title, "title", 200),
        startAt: rangeMoves ? startAt : undefined,
        endAt: rangeMoves ? endAt : undefined,
        kind: optionalEnum<"fixed" | "rest_protected" | "rest_soft">(body.kind, "kind", ["fixed", "rest_protected", "rest_soft"]),
        locked: optionalBool(body.locked, "locked"),
      },
      optionalIntFrom(body.revision, "revision"),
    );
    if (rangeMoves && conflicts.length > 0) {
      recordAudit(db, {
        userId: user.id,
        actor: "user",
        action: "schedule.exception",
        entityType: "event",
        entityId: event.id,
        before: { startAt: existing.startAt, endAt: existing.endAt },
        after: { event, conflicts },
        reason: String(
          optionalString(body.reason, "reason", 300) ??
            (hardCount > 0
              ? "Manual conflict override confirmed by user"
              : "Event moved onto overlapping items and reported to the user"),
        ),
        undoable: true,
      });
    }
    res.json({ event, conflicts });
  });

  router.delete("/events/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const existing = requireEvent(db, user.id, req.params.id);
    if (existing.locked && req.query.force !== "true") {
      throw conflictError("This event is locked. Unlock it first, then delete it.", { eventId: existing.id });
    }
    deleteEvent(db, user.id, existing.id);
    res.status(204).end();
  });

  /**
   * Manual placement (AT09/AT10). Conflicts are returned, never applied silently.
   */
  router.post("/blocks", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const taskId = asString(req.body?.taskId, "taskId", 64);
    const task = requireTask(db, user.id, taskId);
    if (task.status === "completed" || task.status === "cancelled") {
      throw conflictError("This task is closed; reopen it before scheduling more time.");
    }
    const startAt = optionalInstant(req.body?.startAt, "startAt");
    const endAt = optionalInstant(req.body?.endAt, "endAt");
    if (startAt === undefined || startAt === null || endAt === undefined || endAt === null) {
      throw badRequest("startAt and endAt are required.");
    }
    if (endAt <= startAt) throw badRequest("A time block must end after it starts.");

    const range: Range = { start: startAt, end: endAt };
    const findings = findOverlaps(db, user.id, range);
    const protectedRest = findings.filter((finding) => finding.kind === "rest_protected");
    if (protectedRest.length > 0) {
      throw conflictError("That time is protected rest and cannot be scheduled over (H5).", { conflicts: protectedRest });
    }
    const hard = findings.filter((finding) => finding.locked);
    const soft = findings.filter((finding) => !finding.locked);
    const override = optionalBool(req.body?.override, "override") ?? false;
    if (hard.length > 0 && !override) {
      throw conflictError("That time overlaps a fixed event. Confirm an override to place it anyway.", {
        conflicts: hard,
        canOverride: true,
      });
    }
    if (hard.length > 0 && override && req.body?.confirm !== true) {
      throw conflictError("Overriding a fixed event requires an explicit confirmation.", { conflicts: hard });
    }

    const block = createBlock(db, user.id, { taskId: task.id, startAt, endAt, source: "user" });
    if (hard.length > 0) {
      recordAudit(db, {
        userId: user.id,
        actor: "user",
        action: "schedule.exception",
        entityType: "block",
        entityId: block.id,
        before: null,
        after: { block, conflicts: hard },
        reason: String(optionalString(req.body?.reason, "reason", 300) ?? "Manual conflict override confirmed by user"),
        undoable: true,
      });
    }
    res.status(201).json({ block, conflicts: [...hard, ...soft] });
  });

  router.patch("/blocks/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const body = req.body ?? {};
    const existing = requireBlock(db, user.id, req.params.id);
    const startAt = optionalInstant(body.startAt, "startAt") ?? existing.startAt;
    const endAt = optionalInstant(body.endAt, "endAt") ?? existing.endAt;
    if (endAt <= startAt) throw badRequest("A time block must end after it starts.");

    const findings = findOverlaps(db, user.id, { start: startAt, end: endAt }, existing.id);
    const protectedRest = findings.filter((finding) => finding.kind === "rest_protected");
    if (protectedRest.length > 0) {
      throw conflictError("That time is protected rest and cannot be scheduled over (H5).", { conflicts: protectedRest });
    }
    const hard = findings.filter((finding) => finding.locked);
    const override = optionalBool(body.override, "override") ?? false;
    if (hard.length > 0 && !override) {
      throw conflictError("That time overlaps a fixed event. Confirm an override to place it anyway.", {
        conflicts: hard,
        canOverride: true,
      });
    }
    // REV-005: moving a block obeys the exact same two-step rule as placing one — an override flag
    // alone is never enough; an explicit confirmation is required on every path (AT10).
    if (hard.length > 0 && override && body.confirm !== true) {
      throw conflictError("Overriding a fixed event requires an explicit confirmation.", { conflicts: hard });
    }

    const adjustEstimate = optionalBool(body.adjustEstimate, "adjustEstimate") ?? false;
    const result = updateBlock(
      db,
      user.id,
      existing.id,
      {
        startAt,
        endAt,
        status: optionalEnum<"planned" | "active" | "done" | "released">(body.status, "status", ["planned", "active", "done", "released"]),
        locked: optionalBool(body.locked, "locked"),
        adjustEstimate,
      },
      optionalIntFrom(body.revision, "revision"),
    );
    if (hard.length > 0) {
      recordAudit(db, {
        userId: user.id,
        actor: "user",
        action: "schedule.exception",
        entityType: "block",
        entityId: existing.id,
        before: existing,
        after: { block: result.block, conflicts: hard },
        reason: "Manual conflict override confirmed by user",
        undoable: true,
      });
    }
    res.json({ block: result.block, estimateChanged: result.estimateChanged, conflicts: hard });
  });

  router.delete("/blocks/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const block = requireBlock(db, user.id, req.params.id);
    setBlockStatus(db, user.id, block.id, "released");
    res.status(204).end();
  });

  /** Dashboard payload for the Today view (spec D2, regions A–E). */
  router.get("/today", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const now = Date.now();
    // REV-024: "today" is the account's local calendar day, not a rolling 24h window — otherwise a
    // day without a working window silently becomes "the next 24 hours" and earlier events vanish.
    const todayKey = dayKey(now, user.timezone);
    const dayStart = dayKeyToInstant(todayKey, user.timezone);
    const nextKey = dayKeysBetween(dayStart, dayStart + 40 * 60 * 60 * 1000, user.timezone)[1];
    const dayEnd = nextKey ? dayKeyToInstant(nextKey, user.timezone) : dayStart + DAY_MS;
    const events = listEvents(db, user.id, dayStart, dayEnd);
    const blocks = listBlocks(db, user.id, dayStart, dayEnd);
    const tasks = listTasks(db, user.id);
    const sessions = listWorkSessions(db, user.id).filter((session) => session.startedAt >= dayStart && session.startedAt <= dayEnd);

    const openTasks = tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
    const nextBlock = [...blocks]
      .filter((block) => block.status === "planned" && block.endAt >= now)
      .sort((a, b) => a.startAt - b.startAt)[0];
    const nextAction = nextBlock
      ? { kind: "block", block: nextBlock, task: openTasks.find((task) => task.id === nextBlock.taskId) ?? null }
      : openTasks.length > 0
        ? { kind: "task", block: null, task: openTasks[0] }
        : null;

    const atRisk = openTasks
      .filter((task) => task.dueAt !== null && task.dueAt - now < 48 * 60 * 60 * 1000)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
      .map((task) => ({ task, reason: (task.dueAt ?? 0) < now ? "Past deadline" : "Deadline within 48h" }));

    const habits = listHabits(db, user.id).map((habit) => ({
      habit,
      // REV-006/AT33: the dashboard must agree with the Habits screen about pause windows.
      period: habitPeriod(habit, listCheckins(db, user.id, habit.id), now, user.timezone, listPauses(db, user.id, habit.id)),
    }));

    const plannedMinutes = blocks.reduce((sum, block) => sum + Math.round((block.endAt - block.startAt) / 60_000), 0);
    const actualMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);

    res.json({
      now,
      day: { start: dayStart, end: dayEnd },
      events,
      blocks,
      nextAction,
      atRisk,
      habits,
      reflection: { plannedMinutes, actualMinutes, sessionCount: sessions.length },
      empty: { tasks: tasks.length === 0, events: events.length === 0 },
    });
  });

  return router;
}

// Small helper: accepts both numeric strings and numbers from query/body fields.
function optionalIntFrom(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${field} must be a number.`, { field });
  return Math.round(parsed);
}

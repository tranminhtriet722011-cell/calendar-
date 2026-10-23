/**
 * Task endpoints — capture, inspection and execution.
 *
 * Behaviours pinned by acceptance criteria:
 *  - AT01: a title alone creates an Inbox task; nothing is silently placed on the calendar.
 *  - AT03/AT04: completing a block or a task never rewrites measured effort, and completing a task
 *    without a timer keeps actual effort unset.
 *  - AT05: reordering subtasks does not disturb the goal link.
 *  - AT14: block edits live in the calendar route and never silently change the task estimate.
 *  - AT21/AT22: late start is a flag; a manual backfill is a first-class work session.
 */

import { Router } from "express";
import type { DB } from "../db";
import { badRequest, conflict } from "../errors";
import { canTransition, computeTaskFlags, remainingAfterLog, type TaskStatus } from "../domain/taskState";
import {
  asString,
  optionalBool,
  optionalEnum,
  optionalInstant,
  optionalInt,
  optionalReferenceId,
  optionalString,
  requireUser,
  type AuthedRequest,
} from "../http";
import {
  actualMinutes,
  archiveTask,
  clampPriority,
  createTask,
  createWorkSession,
  getBlock,
  getTask,
  goalExists,
  listAudit,
  listBlocks,
  listTasks,
  listWorkSessions,
  requireTask,
  setTaskStatus,
  updateBlock,
  updateTask,
  type Task,
} from "../store";

const STATUSES: TaskStatus[] = ["not_started", "in_progress", "paused", "completed", "cancelled"];
const DAY_MS = 24 * 60 * 60 * 1000;

function blockContext(blocks: ReturnType<typeof listBlocks>, now: number): { start: number | null; end: number | null } {
  const sorted = [...blocks].sort((a, b) => a.startAt - b.startAt);
  const active = sorted.find((block) => block.startAt <= now && now <= block.endAt);
  if (active) return { start: active.startAt, end: active.endAt };
  const last = [...sorted].reverse().find((block) => block.startAt <= now);
  return last ? { start: last.startAt, end: last.endAt } : { start: null, end: null };
}

function taskView(db: DB, userId: string, task: Task, now: number, graceMinutes: number) {
  const blocks = listBlocks(db, userId, 0, now + 400 * DAY_MS, task.id);
  const sessions = listWorkSessions(db, userId, task.id);
  const context = blockContext(blocks, now);
  const flags = computeTaskFlags({
    now,
    status: task.status,
    dueAt: task.dueAt,
    estimatedMinutes: task.estimatedMinutes,
    remainingMinutes: task.remainingMinutes,
    actualMinutes: actualMinutes(db, userId, task.id),
    blockStart: context.start,
    blockEnd: context.end,
    graceMinutes,
  });
  const subtasks = listTasks(db, userId, { parentId: task.id });
  const history = listAudit(db, userId, 200).filter(
    (entry) => entry.entityType === "task" && entry.entityId === task.id,
  );
  return { task, blocks, sessions, flags, subtasks, history };
}

export function taskRoutes(db: DB): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const tasks = listTasks(db, user.id, {
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      goalId: typeof req.query.goalId === "string" ? req.query.goalId : undefined,
      parentId: typeof req.query.parentId === "string" ? req.query.parentId : undefined,
      includeArchived: req.query.archived === "true",
    });
    res.json({ tasks });
  });

  router.post("/", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const title = asString(req.body?.title, "title", 300);
    const goalId = optionalReferenceId(req.body?.goalId, "goalId") ?? null;
    const parentId = optionalReferenceId(req.body?.parentId, "parentId") ?? null;

    if (goalId && !getGoalExists(db, user.id, goalId)) throw badRequest("Unknown goal.", { goalId });
    if (parentId && !getTask(db, user.id, parentId)) throw badRequest("Unknown parent task.", { parentId });

    const estimate = optionalInt(req.body?.estimatedMinutes, "estimatedMinutes") ?? 0;
    const task = createTask(db, user.id, {
      title,
      notes: optionalString(req.body?.notes, "notes") ?? "",
      priority: clampPriority(req.body?.priority),
      dueAt: optionalInstant(req.body?.dueAt, "dueAt") ?? null,
      earliestStart: optionalInstant(req.body?.earliestStart, "earliestStart") ?? null,
      estimatedMinutes: estimate,
      remainingMinutes: optionalInt(req.body?.remainingMinutes, "remainingMinutes") ?? estimate,
      goalId,
      parentId,
      minBlockMinutes: optionalInt(req.body?.minBlockMinutes, "minBlockMinutes", 1, 1440) ?? 15,
      maxBlockMinutes: optionalInt(req.body?.maxBlockMinutes, "maxBlockMinutes", 1, 1440) ?? 90,
      splittable: optionalBool(req.body?.splittable, "splittable"),
      locked: optionalBool(req.body?.locked, "locked"),
    });
    res.status(201).json({ task });
  });

  router.get("/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const task = requireTask(db, user.id, req.params.id);
    res.json(taskView(db, user.id, task, Date.now(), user.settings.graceMinutes));
  });

  router.patch("/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const body = req.body ?? {};
    const patch = {
      title: optionalString(body.title, "title", 300),
      notes: optionalString(body.notes, "notes"),
      status: optionalEnum<TaskStatus>(body.status, "status", STATUSES),
      priority: body.priority === undefined ? undefined : clampPriority(body.priority),
      dueAt: body.dueAt === undefined ? undefined : optionalInstant(body.dueAt, "dueAt"),
      earliestStart: body.earliestStart === undefined ? undefined : optionalInstant(body.earliestStart, "earliestStart"),
      estimatedMinutes: optionalInt(body.estimatedMinutes, "estimatedMinutes"),
      remainingMinutes: optionalInt(body.remainingMinutes, "remainingMinutes"),
      // `null` unlinks (REV-A-10); `""` and other junk are rejected by optionalReferenceId (REV-A-02).
      goalId: optionalReferenceId(body.goalId, "goalId"),
      parentId: optionalReferenceId(body.parentId, "parentId"),
      position: optionalInt(body.position, "position", 0, 100000),
      minBlockMinutes: optionalInt(body.minBlockMinutes, "minBlockMinutes", 1, 1440),
      maxBlockMinutes: optionalInt(body.maxBlockMinutes, "maxBlockMinutes", 1, 1440),
      splittable: optionalBool(body.splittable, "splittable"),
      locked: optionalBool(body.locked, "locked"),
    };
    // Drop undefined so only provided fields are written.
    type TaskPatch = Parameters<typeof updateTask>[3];
    const clean = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as TaskPatch;
    const current = requireTask(db, user.id, req.params.id);
    if (Object.keys(clean).length === 0) {
      res.json({ task: current, changed: false });
      return;
    }

    // Referenced rows must exist *and belong to this owner* before any write (AT42): a foreign or
    // unknown id is a bad request, never a foreign-key error surfacing as a 500.
    if (clean.goalId && !getGoalExists(db, user.id, clean.goalId)) {
      throw badRequest("Unknown goal.", { goalId: clean.goalId });
    }
    if (clean.parentId) {
      if (clean.parentId === current.id) throw badRequest("A task cannot be its own parent.", { parentId: clean.parentId });
      if (!getTask(db, user.id, clean.parentId)) throw badRequest("Unknown parent task.", { parentId: clean.parentId });
    }
    // Spec E3 lives in one place: a status written through PATCH obeys exactly the same transition
    // rules as POST /tasks/:id/status — no endpoint may resurrect or close work behind the machine.
    if (clean.status !== undefined && !canTransition(current.status, clean.status)) {
      throw conflict(`Task cannot move from ${current.status} to ${clean.status}.`, {
        currentStatus: current.status,
        requestedStatus: clean.status,
      });
    }

    const result = updateTask(db, user.id, req.params.id, clean, optionalInt(body.revision, "revision"));
    res.json({ task: result.entity, changed: result.changed });
  });

  router.post("/:id/status", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const status = optionalEnum<TaskStatus>(req.body?.status, "status", STATUSES);
    if (!status) throw badRequest("status is required.");
    const task = setTaskStatus(db, user.id, req.params.id, status, optionalInt(req.body?.revision, "revision"), {
      reason: typeof req.body?.reason === "string" ? req.body.reason : "",
    });
    res.json({ task });
  });

  /**
   * AT25: completing early releases only this task's own future sessions — never a third party's
   * event or block, and never the recorded work logs.
   *
   * Order matters (review REV-003): the revision/transition check runs *first*, so a request that
   * is going to be refused with 409 never releases anything — a rejected request must write nothing.
   */
  router.post("/:id/complete", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const task = requireTask(db, user.id, req.params.id);
    const now = Date.now();
    const toRelease = listBlocks(db, user.id, now, now + 400 * DAY_MS, task.id).filter(
      (block) => block.status === "planned" && block.startAt >= now,
    );

    const updated = setTaskStatus(db, user.id, task.id, "completed", optionalInt(req.body?.revision, "revision"), {
      reason: `Completed by user; releases ${toRelease.length} future session(s)`,
    });

    const released: string[] = [];
    for (const block of toRelease) {
      // Re-read through updateBlock's owner filter; the status is re-checked so a block that
      // changed in between is left alone rather than blindly overwritten.
      const fresh = listBlocks(db, user.id, block.startAt, block.endAt, task.id).find((item) => item.id === block.id);
      if (fresh && fresh.status === "planned") {
        updateBlock(db, user.id, block.id, { status: "released" }, undefined);
        released.push(block.id);
      }
    }
    res.json({ task: updated, releasedBlocks: released });
  });

  router.delete("/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    archiveTask(db, user.id, req.params.id, optionalInt(req.query.revision as string, "revision"));
    res.status(204).end();
  });

  /**
   * Manual/retroactive effort log (spec E4, F7.3, AT22).
   * `remainingAfter` is the user's own answer about what is left, so a wrong estimate is never
   * allowed to silently rewrite reality.
   */
  router.post("/:id/log", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const task = requireTask(db, user.id, req.params.id);
    const minutes = optionalInt(req.body?.minutes, "minutes", 0, 60 * 24 * 7);
    if (minutes === undefined) throw badRequest("minutes is required.");
    const startedAt = optionalInstant(req.body?.at, "at") ?? Date.now();
    const answeredRemaining =
      req.body?.remainingAfter === undefined || req.body?.remainingAfter === null
        ? null
        : optionalInt(req.body.remainingAfter, "remainingAfter", 0, 100000) ?? 0;
    const note = optionalString(req.body?.note, "note", 500) ?? "";
    const source = optionalEnum<"timer" | "manual">(req.body?.source, "source", ["timer", "manual"]) ?? "manual";
    const blockId = optionalReferenceId(req.body?.blockId, "blockId") ?? null;
    // AT42: a block id that is unknown, or owned by someone else, is a bad request — never a 500.
    if (blockId && !getBlock(db, user.id, blockId)) throw badRequest("Unknown block.", { blockId });

    const session = createWorkSession(db, user.id, {
      taskId: task.id,
      blockId,
      startedAt,
      endedAt: startedAt + minutes * 60_000,
      minutes,
      source,
      note,
    });

    const nextRemaining = remainingAfterLog(task.remainingMinutes, minutes, answeredRemaining);
    const patch: Parameters<typeof updateTask>[3] = {};
    if (nextRemaining !== task.remainingMinutes) patch.remainingMinutes = nextRemaining;
    if (source === "timer" && task.status === "not_started") patch.status = "in_progress";
    if (Object.keys(patch).length > 0) {
      updateTask(db, user.id, task.id, patch, undefined, {
        actor: source === "timer" ? "system" : "user",
        reason: `Work log of ${minutes} min (${source})`,
      });
    }

    const after = requireTask(db, user.id, task.id);
    const flags = computeTaskFlags({
      now: Date.now(),
      status: after.status,
      dueAt: after.dueAt,
      estimatedMinutes: after.estimatedMinutes,
      remainingMinutes: after.remainingMinutes,
      actualMinutes: actualMinutes(db, user.id, after.id),
      blockStart: startedAt,
      blockEnd: startedAt + minutes * 60_000,
      graceMinutes: user.settings.graceMinutes,
    });
    res.status(201).json({ session, task: after, flags });
  });

  router.get("/:id/sessions", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const task = requireTask(db, user.id, req.params.id);
    res.json({ sessions: listWorkSessions(db, user.id, task.id), actualMinutes: actualMinutes(db, user.id, task.id) });
  });

  return router;
}

function getGoalExists(db: DB, userId: string, goalId: string): boolean {
  return goalExists(db, userId, goalId);
}


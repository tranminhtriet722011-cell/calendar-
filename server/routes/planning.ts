/**
 * Goals and habits.
 *
 * - AT06/AT07: goal progress is an explicit outcome log; it never moves because a task or block
 *   changed, and changing a metric on a populated goal returns a compatibility warning.
 * - AT08: `breakdown` produces editable drafts that are NOT persisted until the user commits them,
 *   and every inferred field is marked `assumed` (spec G4). No external model is involved (D-003).
 * - AT32/AT33/AT34/AT35: period attainment, never automatic completion; a paused habit is reported
 *   as paused instead of being failed (CR07).
 */

import { Router } from "express";
import type { DB } from "../db";
import { badRequest } from "../errors";
import { asString, optionalBool, optionalEnum, optionalInstant, optionalInt, optionalReferenceId, optionalString, optionalTitle, requireUser, type AuthedRequest } from "../http";
import {
  clampPriority,
  createCheckin,
  createGoal,
  createHabit,
  createMilestone,
  createTask,
  deleteCheckin,
  endHabitPause,
  findCheckin,
  goalExists,
  habitPeriod,
  listCheckins,
  listGoals,
  listHabits,
  listMilestones,
  listPauses,
  listTasks,
  listWorkSessions,
  logGoalProgress,
  requireGoal,
  requireHabit,
  startHabitPause,
  updateGoal,
  updateHabit,
  updateMilestone,
  type Goal,
  type Habit,
  type HabitCheckin,
} from "../store";

const DAY_MS = 24 * 60 * 60 * 1000;

function goalView(db: DB, userId: string, goal: Goal, now: number) {
  const milestones = listMilestones(db, userId, goal.id);
  const tasks = listTasks(db, userId, { goalId: goal.id });
  const open = tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
  const completed = tasks.filter((task) => task.status === "completed");
  const remainingMinutes = open.reduce((sum, task) => sum + task.remainingMinutes, 0);
  const plannedMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const doneMilestones = milestones.filter((milestone) => milestone.status === "done").length;

  const insufficient = goal.metricType === "count" && goal.target === 0;
  const unitLabel =
    goal.metricType === "count" ? `${goal.current}/${goal.target}` : `${doneMilestones}/${milestones.length} milestones`;

  return {
    goal,
    milestones,
    tasks: { total: tasks.length, completed: completed.length, open: open.length },
    effort: { remainingMinutes, plannedMinutes },
    progress: {
      unitLabel,
      ratio: insufficient ? null : goal.metricType === "count" ? Math.min(1, goal.current / goal.target) : doneMilestones / Math.max(1, milestones.length),
      // Spec D5: never invent a forecast when the data cannot support one.
      projected: insufficient
        ? "insufficient data"
        : remainingMinutes === 0 || goal.dueAt === null
          ? remainingMinutes === 0
            ? "nothing left scheduled"
            : "no deadline set"
          : projectedOutcome(goal, remainingMinutes, now),
    },
    atRisk: goal.dueAt !== null && goal.dueAt - now < 3 * DAY_MS && (goal.metricType === "count" ? goal.current < goal.target : doneMilestones < milestones.length),
  };
}

function projectedOutcome(goal: Goal, remainingMinutes: number, now: number): string {
  const daysLeft = Math.max(0, ((goal.dueAt ?? now) - now) / DAY_MS);
  const neededPerDay = remainingMinutes / Math.max(daysLeft, 0.5);
  return `${Math.round(neededPerDay)} min/day of remaining work to finish by the deadline (estimate, not a promise)`;
}

export function planningRoutes(db: DB): Router {
  const router = Router();
  router.use(requireUser(db));

  /** Period attainment always accounts for this habit's pause windows (AT33). */
  const periodOf = (userId: string, habit: Habit, checkins: HabitCheckin[], nowMs: number, timeZone: string) =>
    habitPeriod(habit, checkins, nowMs, timeZone, listPauses(db, userId, habit.id));

  // --- Goals ---------------------------------------------------------------

  router.get("/goals", (_req, res) => {
    const user = (_req as unknown as AuthedRequest).user;
    const now = Date.now();
    res.json({ goals: listGoals(db, user.id).map((goal) => goalView(db, user.id, goal, now)) });
  });

  router.post("/goals", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const title = asString(req.body?.title, "title", 300);
    const goal = createGoal(db, user.id, {
      title,
      description: optionalString(req.body?.description, "description", 4000) ?? "",
      metricType: optionalEnum<"count" | "milestone">(req.body?.metricType, "metricType", ["count", "milestone"]),
      target: optionalInt(req.body?.target, "target", 0, 1_000_000),
      current: optionalInt(req.body?.current, "current", 0, 1_000_000),
      dueAt: optionalInstant(req.body?.dueAt, "dueAt") ?? null,
    });
    // Same envelope as GET/PATCH so clients never have to unwrap two different shapes.
    res.status(201).json(goalView(db, user.id, goal, Date.now()));
  });

  router.get("/goals/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const goal = requireGoal(db, user.id, req.params.id);
    res.json(goalView(db, user.id, goal, Date.now()));
  });

  router.patch("/goals/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const body = req.body ?? {};
    const existing = requireGoal(db, user.id, req.params.id);
    const nextMetric = optionalEnum<"count" | "milestone">(body.metricType, "metricType", ["count", "milestone"]) ?? existing.metricType;
    const nextTarget = optionalInt(body.target, "target", 0, 1_000_000) ?? existing.target;
    const warnings: string[] = [];
    // AT07: changing the metric/target on a populated goal is flagged, not silently accepted.
    if ((nextMetric !== existing.metricType || nextTarget !== existing.target) && existing.current > 0) {
      warnings.push(
        `Existing progress of ${existing.current} was recorded for the previous metric. Review it before relying on the new progress figure.`,
      );
    }
    const goal = updateGoal(
      db,
      user.id,
      existing.id,
      {
        title: optionalTitle(body.title, "title", 300),
        description: optionalString(body.description, "description", 4000),
        target: nextTarget,
        current: optionalInt(body.current, "current", 0, 1_000_000),
        dueAt: body.dueAt === undefined ? undefined : optionalInstant(body.dueAt, "dueAt"),
        status: optionalEnum<"active" | "done" | "paused">(body.status, "status", ["active", "done", "paused"]),
        metricType: nextMetric,
      },
      optionalInt(body.revision, "revision"),
      typeof body.reason === "string" ? body.reason : "",
    );
    res.json({ ...goalView(db, user.id, goal, Date.now()), warnings });
  });

  /** AT06: explicit outcome units. Completing linked tasks does not move this number. */
  router.post("/goals/:id/progress", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const units = Number(req.body?.units);
    if (!Number.isFinite(units) || units === 0) throw badRequest("units must be a non-zero number.");
    const goal = logGoalProgress(db, user.id, req.params.id, units, optionalString(req.body?.reason, "reason", 300) ?? "");
    res.json(goalView(db, user.id, goal, Date.now()));
  });

  router.post("/goals/:id/milestones", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const title = asString(req.body?.title, "title", 300);
    const milestone = createMilestone(db, user.id, req.params.id, title);
    res.status(201).json({ milestone });
  });

  router.patch("/goals/:id/milestones/:milestoneId", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    requireGoal(db, user.id, req.params.id);
    const milestone = updateMilestone(
      db,
      user.id,
      req.params.milestoneId,
      {
        title: optionalTitle(req.body?.title, "title", 300),
        status: optionalEnum<"open" | "done">(req.body?.status, "status", ["open", "done"]),
        position: optionalInt(req.body?.position, "position", 0, 10000),
      },
      // Scoped to the goal in the URL (review REV-020): a milestone of another goal is not found.
      req.params.id,
    );
    res.json({ milestone });
  });

  /**
   * Step 1 of AT08: drafts only. Nothing is written to the database here.
   * Deterministic, local and rule based — the same job the LLM draft would do later (D-003).
   */
  router.post("/goals/:id/breakdown", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const goal = requireGoal(db, user.id, req.params.id);
    const count = Math.min(50, Math.max(1, optionalInt(req.body?.count, "count", 1, 50) ?? 5));
    const existing = listTasks(db, user.id, { goalId: goal.id });
    const estimate = optionalInt(req.body?.estimatedMinutes, "estimatedMinutes", 0, 100000) ?? 60;
    const drafts = Array.from({ length: count }, (_, index) => ({
      title: `${goal.title} — step ${index + 1}`,
      estimatedMinutes: estimate,
      assumed: true,
      assumption: "Even split of the goal; edit the title, order and estimate before saving.",
    }));
    res.json({
      drafts,
      existingTaskCount: existing.length,
      note: "Drafts are not stored. Nothing exists in your workspace until you commit them.",
    });
  });

  /** Step 2 of AT08: the user edits and then commits; only committed drafts become real tasks. */
  router.post("/goals/:id/breakdown/commit", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const goal = requireGoal(db, user.id, req.params.id);
    const drafts = req.body?.drafts;
    if (!Array.isArray(drafts) || drafts.length === 0) throw badRequest("drafts must be a non-empty array.");
    if (drafts.length > 50) throw badRequest("At most 50 drafts per commit.");

    // Validate everything *before* writing anything (review REV-004): one bad draft must never
    // leave half of the breakdown committed.
    const prepared = drafts.map((draft) => ({
      title: asString(draft?.title, "drafts[].title", 300),
      estimate: optionalInt(draft?.estimatedMinutes, "drafts[].estimatedMinutes", 0, 100000) ?? 0,
      priority: clampPriority(draft?.priority),
      dueAt: optionalInstant(draft?.dueAt, "drafts[].dueAt") ?? null,
    }));

    db.exec("BEGIN");
    try {
      const created = prepared.map((draft) =>
        createTask(db, user.id, {
          title: draft.title,
          goalId: goal.id,
          estimatedMinutes: draft.estimate,
          remainingMinutes: draft.estimate,
          priority: draft.priority,
          dueAt: draft.dueAt,
        }),
      );
      db.exec("COMMIT");
      res.status(201).json({ tasks: created, goal: goalView(db, user.id, goal, Date.now()) });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });

  // --- Habits ---------------------------------------------------------------

  router.get("/habits", (_req, res) => {
    const user = (_req as unknown as AuthedRequest).user;
    const now = Date.now();
    res.json({
      habits: listHabits(db, user.id).map((habit) => ({
        habit,
        period: periodOf(user.id, habit, listCheckins(db, user.id, habit.id), now, user.timezone),
        history: listCheckins(db, user.id, habit.id, now - 28 * DAY_MS, now + DAY_MS),
      })),
    });
  });

  router.post("/habits", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const title = asString(req.body?.title, "title", 200);
    const goalId = optionalReferenceId(req.body?.goalId, "goalId") ?? null;
    // AT42: unknown and foreign goal ids answer identically — no oracle, no foreign-key 500.
    if (goalId && !goalExists(db, user.id, goalId)) throw badRequest("Unknown goal.", { goalId });
    const habit = createHabit(db, user.id, {
      title,
      goalId,
      cadence: optionalEnum<"daily" | "weekly">(req.body?.cadence, "cadence", ["daily", "weekly"]),
      targetCount: optionalInt(req.body?.targetCount, "targetCount", 1, 500),
      minSessionMinutes: optionalInt(req.body?.minSessionMinutes, "minSessionMinutes", 0, 1440),
      maxSessionMinutes: optionalInt(req.body?.maxSessionMinutes, "maxSessionMinutes", 0, 1440),
    });
    res.status(201).json({ habit, period: periodOf(user.id, habit, [], Date.now(), user.timezone) });
  });

  router.patch("/habits/:id", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const body = req.body ?? {};
    const before = requireHabit(db, user.id, req.params.id);
    const habit = updateHabit(
      db,
      user.id,
      req.params.id,
      {
        title: optionalTitle(body.title, "title", 200),
        cadence: optionalEnum<"daily" | "weekly">(body.cadence, "cadence", ["daily", "weekly"]),
        targetCount: optionalInt(body.targetCount, "targetCount", 1, 500),
        minSessionMinutes: optionalInt(body.minSessionMinutes, "minSessionMinutes", 0, 1440),
        maxSessionMinutes: optionalInt(body.maxSessionMinutes, "maxSessionMinutes", 0, 1440),
        paused: optionalBool(body.paused, "paused"),
        pausePolicy: optionalEnum<"exclude" | "count">(body.pausePolicy, "pausePolicy", ["exclude", "count"]),
      },
      optionalInt(body.revision, "revision"),
      // AT35: only an explicit user request changes the target; nothing agent-driven is allowed here.
      body.paused === true ? "Paused by user" : body.paused === false ? "Resumed by user" : "Edited by user",
    );
    // AT33: record the pause window itself so occurrences inside it follow the chosen policy.
    const nextPaused = optionalBool(body.paused, "paused") ?? before.paused;
    const nextPolicy = optionalEnum<"exclude" | "count">(body.pausePolicy, "pausePolicy", ["exclude", "count"]) ?? before.pausePolicy;
    if (nextPaused) startHabitPause(db, user.id, habit.id, nextPolicy);
    else if (before.paused) endHabitPause(db, user.id, habit.id);

    res.json({ habit, period: periodOf(user.id, habit, listCheckins(db, user.id, habit.id), Date.now(), user.timezone) });
  });

  router.post("/habits/:id/checkins", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const habit = requireHabit(db, user.id, req.params.id);
    const occurredAt = optionalInstant(req.body?.at, "at") ?? Date.now();
    const minutes = optionalInt(req.body?.minutes, "minutes", 0, 1440) ?? 0;

    // AT34: an identical repeat (timer + manual entry, or a retried request) is one occurrence.
    const duplicate = findCheckin(db, user.id, habit.id, occurredAt, minutes);
    if (duplicate) {
      res.json({ checkin: duplicate, period: periodOf(user.id, habit, listCheckins(db, user.id, habit.id), Date.now(), user.timezone), duplicate: true });
      return;
    }

    const checkin = createCheckin(db, user.id, habit.id, occurredAt, minutes);
    res.status(201).json({
      checkin,
      period: periodOf(user.id, habit, listCheckins(db, user.id, habit.id), Date.now(), user.timezone),
      duplicate: false,
    });
  });

  router.delete("/habits/:id/checkins/:checkinId", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const habit = requireHabit(db, user.id, req.params.id);
    deleteCheckin(db, user.id, req.params.checkinId, habit.id);
    res.status(204).end();
  });

  /**
   * H2 history scoping: history is limited to this habit — only work sessions on tasks linked to
   * the habit's goal (inside the requested range) are counted, so unrelated work never inflates it.
   */
  router.get("/habits/:id/history", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const habit = requireHabit(db, user.id, req.params.id);
    const now = Date.now();
    const from = optionalInstant(req.query.from, "from") ?? now - 84 * DAY_MS;
    const to = optionalInstant(req.query.to, "to") ?? now + DAY_MS;
    const checkins = listCheckins(db, user.id, habit.id, from, to);
    const linkedTaskIds = new Set(
      habit.goalId ? listTasks(db, user.id, { goalId: habit.goalId }).map((task) => task.id) : [],
    );
    const sessions = listWorkSessions(db, user.id).filter(
      (session) => linkedTaskIds.has(session.taskId) && session.startedAt >= from && session.startedAt <= to,
    );
    res.json({
      habit,
      checkins,
      period: periodOf(user.id, habit, checkins, now, user.timezone),
      sessions,
      sessionCount: sessions.length,
      sessionMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
      scope: habit.goalId ? "linked goal" : "no linked goal",
    });
  });

  return router;
}


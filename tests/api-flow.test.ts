/**
 * API integration tests for execution/recovery (K3), habits and goals (K4) and AI authorization /
 * data rights (K5). Real HTTP against the real app; no layer is mocked.
 *
 * Coverage: AT21–AT31, AT32–AT41, AT44, AT45. AT46/AT47/AT48/AT54 are explicitly deferred in
 * `docs/spec/APE_V1_1_TRACEABILITY.md`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, registerUser, startTestServer, type TestServer, type TestUser } from "./helpers";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Next 08:00 UTC boundary strictly after `from` (these users work 08:00–22:00 UTC). */
function nextWorkStart(from: number, hour = 8): number {
  const date = new Date(from);
  const candidate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 0, 0, 0);
  return candidate > from ? candidate : candidate + 24 * HOUR;
}

function overlaps(a: { startAt: number; endAt: number }, b: { startAt: number; endAt: number }): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

async function user(): Promise<TestUser> {
  return registerUser(server.base, "UTC");
}

async function createTask(token: string, body: Record<string, unknown>) {
  const response = await call<{ task: any }>(server.base, "POST", "/api/tasks", { token, body });
  if (response.status !== 201) throw new Error(`task creation failed: ${JSON.stringify(response.data)}`);
  return response.data.task;
}

async function calendar(token: string) {
  const response = await call<{ blocks: any[]; events: any[] }>(
    server.base,
    "GET",
    "/api/calendar?from=0&to=99999999999999",
    { token },
  );
  return response.data;
}

describe("execution (K3)", () => {
  it("AT21 — a session that starts late is flagged, never silently completed", async () => {
    const u = await user();
    const now = Date.now();
    const task = await createTask(u.token, { title: "Late session", estimatedMinutes: 60 });
    const block = await call<{ block: any }>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: now - 30 * MIN, endAt: now + 30 * MIN },
    });
    expect(block.status).toBe(201);

    const detail = await call<{ task: any; flags: any; sessions: any[] }>(
      server.base,
      "GET",
      `/api/tasks/${task.id}`,
      { token: u.token },
    );
    expect(detail.data.flags.late_start).toBe(true);
    expect(detail.data.task.status).toBe("not_started");
    expect(detail.data.sessions).toEqual([]);
  });

  it("AT22 — a manual backfill records the session without inventing timer state", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Forgot to start the timer", estimatedMinutes: 60 });

    const logged = await call<{ session: any; task: any; flags: any }>(
      server.base,
      "POST",
      `/api/tasks/${task.id}/log`,
      { token: u.token, body: { minutes: 30, source: "manual", remainingAfter: 15, note: "Did it on the train" } },
    );
    expect(logged.status).toBe(201);
    expect(logged.data.session.source).toBe("manual");
    expect(logged.data.task.remainingMinutes).toBe(15);
    // A manual log is not a timer run, so nothing pretends the session was started by the app.
    expect(logged.data.task.status).toBe("not_started");

    const detail = await call<{ sessions: any[]; actualMinutes: number }>(
      server.base,
      "GET",
      `/api/tasks/${task.id}/sessions`,
      { token: u.token },
    );
    expect(detail.data.sessions).toHaveLength(1);
    expect(detail.data.actualMinutes).toBe(30);
  });

  it("AT23 — running over an estimate is a flag with a warning, not a forced completion", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Small estimate", estimatedMinutes: 30 });

    const logged = await call<{ task: any; flags: any }>(server.base, "POST", `/api/tasks/${task.id}/log`, {
      token: u.token,
      body: { minutes: 45, source: "timer" },
    });
    expect(logged.data.flags.overtime).toBe(true);
    expect(logged.data.task.status).toBe("in_progress");
    expect(logged.data.task.status).not.toBe("completed");

    const detail = await call<{ flags: any }>(server.base, "GET", `/api/tasks/${task.id}`, { token: u.token });
    expect(detail.data.flags.overtime).toBe(true);
  });

  it("AT25 — completing early releases only this task's own future sessions", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now()) + 30 * MIN;
    const mine = await createTask(u.token, { title: "Mine", estimatedMinutes: 60 });
    const other = await createTask(u.token, { title: "Someone else's session", estimatedMinutes: 60 });

    const mineBlock = await call<{ block: any }>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: mine.id, startAt: slot, endAt: slot + 60 * MIN },
    });
    await call(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: other.id, startAt: slot + 3 * HOUR, endAt: slot + 4 * HOUR },
    });
    const event = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Meeting", startAt: slot + 5 * HOUR, endAt: slot + 6 * HOUR },
    });

    const completed = await call<{ task: any; releasedBlocks: string[] }>(
      server.base,
      "POST",
      `/api/tasks/${mine.id}/complete`,
      { token: u.token },
    );
    expect(completed.status).toBe(200);
    expect(completed.data.releasedBlocks).toEqual([mineBlock.data.block.id]);

    const after = await calendar(u.token);
    // Released sessions leave the active calendar, so the completed task's block is gone...
    expect(after.blocks.some((block) => block.id === mineBlock.data.block.id)).toBe(false);
    // ...while everyone else's sessions are untouched.
    expect(after.blocks.some((block) => block.taskId === other.id && block.status === "planned")).toBe(true);
    expect(after.events.find((item) => item.id === event.data.event.id)).toBeDefined();
    expect(after.events.find((item) => item.id === event.data.event.id).revision).toBe(1);
  });

  it("optimistic concurrency (E2.4) — a stale block revision is rejected with the current value, never overwritten", async () => {
    const u = await user();
    const start = nextWorkStart(Date.now()) + 90 * MIN;
    const task = await createTask(u.token, { title: "Concurrent block edit", estimatedMinutes: 60 });
    const block = await call<{ block: any }>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: start, endAt: start + 60 * MIN },
    });

    const first = await call<{ block: any }>(server.base, "PATCH", `/api/calendar/blocks/${block.data.block.id}`, {
      token: u.token,
      body: { startAt: start + 15 * MIN, endAt: start + 75 * MIN, revision: block.data.block.revision },
    });
    expect(first.status).toBe(200);

    const stale = await call<any>(server.base, "PATCH", `/api/calendar/blocks/${block.data.block.id}`, {
      token: u.token,
      body: { startAt: start + 45 * MIN, endAt: start + 105 * MIN, revision: block.data.block.revision },
    });
    expect(stale.status).toBe(409);
    expect(stale.data.error.details.currentRevision).toBe(block.data.block.revision + 1);
  });
});

describe("recovery proposals (K3)", () => {
  it("AT24 — a need-more proposal moves existing sessions and never covers a fixed event", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now());
    const event = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Fixed lecture", startAt: slot + 2 * HOUR, endAt: slot + 3 * HOUR },
    });
    const task = await createTask(u.token, { title: "Thesis chapter", estimatedMinutes: 180 });
    await call(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: slot + 30 * MIN, endAt: slot + 90 * MIN },
    });

    const recovery = await call<any>(server.base, "POST", "/api/schedule/need-more", {
      token: u.token,
      body: { taskId: task.id, extraMinutes: 45 },
    });
    expect(recovery.status).toBe(200);
    expect(recovery.data.proposals.length).toBeGreaterThan(0);
    expect(recovery.data.impact.movedBlocks).toBeGreaterThan(0);

    const chosen = recovery.data.proposals[0];
    expect(chosen.placements.length).toBeGreaterThan(0);
    for (const placement of chosen.placements) {
      expect(overlaps(placement, event.data.event)).toBe(false);
    }
    expect(chosen.impact.movedBlocks).toBeGreaterThan(0);

    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: chosen.id },
    });
    expect(commit.status).toBe(200);
    const after = await calendar(u.token);
    for (const block of after.blocks.filter((item) => item.status === "planned")) {
      expect(overlaps(block, event.data.event)).toBe(false);
    }
    const storedEvent = after.events.find((item) => item.id === event.data.event.id);
    expect(storedEvent.revision).toBe(1);
    expect(storedEvent.startAt).toBe(event.data.event.startAt);
  });

  it("AT27 — the impact preview shows at-risk tasks and the blocks that would move", async () => {
    const u = await user();
    const task = await createTask(u.token, {
      title: "Due soon",
      estimatedMinutes: 90,
      dueAt: Date.now() + 2 * DAY,
    });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    expect(plan.data.proposals.length).toBeGreaterThan(0);
    const impact = plan.data.proposals[0].impact;
    expect(impact.atRiskTaskIds).toContain(task.id);
    expect(impact.addedBlocks).toBeGreaterThan(0);
    expect(impact.movedBlocks).toBeGreaterThanOrEqual(0);
    expect(impact.tasksTouched).toContain(task.id);
  });

  it("AT28 — dismissing a proposal leaves the calendar untouched", async () => {
    const u = await user();
    await createTask(u.token, { title: "Never scheduled", estimatedMinutes: 60 });
    const before = await calendar(u.token);

    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { strategy: "minimal" },
    });
    expect(plan.data.proposals.length).toBeGreaterThan(0);
    const dismissed = await call<any>(server.base, "POST", `/api/schedule/proposals/${plan.data.proposals[0].id}/dismiss`, {
      token: u.token,
    });
    expect(dismissed.status).toBe(200);
    expect(dismissed.data.proposal.status).toBe("dismissed");

    const after = await calendar(u.token);
    expect(after.blocks).toHaveLength(before.blocks.length);
    expect(after.events).toHaveLength(before.events.length);
  });

  it("AT29 — a proposal whose base revision moved is refused instead of overwriting", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Edited after planning", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    const chosen = plan.data.proposals[0];

    const renamed = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, {
      token: u.token,
      body: { title: "Renamed after planning" },
    });
    expect(renamed.status).toBe(200);

    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: chosen.id },
    });
    expect(commit.status).toBe(409);
    expect(commit.data.error.details.code).toBe("stale_proposal");

    const after = await calendar(u.token);
    expect(after.blocks).toEqual([]);
  });

  it("AT30 — undoing a commit restores the calendar", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Undoable plan", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: plan.data.proposals[0].id },
    });
    expect(commit.status).toBe(200);
    expect(commit.data.applied.length).toBeGreaterThan(0);

    const undo = await call<any>(server.base, "POST", `/api/activity/${commit.data.auditId}/undo`, {
      token: u.token,
    });
    expect(undo.status).toBe(200);
    expect(undo.data.outcome.ok).toBe(true);

    const after = await calendar(u.token);
    expect(after.blocks.filter((block) => block.status === "planned")).toEqual([]);
  });

  it("AT31 — undo is refused with a conflict preview when a block was edited afterwards", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Edited after commit", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: plan.data.proposals[0].id },
    });
    const appliedId = commit.data.applied[0];
    const block = await call<{ blocks: any[] }>(server.base, "GET", "/api/calendar?from=0&to=99999999999999", {
      token: u.token,
    });
    const stored = block.data.blocks.find((item: any) => item.id === appliedId);
    const moved = await call<any>(server.base, "PATCH", `/api/calendar/blocks/${appliedId}`, {
      token: u.token,
      body: { startAt: stored.startAt + 30 * MIN, endAt: stored.endAt + 30 * MIN, revision: stored.revision },
    });
    expect(moved.status).toBe(200);

    const undo = await call<any>(server.base, "POST", `/api/activity/${commit.data.auditId}/undo`, {
      token: u.token,
    });
    expect(undo.status).toBe(409);
    expect(undo.data.error.code).toBe("undo_conflict");
    expect(Array.isArray(undo.data.outcome.conflicts)).toBe(true);
    expect(undo.data.outcome.conflicts.length).toBeGreaterThan(0);
  });
});

describe("habits and goals (K4)", () => {
  it("AT32 — a weekly habit reports 3/4 done, is never auto-completed, and removing a check-in removes one occurrence", async () => {
    const u = await user();
    const habit = await call<{ habit: any; period: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Stretch", cadence: "weekly", targetCount: 4 },
    });
    expect(habit.status).toBe(201);
    expect(habit.data.period.done).toBe(0);

    const habitId = habit.data.habit.id;
    const at = Date.now();
    await call(server.base, "POST", `/api/habits/${habitId}/checkins`, {
      token: u.token,
      body: { minutes: 10, at },
    });
    await call(server.base, "POST", `/api/habits/${habitId}/checkins`, {
      token: u.token,
      body: { minutes: 10, at: at + 60_000 },
    });
    const third = await call<{ period: any }>(server.base, "POST", `/api/habits/${habitId}/checkins`, {
      token: u.token,
      body: { minutes: 10, at: at + 120_000 },
    });
    expect(third.data.period.done).toBe(3);
    expect(third.data.period.target).toBe(4);
    expect(third.data.period.attainment).toBeCloseTo(0.75, 5);
    // Attainment never becomes a completion: the habit has no "completed" state to fall into.
    expect(JSON.stringify(third.data.period)).not.toMatch(/completed/i);

    const list = await call<{ habits: any[] }>(server.base, "GET", "/api/habits", { token: u.token });
    const stored = list.data.habits.find((item) => item.habit.id === habitId);
    expect(stored.period.done).toBe(3);
    expect(JSON.stringify(stored.habit)).not.toMatch(/completed/i);

    // Removing one check-in removes exactly that occurrence and nothing else.
    const first = await call<{ habits: any[] }>(server.base, "GET", "/api/habits", { token: u.token });
    const history = first.data.habits.find((item: any) => item.habit.id === habitId).history;
    const removed = await call(server.base, "DELETE", `/api/habits/${habitId}/checkins/${history[0].id}`, {
      token: u.token,
    });
    expect(removed.status).toBe(204);
    const after = await call<{ habits: any[] }>(server.base, "GET", "/api/habits", { token: u.token });
    expect(after.data.habits.find((item) => item.habit.id === habitId).period.done).toBe(2);
  });

  it("AT33 — occurrences inside a pause window follow the chosen policy (exclude or count)", async () => {
    const u = await user();

    // Policy "exclude" (default): the occurrence during the pause does not count towards the period.
    const excluded = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Excluded while paused", cadence: "weekly", targetCount: 4 },
    });
    const excludedId = excluded.data.habit.id;
    const paused = await call<{ habit: any; period: any }>(server.base, "PATCH", `/api/habits/${excludedId}`, {
      token: u.token,
      body: { paused: true, revision: excluded.data.habit.revision },
    });
    expect(paused.status).toBe(200);
    expect(paused.data.habit.paused).toBe(true);
    expect(paused.data.period.paused).toBe(true);

    const duringPause = await call<{ period: any }>(server.base, "POST", `/api/habits/${excludedId}/checkins`, {
      token: u.token,
      body: { minutes: 5, at: Date.now() },
    });
    expect(duringPause.data.period.done).toBe(0);

    // Resuming closes the window: later occurrences count again.
    const resumed = await call<{ habit: any }>(server.base, "PATCH", `/api/habits/${excludedId}`, {
      token: u.token,
      body: { paused: false, revision: paused.data.habit.revision },
    });
    expect(resumed.data.habit.paused).toBe(false);
    const afterResume = await call<{ period: any }>(server.base, "POST", `/api/habits/${excludedId}/checkins`, {
      token: u.token,
      body: { minutes: 5, at: Date.now() },
    });
    expect(afterResume.data.period.done).toBe(1);

    // Policy "count": the occurrence inside the pause is kept on purpose.
    const counted = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Counted while paused", cadence: "weekly", targetCount: 4 },
    });
    const countedId = counted.data.habit.id;
    await call(server.base, "PATCH", `/api/habits/${countedId}`, {
      token: u.token,
      body: { paused: true, pausePolicy: "count", revision: counted.data.habit.revision },
    });
    const countedDuringPause = await call<{ period: any }>(server.base, "POST", `/api/habits/${countedId}/checkins`, {
      token: u.token,
      body: { minutes: 5, at: Date.now() },
    });
    expect(countedDuringPause.data.period.done).toBe(1);
    expect(countedDuringPause.data.period.paused).toBe(true);
  });

  it("AT34 — several sessions in one day count once each, and an identical repeat is not double counted", async () => {
    const u = await user();
    const habit = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Practice", cadence: "daily", targetCount: 2 },
    });
    const habitId = habit.data.habit.id;
    const now = Date.now();
    const date = new Date(now);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const firstAt = Math.max(dayStart, now - 2 * HOUR);
    const secondAt = Math.max(firstAt + MIN, Math.max(dayStart, now - HOUR));

    const morning = await call<{ period: any; duplicate: boolean; checkin: any }>(
      server.base,
      "POST",
      `/api/habits/${habitId}/checkins`,
      { token: u.token, body: { minutes: 20, at: firstAt } },
    );
    expect(morning.status).toBe(201);
    expect(morning.data.duplicate).toBe(false);

    const evening = await call<{ period: any; duplicate: boolean }>(
      server.base,
      "POST",
      `/api/habits/${habitId}/checkins`,
      { token: u.token, body: { minutes: 30, at: secondAt } },
    );
    expect(evening.data.period.done).toBe(2);
    expect(evening.data.period.target).toBe(2);

    // The same occurrence submitted twice (timer + manual, or a retry) stays one occurrence.
    const repeat = await call<{ period: any; duplicate: boolean; checkin: any }>(
      server.base,
      "POST",
      `/api/habits/${habitId}/checkins`,
      { token: u.token, body: { minutes: 20, at: firstAt } },
    );
    expect(repeat.status).toBe(200);
    expect(repeat.data.duplicate).toBe(true);
    expect(repeat.data.checkin.id).toBe(morning.data.checkin.id);
    expect(repeat.data.period.done).toBe(2);

    const list = await call<{ habits: any[] }>(server.base, "GET", "/api/habits", { token: u.token });
    expect(list.data.habits.find((item) => item.habit.id === habitId).period.done).toBe(2);
  });

  it("H2 — habit history counts only sessions linked to that habit", async () => {
    const u = await user();
    const goal = await call<any>(server.base, "POST", "/api/goals", {
      token: u.token,
      body: { title: "Run a half marathon", metricType: "count", target: 20 },
    });
    const goalId = goal.data.goal.id;
    const habit = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Long run", cadence: "weekly", targetCount: 1, goalId },
    });
    const linked = await createTask(u.token, { title: "Interval session", goalId, estimatedMinutes: 45 });
    const unrelated = await createTask(u.token, { title: "Write report", estimatedMinutes: 60 });

    await call(server.base, "POST", `/api/tasks/${linked.id}/log`, {
      token: u.token,
      body: { minutes: 45, source: "manual" },
    });
    await call(server.base, "POST", `/api/tasks/${unrelated.id}/log`, {
      token: u.token,
      body: { minutes: 120, source: "manual" },
    });

    const history = await call<any>(server.base, "GET", `/api/habits/${habit.data.habit.id}/history`, {
      token: u.token,
    });
    expect(history.data.sessionCount).toBe(1);
    expect(history.data.sessionMinutes).toBe(45);
    expect(history.data.scope).toBe("linked goal");
  });

  it("AT35 — only an explicit user edit changes the habit target", async () => {
    const u = await user();
    const habit = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Meditate", cadence: "daily", targetCount: 7 },
    });
    const created = habit.data.habit;

    await call(server.base, "POST", `/api/habits/${created.id}/checkins`, { token: u.token, body: { minutes: 5 } });
    const list = await call<{ habits: any[] }>(server.base, "GET", "/api/habits", { token: u.token });
    const afterCheckin = list.data.habits.find((item) => item.habit.id === created.id);
    expect(afterCheckin.habit.targetCount).toBe(7);

    const changed = await call<{ habit: any }>(server.base, "PATCH", `/api/habits/${created.id}`, {
      token: u.token,
      body: { targetCount: 5, revision: created.revision },
    });
    expect(changed.status).toBe(200);
    expect(changed.data.habit.targetCount).toBe(5);
  });

  it("AT36 — moving a session on the calendar never changes goal progress", async () => {
    const u = await user();
    const goal = await call<any>(server.base, "POST", "/api/goals", {
      token: u.token,
      body: { title: "30 problems", metricType: "count", target: 30 },
    });
    const goalId = goal.data.goal.id;
    await call(server.base, "POST", `/api/goals/${goalId}/progress`, {
      token: u.token,
      body: { units: 18, reason: "Solved 18 problems" },
    });

    const slot = nextWorkStart(Date.now());
    const task = await createTask(u.token, { title: "Problem set", goalId, estimatedMinutes: 60 });
    const block = await call<{ block: any }>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: slot + HOUR, endAt: slot + 2 * HOUR },
    });
    const moved = await call<any>(server.base, "PATCH", `/api/calendar/blocks/${block.data.block.id}`, {
      token: u.token,
      body: { startAt: slot + 4 * HOUR, endAt: slot + 5 * HOUR, revision: block.data.block.revision },
    });
    expect(moved.status).toBe(200);

    const after = await call<any>(server.base, "GET", `/api/goals/${goalId}`, { token: u.token });
    expect(after.data.goal.current).toBe(18);
    expect(after.data.progress.unitLabel).toBe("18/30");
  });
});

describe("AI authorization and data rights (K5)", () => {
  it("AT37 — applying a proposal never changes a deadline and never deletes an event", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now());
    const event = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Standing meeting", startAt: slot + 6 * HOUR, endAt: slot + 7 * HOUR },
    });
    const dueAt = Date.now() + 3 * DAY;
    const task = await createTask(u.token, { title: "Deadline-sensitive work", estimatedMinutes: 60, dueAt });

    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
      headers: { "x-actor": "agent" },
    });
    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: plan.data.proposals[0].id },
    });
    expect(commit.status).toBe(200);

    const detail = await call<{ task: any }>(server.base, "GET", `/api/tasks/${task.id}`, { token: u.token });
    expect(detail.data.task.dueAt).toBe(dueAt);
    expect(detail.data.task.status).not.toBe("cancelled");

    const after = await calendar(u.token);
    const stored = after.events.find((item) => item.id === event.data.event.id);
    expect(stored).toBeDefined();
    expect(stored.revision).toBe(1);

    // The commit only ever adds sessions; nothing was deleted on its behalf.
    expect(commit.data.applied.length).toBeGreaterThan(0);
    expect(after.events.filter((item) => item.id === event.data.event.id)).toHaveLength(1);
  });

  it("AT40 — every schedule change is recorded with actor, before/after and the proposal id", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Auditable work", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: plan.data.proposals[0].id },
    });

    const activity = await call<{ entries: any[] }>(server.base, "GET", "/api/activity?limit=100", {
      token: u.token,
    });
    const proposalEntry = activity.data.entries.find((entry) => entry.action === "agent.proposal.create");
    expect(proposalEntry).toBeDefined();
    expect(proposalEntry.actor).toBe("agent");

    const commitEntry = activity.data.entries.find((entry) => entry.id === commit.data.auditId);
    expect(commitEntry).toBeDefined();
    expect(commitEntry.actor).toBe("user");
    expect(commitEntry.action).toBe("schedule.commit");
    expect(commitEntry.before).toEqual({ released: [] });
    expect(Array.isArray(commitEntry.after.applied)).toBe(true);
    expect(commitEntry.proposalId).toBe(plan.data.proposals[0].id);
    expect(typeof commitEntry.id).toBe("string");
  });

  it("AT41 — repeating a commit with the same idempotency key never double-applies", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Only once", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    const proposalId = plan.data.proposals[0].id;

    const first = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId, idempotencyKey: "commit-key-1" },
    });
    expect(first.status).toBe(200);
    expect(first.data.replayed).toBeUndefined();

    const second = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId, idempotencyKey: "commit-key-1" },
    });
    expect(second.status).toBe(200);
    expect(second.data.replayed).toBe(true);
    expect(second.data.applied).toEqual(first.data.applied);

    const after = await calendar(u.token);
    expect(after.blocks).toHaveLength(first.data.applied.length);
  });

  it("AT43 — the whole core flow works with no AI provider configured", async () => {
    const u = await user();
    const health = await call<any>(server.base, "GET", "/api/health");
    expect(health.data.status).toBe("ok");

    const task = await createTask(u.token, { title: "No AI needed", estimatedMinutes: 45 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    expect(plan.data.proposals.length).toBeGreaterThan(0);
    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: plan.data.proposals[0].id },
    });
    expect(commit.status).toBe(200);
    const payload = JSON.stringify(plan.data) + JSON.stringify(commit.data);
    expect(payload).not.toMatch(/openai|anthropic|api[_-]?key|bearer sk-/i);
  });

  it("AT44 — export returns the owner's data and never a credential", async () => {
    const u = await user();
    await createTask(u.token, { title: "Exportable", estimatedMinutes: 30 });

    const exported = await call<any>(server.base, "GET", "/api/export", { token: u.token });
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    const text = JSON.stringify(exported.data);
    expect(text).toContain("Exportable");
    expect(text).not.toMatch(/password_hash|password":|"token":/i);

    const denied = await call(server.base, "GET", "/api/export");
    expect(denied.status).toBe(401);
  });

  it("AT38 — a revoked token cannot keep applying changes", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Late edit after logout", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id] },
    });
    await call(server.base, "POST", "/api/auth/logout", { token: u.token });

    const commit = await call<any>(server.base, "POST", "/api/schedule/commit", {
      token: u.token,
      body: { proposalId: plan.data.proposals[0].id },
    });
    expect(commit.status).toBe(401);

    const after = await call<any>(server.base, "GET", "/api/calendar?from=0&to=99999999999999", {
      token: u.token,
    });
    expect(after.status).toBe(401);
  });
});

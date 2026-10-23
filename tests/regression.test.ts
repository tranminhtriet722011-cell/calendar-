/**
 * Regression tests for defects found by the independent review of the APE-AUTO-001 increment
 * (review items REV-001 … REV-026). Each test pins one repaired invariant so it cannot silently
 * return. Real HTTP against the real app; no layer is mocked.
 *
 * Grouped by review item:
 *  REV-001 PATCH cannot bypass the E3 state machine
 *  REV-002 unknown/foreign reference ids are bad requests, never 500s or an existence oracle
 *  REV-003 a stale /complete is refused before any session is released
 *  REV-004 an invalid breakdown draft aborts the whole commit (no half-saved goal breakdown)
 *  REV-005 moving a block onto a fixed event needs override AND explicit confirmation
 *  REV-006 the Today view counts paused habits by their pause policy (AT33)
 *  REV-007 the need-more envelope flags only tasks due within 48 hours as at risk
 *  REV-008 the need-more envelope impact mirrors the representative proposal (no double counting)
 *  REV-012 dismissing a non-pending proposal is refused and writes no false audit entry
 *  REV-013 moving an event obeys the same validator as a placement
 *  REV-023 weekly habit periods keep both edges on local midnights across a DST transition
 *  REV-026 an overlapping event creation is reported and recorded as a schedule exception
 *  REV-011 undoing an archive restores the parent AND its cascaded subtasks
 *
 * Review pass #2 regressions (REV-A-… and unpinned items):
 *  REV-A-01 event creation obeys the same hard-conflict gate (protected rest / locked + confirm)
 *  REV-A-02 empty-string reference ids are 400s, never foreign-key 500s
 *  REV-A-03 the archive cascade covers the whole subtree (grandchildren included)
 *  REV-A-04 an unknown time zone in PATCH /auth/settings is refused, not stored
 *  REV-A-06 an invalid event range is a 400, like every other range endpoint
 *  REV-A-10 an explicit null reference unlinks; empty text is still rejected
 *  REV-009 deadline-clamped capacity reports the shortfall honestly
 *  REV-020 milestone and check-in edits are scoped to the URL's goal/habit
 *  REV-022 "existing plan untouched" is only claimed when nothing was released
 *  REV-024 /calendar/today uses the account's local calendar day
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, registerUser, startTestServer, type TestServer, type TestUser } from "./helpers";
import { habitPeriod, type Habit } from "../server/store";
import { dayKey, dayKeyToInstant, shiftDayKey } from "../server/domain/time";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Next 08:00 UTC boundary strictly after `from` (these users work 08:00–22:00 UTC). */
function nextWorkStart(from: number, hour = 8): number {
  const date = new Date(from);
  const candidate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, 0, 0, 0);
  return candidate > from ? candidate : candidate + 24 * HOUR;
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

async function entries(token: string) {
  const response = await call<{ entries: any[] }>(server.base, "GET", "/api/activity?limit=100", { token });
  return response.data.entries;
}

describe("review regressions — task integrity (REV-001, REV-002, REV-003, REV-004)", () => {
  it("REV-001: PATCH cannot bypass the E3 state machine — an illegal transition is a 409", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Finish the quarterly report" });
    const completed = await call<any>(server.base, "POST", `/api/tasks/${task.id}/complete`, {
      token: u.token,
      body: { revision: task.revision },
    });
    expect(completed.status).toBe(200);

    const illegal = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, {
      token: u.token,
      body: { status: "not_started" },
    });
    expect(illegal.status).toBe(409);
    expect(illegal.data.error.message).toMatch(/cannot move from/);

    const list = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    expect(list.data.tasks.find((item) => item.id === task.id)?.status).toBe("completed");

    // A *legal* transition through the same endpoint still works — the guard is a rule, not a ban.
    const other = await createTask(u.token, { title: "Start something new" });
    const allowed = await call<any>(server.base, "PATCH", `/api/tasks/${other.id}`, {
      token: u.token,
      body: { status: "in_progress" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.data.task.status).toBe("in_progress");
  });

  it("REV-002/AT42: unknown and foreign reference ids are identical 400s — never 500s, never an oracle", async () => {
    const owner = await user();
    const stranger = await user();
    const ownerGoal = await call<{ goal: any }>(server.base, "POST", "/api/goals", {
      token: owner.token,
      body: { title: "Owner goal" },
    });
    const ownerTask = await createTask(owner.token, { title: "Owner task" });
    const mine = await createTask(stranger.token, { title: "Stranger task" });

    const foreignGoal = await call<any>(server.base, "PATCH", `/api/tasks/${mine.id}`, {
      token: stranger.token,
      body: { goalId: ownerGoal.data.goal.id },
    });
    expect(foreignGoal.status).toBe(400);
    expect(foreignGoal.data.error.message).not.toMatch(/500|internal/i);

    const unknownGoal = await call<any>(server.base, "PATCH", `/api/tasks/${mine.id}`, {
      token: stranger.token,
      body: { goalId: "goal_does_not_exist" },
    });
    expect(unknownGoal.status).toBe(400);
    // Identical answers for "exists but is not yours" and "does not exist" → no existence oracle.
    expect(unknownGoal.data.error.message).toBe(foreignGoal.data.error.message);

    const foreignParent = await call<any>(server.base, "PATCH", `/api/tasks/${mine.id}`, {
      token: stranger.token,
      body: { parentId: ownerTask.id },
    });
    expect(foreignParent.status).toBe(400);

    const unknownBlock = await call<any>(server.base, "POST", `/api/tasks/${mine.id}/log`, {
      token: stranger.token,
      body: { minutes: 15, blockId: "blk_does_not_exist" },
    });
    expect(unknownBlock.status).toBe(400);

    const foreignHabitGoal = await call<any>(server.base, "POST", "/api/habits", {
      token: stranger.token,
      body: { title: "Reading", goalId: ownerGoal.data.goal.id },
    });
    expect(foreignHabitGoal.status).toBe(400);

    // And the rejected writes left no trace on the task.
    const reread = await call<{ task: any }>(server.base, "GET", `/api/tasks/${mine.id}`, { token: stranger.token });
    expect(reread.data.task.goalId).toBe(null);
    expect(reread.data.task.parentId).toBe(null);
  });

  it("REV-003: a stale /complete is refused BEFORE any session is released", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now());
    const task = await createTask(u.token, { title: "Plan the migration", estimatedMinutes: 90 });
    const block = await call<{ block: any }>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: slot, endAt: slot + 90 * MIN },
    });
    expect(block.status).toBe(201);

    const stale = await call<any>(server.base, "POST", `/api/tasks/${task.id}/complete`, {
      token: u.token,
      body: { revision: task.revision + 99 },
    });
    expect(stale.status).toBe(409);

    // The rejected request must have written nothing: the block is still planned and the task open.
    const after = await call<{ blocks: any[] }>(
      server.base,
      "GET",
      "/api/calendar?from=0&to=99999999999999",
      { token: u.token },
    );
    expect(after.data.blocks.find((item) => item.id === block.data.block.id)?.status).toBe("planned");
    const list = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    expect(list.data.tasks.find((item) => item.id === task.id)?.status).toBe("not_started");
  });

  it("REV-004/AT08: an invalid breakdown draft aborts the whole commit — nothing is half-saved", async () => {
    const u = await user();
    const goal = await call<{ goal: any }>(server.base, "POST", "/api/goals", {
      token: u.token,
      body: { title: "Ship the release", metricType: "milestone" },
    });
    const commit = await call<any>(server.base, "POST", `/api/goals/${goal.data.goal.id}/breakdown/commit`, {
      token: u.token,
      body: {
        drafts: [
          { title: "Step one", estimatedMinutes: 30 },
          { estimatedMinutes: 30 }, // invalid: no title
        ],
      },
    });
    expect(commit.status).toBe(400);

    const list = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    expect(list.data.tasks).toEqual([]); // the valid first draft was NOT half-committed
  });
});

describe("review regressions — calendar conflicts (REV-005, REV-013, REV-026)", () => {
  it("REV-005: moving a block onto a fixed event needs override AND an explicit confirmation", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now());
    const event = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Team standup", startAt: slot, endAt: slot + HOUR, locked: true },
    });
    const task = await createTask(u.token, { title: "Deep work", estimatedMinutes: 60 });
    const block = await call<{ block: any }>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: slot + 2 * HOUR, endAt: slot + 3 * HOUR },
    });

    const flagOnly = await call<any>(server.base, "PATCH", `/api/calendar/blocks/${block.data.block.id}`, {
      token: u.token,
      body: { startAt: slot, endAt: slot + HOUR, override: true },
    });
    expect(flagOnly.status).toBe(409);
    expect(flagOnly.data.error.message).toMatch(/explicit confirmation/i);

    const confirmed = await call<any>(server.base, "PATCH", `/api/calendar/blocks/${block.data.block.id}`, {
      token: u.token,
      body: { startAt: slot, endAt: slot + HOUR, override: true, confirm: true },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.data.block.startAt).toBe(slot);

    // The agreed exception is on the record (AT10).
    const audit = await entries(u.token);
    const exception = audit.find(
      (item) => item.action === "schedule.exception" && item.entityType === "block" && item.entityId === block.data.block.id,
    );
    expect(exception).toBeTruthy();
    expect(event.status).toBe(201);
  });

  it("REV-013: moving an event obeys the same validator — override alone is refused, a lock toggle is not", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now(), 10);
    const locked = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Board meeting", startAt: slot, endAt: slot + HOUR, locked: true },
    });
    const movable = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Movable event", startAt: slot + 4 * HOUR, endAt: slot + 5 * HOUR },
    });

    const flagOnly = await call<any>(server.base, "PATCH", `/api/calendar/events/${movable.data.event.id}`, {
      token: u.token,
      body: { startAt: slot, endAt: slot + HOUR, override: true },
    });
    expect(flagOnly.status).toBe(409);

    const confirmed = await call<any>(server.base, "PATCH", `/api/calendar/events/${movable.data.event.id}`, {
      token: u.token,
      body: { startAt: slot, endAt: slot + HOUR, override: true, confirm: true },
    });
    expect(confirmed.status).toBe(200);

    // A pure lock toggle changes no time range, so overlaps the user already accepted never block it.
    const relatch = await call<any>(server.base, "PATCH", `/api/calendar/events/${movable.data.event.id}`, {
      token: u.token,
      body: { locked: false, revision: confirmed.data.event.revision },
    });
    expect(relatch.status).toBe(200);
    expect(locked.status).toBe(201);
  });

  it("REV-026: a lone event never conflicts with itself, and a real overlap is reported and recorded", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now(), 9);
    const first = await call<{ event: any; conflicts: any[] }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      // Explicitly unlocked: this test pins the *soft* overlap path (reported + recorded). The
      // locked path now needs override + confirmation and is pinned by the REV-A-01 tests below.
      body: { title: "Lecture", startAt: slot, endAt: slot + HOUR, locked: false },
    });
    expect(first.status).toBe(201);
    expect(first.data.conflicts).toEqual([]); // the event itself is never its own conflict

    const second = await call<{ event: any; conflicts: any[] }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Overlapping visit", startAt: slot + 30 * MIN, endAt: slot + 90 * MIN },
    });
    expect(second.status).toBe(201);
    expect(second.data.conflicts.map((item) => item.id)).toContain(first.data.event.id);

    const audit = await entries(u.token);
    const exception = audit.find(
      (item) =>
        item.action === "schedule.exception" && item.entityType === "event" && item.entityId === second.data.event.id,
    );
    expect(exception).toBeTruthy();
  });
});

describe("review regressions — proposals and recovery (REV-007, REV-008, REV-012)", () => {
  it("REV-007/REV-008: the need-more envelope mirrors the representative proposal and uses a 48h risk horizon", async () => {
    const u = await user();
    const soon = await createTask(u.token, {
      title: "Due in ten hours",
      estimatedMinutes: 30,
      dueAt: Date.now() + 10 * HOUR,
    });
    const later = await createTask(u.token, {
      title: "Due in five days",
      estimatedMinutes: 30,
      dueAt: Date.now() + 5 * DAY,
    });
    const target = await createTask(u.token, { title: "Needs extra time", estimatedMinutes: 60 });

    const recovery = await call<any>(server.base, "POST", "/api/schedule/need-more", {
      token: u.token,
      body: { taskId: target.id, extraMinutes: 60 },
    });
    expect(recovery.status).toBe(200);
    expect(recovery.data.proposals.length).toBeGreaterThan(0);

    // 48-hour horizon (was 48 days): the 5-day task is no longer "at risk".
    expect(recovery.data.impact.atRiskTaskIds).toContain(soon.id);
    expect(recovery.data.impact.atRiskTaskIds).not.toContain(later.id);

    // The envelope describes the representative proposal; mutually exclusive alternatives are not summed.
    const representative = recovery.data.proposals[0];
    expect(recovery.data.impact.addedBlocks).toBe(representative.impact.addedBlocks);
    expect(recovery.data.impact.movedBlocks).toBe(representative.impact.movedBlocks);
    expect(recovery.data.impact.tasksTouched).toEqual(representative.impact.tasksTouched);
  });

  it("REV-012: dismissing a non-pending proposal is refused and writes no false 'nothing changed' entry", async () => {
    const u = await user();
    await createTask(u.token, { title: "Something to plan", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { strategy: "minimal" },
    });
    const proposalId = plan.data.proposals[0].id;

    const first = await call<any>(server.base, "POST", `/api/schedule/proposals/${proposalId}/dismiss`, {
      token: u.token,
    });
    expect(first.status).toBe(200);
    expect(first.data.proposal.status).toBe("dismissed");

    const second = await call<any>(server.base, "POST", `/api/schedule/proposals/${proposalId}/dismiss`, {
      token: u.token,
    });
    expect(second.status).toBe(409);

    const audit = await entries(u.token);
    expect(audit.filter((item) => item.action === "proposal.dismiss")).toHaveLength(1);
  });
});

describe("review regressions — habits and undo (REV-006, REV-011)", () => {
  it("REV-006/AT33: the Today view counts a paused habit by its pause policy, exactly like the habit route", async () => {
    const u = await user();
    const excluded = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Reading", cadence: "daily", targetCount: 1 },
    });
    const excludedId = excluded.data.habit.id;
    const paused = await call<any>(server.base, "PATCH", `/api/habits/${excludedId}`, {
      token: u.token,
      body: { paused: true, revision: excluded.data.habit.revision },
    });
    expect(paused.status).toBe(200);
    const during = await call<any>(server.base, "POST", `/api/habits/${excludedId}/checkins`, {
      token: u.token,
      body: { minutes: 10, at: Date.now() },
    });
    expect(during.data.period.done).toBe(0);

    const today = await call<{ habits: { habit: any; period: any }[] }>(server.base, "GET", "/api/calendar/today", {
      token: u.token,
    });
    expect(today.data.habits.find((item) => item.habit.id === excludedId)?.period.done).toBe(0);

    // Policy "count" keeps the occurrence — proving the dashboard number is policy-driven, not frozen.
    const counted = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Stretching", cadence: "daily", targetCount: 1 },
    });
    const countedId = counted.data.habit.id;
    await call(server.base, "PATCH", `/api/habits/${countedId}`, {
      token: u.token,
      body: { paused: true, pausePolicy: "count", revision: counted.data.habit.revision },
    });
    await call(server.base, "POST", `/api/habits/${countedId}/checkins`, {
      token: u.token,
      body: { minutes: 5, at: Date.now() },
    });
    const again = await call<{ habits: { habit: any; period: any }[] }>(server.base, "GET", "/api/calendar/today", {
      token: u.token,
    });
    expect(again.data.habits.find((item) => item.habit.id === countedId)?.period.done).toBe(1);
  });

  it("REV-023: a weekly period keeps both edges on local midnights across a DST transition", () => {
    const zone = "America/New_York";
    // Thursday 2026-03-05, inside the week that contains the US spring-forward (Sunday 2026-03-08,
    // a 23-hour day). Both edges must still be local midnights, one of them already in EDT.
    const now = dayKeyToInstant("2026-03-05", zone) + 12 * HOUR;
    const habit: Habit = {
      id: "h1",
      title: "Weekly review",
      goalId: null,
      cadence: "weekly",
      targetCount: 3,
      minSessionMinutes: 15,
      maxSessionMinutes: 90,
      paused: false,
      pausePolicy: "exclude",
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    };
    const period = habitPeriod(habit, [], now, zone);
    expect(period.periodStart).toBe(dayKeyToInstant("2026-03-02", zone)); // Monday, local midnight (EST)
    expect(period.periodEnd).toBe(dayKeyToInstant("2026-03-09", zone)); // next Monday, local midnight (EDT)
    // The week contained a 23-hour day, so it is exactly one hour shorter than 7×24h — the old
    // fixed-millisecond arithmetic put this boundary at 01:00 instead of midnight.
    expect(period.periodEnd - period.periodStart).toBe(7 * DAY - HOUR);
  });

  it("REV-011: undoing an archive restores the parent AND its cascaded subtasks", async () => {
    const u = await user();
    const parent = await createTask(u.token, { title: "Parent task" });
    const sub = await call<{ task: any }>(server.base, "POST", "/api/tasks", {
      token: u.token,
      body: { title: "Subtask", parentId: parent.id },
    });
    expect(sub.status).toBe(201);

    const removed = await call(server.base, "DELETE", `/api/tasks/${parent.id}`, { token: u.token });
    expect(removed.status).toBe(204);
    const during = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    expect(during.data.tasks.find((item) => item.id === parent.id)).toBeUndefined();
    expect(during.data.tasks.find((item) => item.id === sub.data.task.id)).toBeUndefined();

    const audit = await entries(u.token);
    const entry = audit.find((item) => item.action === "task.archive" && item.entityId === parent.id);
    expect(entry).toBeTruthy();

    const undo = await call<any>(server.base, "POST", `/api/activity/${entry.id}/undo`, { token: u.token });
    expect(undo.status).toBe(200);
    expect(undo.data.outcome.ok).toBe(true);

    const final = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    expect(final.data.tasks.find((item) => item.id === parent.id)?.archived).toBe(false);
    // The cascade came back too — the parent never returns with its subtasks still missing.
    expect(final.data.tasks.find((item) => item.id === sub.data.task.id)?.archived).toBe(false);
  });
});

describe("review pass #2 regressions — event gate, references, cascade, scope (REV-A-…)", () => {
  it("REV-A-01: creating an event over a locked event needs override AND confirmation, and the exception is audited", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now() + 5 * MIN);
    const locked = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Fixed meeting", startAt: slot, endAt: slot + 2 * HOUR, locked: true },
    });
    expect(locked.status).toBe(201);

    const bare = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Rival event", startAt: slot + HOUR, endAt: slot + 2 * HOUR },
    });
    expect(bare.status).toBe(409);
    expect(bare.data.error.message).toMatch(/Confirm an override/);

    const unconfirmed = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Rival event", startAt: slot + HOUR, endAt: slot + 2 * HOUR, override: true },
    });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.data.error.message).toMatch(/explicit confirmation/);

    const confirmed = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Rival event", startAt: slot + HOUR, endAt: slot + 2 * HOUR, override: true, confirm: true },
    });
    expect(confirmed.status).toBe(201);
    expect(confirmed.data.conflicts.some((c: any) => c.id === locked.data.event.id)).toBe(true);

    const audit = await entries(u.token);
    const exception = audit.find(
      (item) => item.action === "schedule.exception" && item.entityId === confirmed.data.event.id,
    );
    expect(exception).toBeTruthy();
    expect(exception.reason).toBe("Manual conflict override confirmed by user");
  });

  it("REV-A-01: creating an event over protected rest is refused outright — override cannot buy it", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now() + 5 * MIN);
    const rest = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Protected sleep", startAt: slot, endAt: slot + HOUR, kind: "rest_protected" },
    });
    expect(rest.status).toBe(201);

    const over = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Night work", startAt: slot + 15 * MIN, endAt: slot + HOUR, override: true, confirm: true },
    });
    expect(over.status).toBe(409);
    expect(over.data.error.message).toMatch(/protected rest/);
  });

  it("REV-A-06: an event that ends before it starts is a 400, like blocks and event moves", async () => {
    const u = await user();
    const slot = nextWorkStart(Date.now() + 5 * MIN);
    const response = await call<any>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Backwards", startAt: slot + HOUR, endAt: slot },
    });
    expect(response.status).toBe(400);
    expect(response.data.error.code).toBe("bad_request");
  });

  it("REV-A-02: empty-string reference ids are 400s everywhere — never a foreign-key 500", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Host task" });

    const viaGoal = await call<any>(server.base, "POST", "/api/tasks", {
      token: u.token,
      body: { title: "t", goalId: "" },
    });
    const viaParent = await call<any>(server.base, "POST", "/api/tasks", {
      token: u.token,
      body: { title: "t", parentId: "" },
    });
    const viaPatch = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, {
      token: u.token,
      body: { goalId: "" },
    });
    const viaLog = await call<any>(server.base, "POST", `/api/tasks/${task.id}/log`, {
      token: u.token,
      body: { minutes: 15, blockId: "" },
    });
    const viaHabit = await call<any>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "h", goalId: "" },
    });
    for (const response of [viaGoal, viaParent, viaPatch, viaLog, viaHabit]) {
      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe("bad_request");
    }
  });

  it("REV-A-10: an explicit null reference unlinks the task from its goal", async () => {
    const u = await user();
    const goal = await call<{ goal: any }>(server.base, "POST", "/api/goals", {
      token: u.token,
      body: { title: "Linkable goal" },
    });
    const task = await createTask(u.token, { title: "Linked task", goalId: goal.data.goal.id });
    expect(task.goalId).toBe(goal.data.goal.id);

    const unlinked = await call<{ task: any }>(server.base, "PATCH", `/api/tasks/${task.id}`, {
      token: u.token,
      body: { goalId: null },
    });
    expect(unlinked.status).toBe(200);
    expect(unlinked.data.task.goalId).toBeNull();
  });

  it("REV-A-03: the archive cascade reaches grandchildren, and undo restores the whole subtree", async () => {
    const u = await user();
    const parent = await createTask(u.token, { title: "Root" });
    const child = await createTask(u.token, { title: "Child", parentId: parent.id });
    const grandchild = await createTask(u.token, { title: "Grandchild", parentId: child.id });

    const removed = await call(server.base, "DELETE", `/api/tasks/${parent.id}`, { token: u.token });
    expect(removed.status).toBe(204);
    const during = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    for (const id of [parent.id, child.id, grandchild.id]) {
      expect(during.data.tasks.find((item) => item.id === id)).toBeUndefined();
    }

    const audit = await entries(u.token);
    const entry = audit.find((item) => item.action === "task.archive" && item.entityId === parent.id);
    expect(entry).toBeTruthy();

    const undo = await call<any>(server.base, "POST", `/api/activity/${entry.id}/undo`, { token: u.token });
    expect(undo.status).toBe(200);
    expect(undo.data.outcome.ok).toBe(true);

    const final = await call<{ tasks: any[] }>(server.base, "GET", "/api/tasks", { token: u.token });
    for (const id of [parent.id, child.id, grandchild.id]) {
      expect(final.data.tasks.find((item) => item.id === id)?.archived).toBe(false);
    }
  });

  it("REV-A-04: an unknown time zone in PATCH /auth/settings is refused, not stored", async () => {
    const u = await user();
    const bad = await call<any>(server.base, "PATCH", "/api/auth/settings", {
      token: u.token,
      body: { timezone: "Not/AZone" },
    });
    expect(bad.status).toBe(400);
    expect(bad.data.error.message).toMatch(/time zone/i);

    const good = await call<{ user: any }>(server.base, "PATCH", "/api/auth/settings", {
      token: u.token,
      body: { timezone: "America/New_York" },
    });
    expect(good.status).toBe(200);
    expect(good.data.user.timezone).toBe("America/New_York");
  });

  it("REV-020: a milestone edit is scoped to the goal in the URL — another goal's milestone is 404", async () => {
    const u = await user();
    const goalA = await call<{ goal: any }>(server.base, "POST", "/api/goals", {
      token: u.token,
      body: { title: "Goal A" },
    });
    const goalB = await call<{ goal: any }>(server.base, "POST", "/api/goals", {
      token: u.token,
      body: { title: "Goal B" },
    });
    const milestone = await call<{ milestone: any }>(server.base, "POST", `/api/goals/${goalA.data.goal.id}/milestones`, {
      token: u.token,
      body: { title: "M1" },
    });
    expect(milestone.status).toBe(201);

    const crossEdit = await call<any>(
      server.base,
      "PATCH",
      `/api/goals/${goalB.data.goal.id}/milestones/${milestone.data.milestone.id}`,
      { token: u.token, body: { status: "done" } },
    );
    expect(crossEdit.status).toBe(404);
  });

  it("REV-020: a check-in delete is scoped to the habit in the URL — another habit's check-in is 404", async () => {
    const u = await user();
    const habitA = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Habit A", cadence: "weekly", targetCount: 3 },
    });
    const habitB = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Habit B", cadence: "weekly", targetCount: 3 },
    });
    const checkin = await call<{ checkin: any }>(server.base, "POST", `/api/habits/${habitA.data.habit.id}/checkins`, {
      token: u.token,
      body: { minutes: 5, at: Date.now() },
    });
    expect(checkin.status).toBe(201);

    const crossDelete = await call<any>(
      server.base,
      "DELETE",
      `/api/habits/${habitB.data.habit.id}/checkins/${checkin.data.checkin.id}`,
      { token: u.token },
    );
    expect(crossDelete.status).toBe(404);

    // The check-in itself survived the wrong-URL attempt.
    const listed = await call<{ habits: any[] }>(server.base, "GET", "/api/habits", { token: u.token });
    const a = listed.data.habits.find((item) => item.habit.id === habitA.data.habit.id);
    expect(a.period.done).toBe(1);
  });

  it("REV-009: capacity before a near deadline is clamped — the shortfall is reported honestly", async () => {
    const u = await user();
    const task = await createTask(u.token, {
      title: "Due before any real window",
      estimatedMinutes: 120,
      dueAt: Date.now() + 20 * MIN,
    });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id], strategy: "minimal" },
    });
    expect(plan.data.feasibility.feasible).toBe(false);
    expect(plan.data.feasibility.shortfallMinutes).toBeGreaterThan(0);
    const reasons = plan.data.feasibility.shortfalls.map((s: any) => s.reason).join(" ");
    expect(reasons).toMatch(/free minutes before the deadline/);
  });

  it("REV-022: a minimal plan that moves nothing says 'existing plan untouched'", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Fits anywhere", estimatedMinutes: 60 });
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", {
      token: u.token,
      body: { taskIds: [task.id], strategy: "minimal" },
    });
    expect(plan.data.feasibility.feasible).toBe(true);
    const minimal = plan.data.proposals.find((p: any) => p.strategy === "minimal");
    expect(minimal).toBeTruthy();
    expect(minimal.releases).toEqual([]);
    expect(minimal.reasons.join(" ")).toMatch(/existing plan untouched/);
  });

  it("REV-024: /calendar/today follows the account's local calendar day, not a UTC window", async () => {
    const tz = "Pacific/Kiritimati"; // UTC+14 — the local day starts 10:00 UTC on the previous date
    const u = await registerUser(server.base, tz);
    const task = await createTask(u.token, { title: "Local-day pin" });
    const now = Date.now();
    const todayKey = dayKey(now, tz);
    // Local 01:00 "today" sits on the previous UTC date; local 01:00 "tomorrow" on the current one.
    const earlyToday = dayKeyToInstant(todayKey, tz) + HOUR;
    const earlyTomorrow = dayKeyToInstant(shiftDayKey(todayKey, 1), tz) + HOUR;

    const blockA = await call<any>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: earlyToday, endAt: earlyToday + 30 * MIN },
    });
    const blockB = await call<any>(server.base, "POST", "/api/calendar/blocks", {
      token: u.token,
      body: { taskId: task.id, startAt: earlyTomorrow, endAt: earlyTomorrow + 30 * MIN },
    });
    expect(blockA.status).toBe(201);
    expect(blockB.status).toBe(201);

    const today = await call<any>(server.base, "GET", "/api/calendar/today", { token: u.token });
    expect(today.status).toBe(200);
    expect(today.data.day.start).toBe(dayKeyToInstant(todayKey, tz));
    const blockIds = today.data.blocks.map((b: any) => b.id);
    expect(blockIds).toContain(blockA.data.block.id);
    expect(blockIds).not.toContain(blockB.data.block.id);
  });
});

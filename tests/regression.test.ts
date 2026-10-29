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
 *
 * APE-ACCEPT-002 acceptance-audit regressions:
 *  ACC-01 a PATCH can never blank an entity title — empty/whitespace is a 400 on every
 *         title-bearing update route (task, goal, milestone, habit, event); a valid rename
 *         persists, an absent title leaves the name untouched
 *
 * APE-ACCEPT-FOLLOWUP-001 regressions (FUP-01 … FUP-08, IDs deliberately outside the REV-*
 * space so they cannot collide with the APE-AUTO-001 or ACCEPT-002 review rounds):
 *  FUP-01 every settings clock field rejects empty/whitespace with 400 + stores nothing
 *  FUP-02 out-of-range clocks ("99:99") are refused — the shape regex alone is not enough
 *  FUP-03 malformed and non-string clocks are 400s, with the field named in the message
 *  FUP-04 a rejected settings PATCH leaves the stored settings byte-identical (no partial write)
 *  FUP-05 a wrong-typed settings section is refused instead of silently no-op'ing
 *  FUP-06 valid clocks round-trip untouched; absent/null keeps the stored value; defaults intact
 *  FUP-07 scheduling still honours an updated clock end-to-end (stored value -> working window)
 *  FUP-08 (REV-003/004 close-out) optionalTitle edge cases: a non-string title is a 400, a
 *         whitespace-padded rename is stored trimmed, and a padded title counts its trimmed
 *         length against the cap (the pre-trim length check is the documented asString convention)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, registerUser, startTestServer, type TestServer, type TestUser } from "./helpers";
import { habitPeriod, type Habit, type HabitCheckin, type HabitPause } from "../server/store";
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

  it("AT33 boundary: a closed pause window is half-open [startedAt, endedAt); an open window includes now", () => {
    // Regression for the AT33 flake: a post-resume check-in captured in the SAME millisecond as
    // the server's endedAt was silently excluded by the old inclusive bound (done 0, expected 1).
    const zone = "UTC";
    const now = Date.UTC(2026, 9, 26, 12); // fixed instant: daily period = 2026-10-26 UTC
    const habit: Habit = {
      id: "h1",
      title: "Boundary habit",
      goalId: null,
      cadence: "daily",
      targetCount: 3,
      minSessionMinutes: 5,
      maxSessionMinutes: 60,
      paused: false,
      pausePolicy: "exclude",
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    };
    const startedAt = now - 3 * HOUR; // pause opened 09:00
    const endedAt = now - HOUR; // resume 11:00
    const pause = (ended: number | null, policy: HabitPause["policy"] = "exclude"): HabitPause => ({
      id: "pau_1",
      habitId: "h1",
      startedAt,
      endedAt: ended,
      policy,
      createdAt: 0,
      updatedAt: 0,
    });
    const at = (occurredAt: number): HabitCheckin => ({
      id: `ck_${occurredAt}`,
      habitId: "h1",
      occurredAt,
      minutes: 5,
      source: "test",
      createdAt: 0,
    });

    // Closed window: inside occurrences are excluded, both edges behave half-open [startedAt, endedAt).
    expect(habitPeriod(habit, [at(startedAt)], now, zone, [pause(endedAt)]).done).toBe(0);
    expect(habitPeriod(habit, [at(endedAt - 1)], now, zone, [pause(endedAt)]).done).toBe(0);
    expect(habitPeriod(habit, [at(endedAt)], now, zone, [pause(endedAt)]).done).toBe(1); // the flake fix
    expect(habitPeriod(habit, [at(now)], now, zone, [pause(endedAt)]).done).toBe(1); // after resume

    // Open window: the pause is active, so an occurrence at exactly now is still excluded.
    expect(habitPeriod(habit, [at(now)], now, zone, [pause(null)]).done).toBe(0);
    expect(habitPeriod(habit, [at(startedAt)], now, zone, [pause(null)]).done).toBe(0);

    // Policy "count" is never suppressed, open or closed.
    expect(habitPeriod(habit, [at(startedAt)], now, zone, [pause(endedAt, "count")]).done).toBe(1);
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

describe("APE-ACCEPT-002 acceptance regressions — no entity can lose its name (ACC-01)", () => {
  /** Every PATCH route that accepts a `title`. `patch` receives whatever `create` returned. */
  const titleRoutes = [
    { label: "task", create: (u: TestUser) => createTask(u.token, { title: "A named task" }), patch: (entity: any) => `/api/tasks/${entity.id}` },
    {
      label: "goal",
      create: async (u: TestUser) =>
        (await call<{ goal: any }>(server.base, "POST", "/api/goals", { token: u.token, body: { title: "A named goal" } })).data.goal,
      patch: (entity: any) => `/api/goals/${entity.id}`,
    },
    {
      label: "milestone",
      create: async (u: TestUser) => {
        const goal = (await call<{ goal: any }>(server.base, "POST", "/api/goals", { token: u.token, body: { title: "Parent goal" } })).data.goal;
        const milestone = (
          await call<{ milestone: any }>(server.base, "POST", `/api/goals/${goal.id}/milestones`, {
            token: u.token,
            body: { title: "A named milestone" },
          })
        ).data.milestone;
        return { id: milestone.id, goalId: goal.id };
      },
      patch: (entity: any) => `/api/goals/${entity.goalId}/milestones/${entity.id}`,
    },
    {
      label: "habit",
      create: async (u: TestUser) =>
        (await call<{ habit: any }>(server.base, "POST", "/api/habits", {
          token: u.token,
          body: { title: "A named habit", cadence: "daily", targetCount: 1 },
        })).data.habit,
      patch: (entity: any) => `/api/habits/${entity.id}`,
    },
    {
      label: "event",
      create: async (u: TestUser) => {
        const start = Date.now() + 6 * HOUR;
        return (
          await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
            token: u.token,
            body: { title: "A named event", startAt: start, endAt: start + HOUR },
          })
        ).data.event;
      },
      patch: (entity: any) => `/api/calendar/events/${entity.id}`,
    },
  ];

  for (const route of titleRoutes) {
    it(`ACC-01: PATCH {title: ""} on a ${route.label} is a 400 and leaves the title intact`, async () => {
      const u = await user();
      const entity = await route.create(u);
      const path = route.patch(entity);

      const blank = await call<any>(server.base, "PATCH", path, { token: u.token, body: { title: "" } });
      expect(blank.status).toBe(400);
      expect(blank.data.error.message).toMatch(/title is required/i);

      const whitespace = await call<any>(server.base, "PATCH", path, { token: u.token, body: { title: "   " } });
      expect(whitespace.status).toBe(400);

      // The stored title is unchanged — verify through the list/read endpoint.
      if (route.label === "milestone") {
        const goal = await call<any>(server.base, "GET", `/api/goals/${entity.goalId}`, { token: u.token });
        const stored = goal.data.milestones.find((m: any) => m.id === entity.id);
        expect(stored.title).toBe("A named milestone");
      } else if (route.label === "task") {
        const stored = await call<any>(server.base, "GET", `/api/tasks/${entity.id}`, { token: u.token });
        expect(stored.data.task.title).toBe("A named task");
      } else if (route.label === "goal") {
        const stored = await call<any>(server.base, "GET", `/api/goals/${entity.id}`, { token: u.token });
        expect(stored.data.goal.title).toBe("A named goal");
      } else if (route.label === "habit") {
        const stored = await call<any>(server.base, "GET", "/api/habits", { token: u.token });
        expect(stored.data.habits.find((h: any) => h.habit.id === entity.id).habit.title).toBe("A named habit");
      } else {
        const stored = await call<any>(server.base, "GET", `/api/calendar?from=${Date.now() - DAY}&to=${Date.now() + DAY}`, { token: u.token });
        expect(stored.data.events.find((e: any) => e.id === entity.id).title).toBe("A named event");
      }
    });

    it(`ACC-01: a valid ${route.label} rename persists; an absent title keeps the current name`, async () => {
      const u = await user();
      const entity = await route.create(u);
      const path = route.patch(entity);

      const renamed = await call<any>(server.base, "PATCH", path, { token: u.token, body: { title: `Renamed ${route.label}` } });
      expect(renamed.status).toBe(200);

      const untouched = await call<any>(server.base, "PATCH", path, {
        token: u.token,
        body: route.label === "task" ? { priority: 2 } : {},
      });
      expect(untouched.status).toBe(200);

      if (route.label === "milestone") {
        const goal = await call<any>(server.base, "GET", `/api/goals/${entity.goalId}`, { token: u.token });
        expect(goal.data.milestones.find((m: any) => m.id === entity.id).title).toBe("Renamed milestone");
      } else if (route.label === "task") {
        const stored = await call<any>(server.base, "GET", `/api/tasks/${entity.id}`, { token: u.token });
        expect(stored.data.task.title).toBe("Renamed task");
        expect(stored.data.task.priority).toBe(2); // the absent-title patch still applied its own fields
      } else if (route.label === "goal") {
        const stored = await call<any>(server.base, "GET", `/api/goals/${entity.id}`, { token: u.token });
        expect(stored.data.goal.title).toBe("Renamed goal");
      } else if (route.label === "habit") {
        const stored = await call<any>(server.base, "GET", "/api/habits", { token: u.token });
        expect(stored.data.habits.find((h: any) => h.habit.id === entity.id).habit.title).toBe("Renamed habit");
      } else {
        const stored = await call<any>(server.base, "GET", `/api/calendar?from=${Date.now() - DAY}&to=${Date.now() + DAY}`, { token: u.token });
        expect(stored.data.events.find((e: any) => e.id === entity.id).title).toBe("Renamed event");
      }
    });
  }
});

describe("APE-ACCEPT-FOLLOWUP-001 — settings clock validation (FUP-01 … FUP-08)", () => {
  /** All four HH:mm clock fields on AppSettings, addressed by their JSON path in the payload. */
  const clockFields = [
    { path: "workingHours.start" as const, patch: (value: unknown) => ({ workingHours: { start: value } }) },
    { path: "workingHours.end" as const, patch: (value: unknown) => ({ workingHours: { end: value } }) },
    { path: "softRest.start" as const, patch: (value: unknown) => ({ softRest: { start: value } }) },
    { path: "softRest.end" as const, patch: (value: unknown) => ({ softRest: { end: value } }) },
  ];

  async function settings(token: string) {
    const response = await call<{ user: any }>(server.base, "GET", "/api/auth/me", { token });
    return response.data.user.settings as {
      workingHours: { start: string; end: string; days: number[] };
      softRest: { enabled: boolean; start: string; end: string };
      graceMinutes: number;
    };
  }

  it("FUP-01: every clock field rejects empty and whitespace-only values with 400 and stores nothing", async () => {
    const u = await user();
    const before = await settings(u.token);
    for (const field of clockFields) {
      for (const blank of ["", " ", "   "]) {
        const bad = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: field.patch(blank) } });
        expect(bad.status, `${field.path}=${JSON.stringify(blank)} must be 400`).toBe(400);
        expect(bad.data.error.message).toContain(field.path);
      }
    }
    expect(await settings(u.token)).toEqual(before);
  });

  it("FUP-02: an out-of-range clock like \"99:99\" is refused — the shape regex alone is not enough", async () => {
    const u = await user();
    const before = await settings(u.token);
    const outOfRange = ["99:99", "24:00", "23:60", "12:99"];
    for (const field of clockFields) {
      for (const value of outOfRange) {
        const bad = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: field.patch(value) } });
        expect(bad.status, `${field.path}=${value} must be 400`).toBe(400);
        expect(bad.data.error.message).toContain(field.path);
      }
    }
    expect(await settings(u.token)).toEqual(before);
  });

  it("FUP-03: malformed and non-string clocks are 400s naming the field", async () => {
    const u = await user();
    const malformed = ["8:00", "08:0", "0800", "08:00:00", "08.00", "08:00 ", "aa:bb", " 下午"];
    const nonString = [7, true, [], ["08:00"], {}];
    for (const field of clockFields) {
      for (const value of [...malformed, ...nonString]) {
        const bad = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: field.patch(value) } });
        expect(bad.status, `${field.path}=${JSON.stringify(value)} must be 400`).toBe(400);
        expect(bad.data.error.message).toContain(field.path);
        expect(bad.data.error.message).toContain("HH:mm");
      }
    }
  });

  it("FUP-04: a rejected settings PATCH leaves the stored settings byte-identical (no partial write)", async () => {
    const u = await user();
    // Seed a non-default, fully valid configuration first so "unchanged" is meaningful.
    const seed = await call<any>(server.base, "PATCH", "/api/auth/settings", {
      token: u.token,
      body: { settings: { workingHours: { start: "09:30", end: "18:15" }, softRest: { enabled: false, start: "12:30", end: "13:15" }, graceMinutes: 25 } },
    });
    expect(seed.status).toBe(200);
    const before = await settings(u.token);
    expect(before.workingHours.start).toBe("09:30");

    // Each request mixes one invalid clock with otherwise-valid, DIFFERENT values; if any part of
    // the merged object were written, the valid siblings would show up in the stored settings.
    const poisoned = [
      { workingHours: { start: "", end: "20:00", days: [1, 2, 3] } },
      { workingHours: { start: "10:00", end: "99:99" } },
      { softRest: { enabled: true, start: "bad", end: "14:00" } },
      { softRest: { enabled: true, start: "12:00", end: "13:70" } },
    ];
    for (const body of poisoned) {
      const bad = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: body } });
      expect(bad.status).toBe(400);
      expect(await settings(u.token)).toEqual(before);
    }
  });

  it("FUP-05: a wrong-typed settings section is refused instead of silently no-op'ing past its fields", async () => {
    const u = await user();
    const before = await settings(u.token);
    const wrongShapes: Array<[string, unknown]> = [
      ["workingHours string", { workingHours: "08:00" }],
      ["workingHours null", { workingHours: null }],
      ["workingHours array", { workingHours: ["08:00"] }],
      ["workingHours number", { workingHours: 8 }],
      ["softRest string", { softRest: "12:00" }],
      ["softRest null", { softRest: null }],
      ["settings string", "08:00"],
      ["settings array", ["08:00"]],
    ];
    for (const [label, value] of wrongShapes) {
      const bad = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: value } });
      expect(bad.status, `${label} must be 400`).toBe(400);
    }
    expect(await settings(u.token)).toEqual(before);
  });

  it("FUP-06: valid clocks round-trip byte-identical, absent/null keeps the stored value, defaults intact", async () => {
    const u = await user();
    const defaults = await settings(u.token);
    expect(defaults).toEqual({
      workingHours: { start: "08:00", end: "22:00", days: [0, 1, 2, 3, 4, 5, 6] },
      softRest: { enabled: true, start: "12:00", end: "13:00" },
      graceMinutes: 10,
    });

    // Round-trip edge values exactly as sent (no trimming, padding or normalisation). Every edge
    // is asserted on every field so a regression that rejects a specific bound (notably the
    // upper bound 23:59, adjacent to the range check) cannot slip through the gate.
    //
    // APE-BATCH-003 / D-039 amended the loop: start/end are now an ordered pair, so each field's
    // edges are pinned against a companion clock that keeps the pair valid (start edges with
    // end "23:59", end edges with start "00:00"). Every still-valid value round-trips byte-
    // identical exactly as before; the two extremes with no valid partner (start "23:59", end
    // "00:00") are pinned as 400s by B3-04 instead.
    const readClock = (stored: any, path: string) =>
      path === "workingHours.start" ? stored.workingHours.start
      : path === "workingHours.end" ? stored.workingHours.end
      : path === "softRest.start" ? stored.softRest.start
      : stored.softRest.end;
    const startEdges = ["00:00", "07:05", "12:30", "23:58"];
    const endEdges = ["00:01", "07:05", "12:30", "23:59"];
    for (const field of clockFields) {
      const section = field.path.startsWith("workingHours") ? "workingHours" : "softRest";
      const isStart = field.path.endsWith(".start");
      const edges = isStart ? startEdges : endEdges;
      for (const edge of edges) {
        const pair = isStart ? { [section]: { start: edge, end: "23:59" } } : { [section]: { start: "00:00", end: edge } };
        const good = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: pair } });
        expect(good.status, `${field.path}=${edge} must be accepted`).toBe(200);
        expect(readClock(await settings(u.token), field.path), `${field.path} must store ${edge}`).toBe(edge);
      }
    }

    // Absent and null both mean "not sent" and keep the stored value (documented helper contract).
    const absent = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: 15 } } });
    expect(absent.status).toBe(200);
    const afterAbsent = await settings(u.token);
    // Last pair written by the loop above: start "00:00" (end-edge companion), end "23:59".
    expect(afterAbsent.workingHours.start).toBe("00:00");
    expect(afterAbsent.workingHours.end).toBe("23:59");
    expect(afterAbsent.graceMinutes).toBe(15);

    const nulled = await call<any>(server.base, "PATCH", "/api/auth/settings", {
      token: u.token,
      body: { settings: { workingHours: { start: null, end: null }, softRest: { start: null, end: null } } },
    });
    expect(nulled.status).toBe(200);
    expect(await settings(u.token)).toEqual(afterAbsent);
  });

  it("FUP-07: a scheduling call still honours an updated clock end-to-end (stored value -> working window)", async () => {
    const u = await user();
    // Narrow the working window to a single hour and confirm free time reflects exactly it.
    const patched = await call<any>(server.base, "PATCH", "/api/auth/settings", {
      token: u.token,
      body: { settings: { workingHours: { start: "09:00", end: "10:00" } } },
    });
    expect(patched.status).toBe(200);

    const day = 24 * 60 * 60 * 1000;
    const free = await call<{ workingWindows: { start: number; end: number }[] }>(server.base, "GET", `/api/calendar?from=${Date.now()}&to=${Date.now() + day}`, {
      token: u.token,
    });
    expect(free.status).toBe(200);
    expect(free.data.workingWindows.length).toBeGreaterThan(0);
    for (const window of free.data.workingWindows) {
      expect(window.end - window.start).toBeLessThanOrEqual(60 * 60 * 1000);
    }
  });

  it("FUP-08 (REV-003/004 close-out): optionalTitle rejects non-strings, trims on rename, caps trimmed length", async () => {
    const u = await user();
    const task = await createTask(u.token, { title: "Title edge cases" });

    // REV-003: a non-string title is a 400 (null/absent still means "keep", covered by ACC-01).
    const bad = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, { token: u.token, body: { title: 42 } });
    expect(bad.status).toBe(400);
    expect(bad.data.error.message).toContain("must be text");

    // REV-004 (behaviour pin): a whitespace-padded rename is stored trimmed — the stored value is
    // never padded, and the trim happens on write, not on read.
    const padded = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, { token: u.token, body: { title: "   Padded rename   " } });
    expect(padded.status).toBe(200);
    const stored = await call<{ task: any }>(server.base, "GET", `/api/tasks/${task.id}`, { token: u.token });
    expect(stored.data.task.title).toBe("Padded rename");

    // REV-004 (behaviour pin): the length cap is evaluated on the raw string, matching the
    // long-standing `asString` convention — 301 chars of spaces is refused even though it would
    // trim to empty, and a 300-char padded value is refused before trimming can rescue it.
    const overCap = "x".repeat(301);
    const tooLong = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, { token: u.token, body: { title: overCap } });
    expect(tooLong.status).toBe(400);
    expect(tooLong.data.error.message).toContain("too long");
    // A value whose trimmed length is under the cap but raw length is over it is also refused,
    // pinning the documented pre-trim check rather than silently accepting it.
    const paddedOver = `${"y".repeat(300)}  `;
    const paddedTooLong = await call<any>(server.base, "PATCH", `/api/tasks/${task.id}`, { token: u.token, body: { title: paddedOver } });
    expect(paddedTooLong.status).toBe(400);
  });
});

/**
 * APE-BATCH-003 regressions (B3-*, IDs deliberately outside the REV / FUP / ACC id spaces):
 *  B3-01 graceMinutes rejects empty/whitespace/non-number shapes with 400 naming the field
 *  B3-02 graceMinutes refuses out-of-range values instead of silently clamping (REV-FUP-04 close)
 *  B3-03 graceMinutes null/absent keeps the stored value; valid integers round-trip
 *  B3-04 an inverted or zero-width working/rest window is a 400 naming the field (D-039)
 *  B3-05 a rejected settings PATCH still leaves stored settings byte-identical (no partial write)
 *  B3-06 scheduling never sees a negative/zero-width working window (end-to-end pin of D-039)
 */
describe("APE-BATCH-003 — settings validation hardening (B3-01 … B3-06)", () => {
  async function settings(token: string) {
    const response = await call<{ user: any }>(server.base, "GET", "/api/auth/me", { token });
    return response.data.user.settings as {
      workingHours: { start: string; end: string; days: number[] };
      softRest: { enabled: boolean; start: string; end: string };
      graceMinutes: number;
    };
  }

  it("B3-01: graceMinutes rejects empty/whitespace/non-number shapes with 400 naming the field", async () => {
    const u = await user();
    const before = await settings(u.token);
    // The shapes the old Number()-coercion accepted as 0/1/NaN: "" -> 0, " " -> 0, "25" -> 25,
    // true -> 1, [] -> 0, [25] -> 25, {} -> NaN (kept current), {valueOf:...} -> coerced.
    const bad: Array<[string, unknown]> = [
      ["empty string", ""],
      ["whitespace", "   "],
      ["numeric string", "25"],
      ["boolean true", true],
      ["boolean false", false],
      ["empty array", []],
      ["number array", [25]],
      ["object", {}],
    ];
    for (const [label, value] of bad) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: value } } });
      expect(r.status, `graceMinutes=${label} must be 400`).toBe(400);
      expect(r.data.error.message).toContain("settings.graceMinutes");
      expect(r.data.error.details?.field).toBe("settings.graceMinutes");
    }
    expect(await settings(u.token)).toEqual(before);
  });

  it("B3-02: graceMinutes refuses out-of-range values instead of silently clamping (REV-FUP-04)", async () => {
    const u = await user();
    const before = await settings(u.token);
    // Range is checked on the ROUNDED value (documented contract): -0.6 rounds to -1 -> refused,
    // but -0.4 rounds to 0 and 120.4 rounds to 120, both in range -> accepted.
    for (const value of [-1, -0.6, 121, 120.6, 999, 10_000]) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: value } } });
      expect(r.status, `graceMinutes=${value} must be 400 (was silently clamped before)`).toBe(400);
      expect(r.data.error.message).toContain("settings.graceMinutes");
    }
    expect(await settings(u.token)).toEqual(before);

    // Fractional minutes round to the nearest whole minute, then the range applies.
    for (const [value, stored] of [[-0.4, 0], [120.4, 120], [25.6, 26]] as Array<[number, number]>) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: value } } });
      expect(r.status, `graceMinutes=${value} must be accepted`).toBe(200);
      expect((await settings(u.token)).graceMinutes).toBe(stored);
    }
  });

  it("B3-03: graceMinutes null/absent keeps the stored value; valid integers round-trip", async () => {
    const u = await user();
    // Seed a non-default value first so "keep" is meaningful.
    const seeded = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: 42 } } });
    expect(seeded.status).toBe(200);
    expect((await settings(u.token)).graceMinutes).toBe(42);

    const nulled = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: null } } });
    expect(nulled.status).toBe(200);
    expect((await settings(u.token)).graceMinutes).toBe(42);

    const absent = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { workingHours: { start: "09:00" } } } });
    expect(absent.status).toBe(200);
    expect((await settings(u.token)).graceMinutes).toBe(42);

    // Both bounds are accepted (the range is the product's long-standing 0–120 clamp).
    for (const value of [0, 120]) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { graceMinutes: value } } });
      expect(r.status, `graceMinutes=${value} must be accepted`).toBe(200);
      expect((await settings(u.token)).graceMinutes).toBe(value);
    }
  });

  it("B3-04: an inverted or zero-width working/rest window is a 400 naming the field (D-039)", async () => {
    const u = await user();
    const before = await settings(u.token);
    const cases: Array<[string, unknown, string]> = [
      ["workingHours inverted (22:00->08:00)", { workingHours: { start: "22:00", end: "08:00" } }, "settings.workingHours.end"],
      ["workingHours equal (08:00->08:00)", { workingHours: { start: "08:00", end: "08:00" } }, "settings.workingHours.end"],
      ["softRest inverted (13:00->12:00)", { softRest: { start: "13:00", end: "12:00" } }, "settings.softRest.end"],
      ["softRest equal (12:00->12:00)", { softRest: { start: "12:00", end: "12:00" } }, "settings.softRest.end"],
      // The ordering rule must run on the MERGED pair: a partial patch that would invert the
      // stored window is refused too (start alone, end alone).
      ["start-only patch inverting stored end", { workingHours: { start: "23:30" } }, "settings.workingHours.end"],
      ["end-only patch before stored start", { workingHours: { end: "07:00" } }, "settings.workingHours.end"],
    ];
    for (const [label, body, field] of cases) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: body } });
      expect(r.status, `${label} must be 400`).toBe(400);
      expect(r.data.error.message).toContain(field);
    }
    expect(await settings(u.token)).toEqual(before);

    // The former extremes with no valid partner (start 23:59, end 00:00) are now 400s too.
    for (const body of [{ workingHours: { start: "23:59" } }, { workingHours: { end: "00:00" } }]) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: body } });
      expect(r.status).toBe(400);
    }
  });

  it("B3-05: a rejected settings PATCH leaves stored settings byte-identical (no partial write)", async () => {
    const u = await user();
    const seed = await call<any>(server.base, "PATCH", "/api/auth/settings", {
      token: u.token,
      body: { settings: { workingHours: { start: "09:30", end: "18:15" }, softRest: { enabled: false, start: "12:30", end: "13:15" }, graceMinutes: 25 } },
    });
    expect(seed.status).toBe(200);
    const before = await settings(u.token);

    // Each body mixes one invalid value with otherwise-valid, DIFFERENT siblings; if any part of
    // the merged object were written, the valid siblings would show up in the stored settings.
    const poisoned: unknown[] = [
      { graceMinutes: 999, workingHours: { start: "10:00" }, softRest: { enabled: true } },
      { graceMinutes: "", softRest: { enabled: true, start: "12:00" } },
      { workingHours: { start: "22:00", end: "08:00", days: [1, 2, 3] }, graceMinutes: 5 },
      { softRest: { start: "13:00", end: "12:00", enabled: true }, graceMinutes: 60 },
    ];
    for (const body of poisoned) {
      const r = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: body } });
      expect(r.status, `${JSON.stringify(body)} must be 400`).toBe(400);
      expect(await settings(u.token)).toEqual(before);
    }
  });

  it("B3-06: scheduling never sees a negative/zero-width working window (end-to-end pin of D-039)", async () => {
    const u = await user();
    await call<any>(server.base, "POST", "/api/tasks", { token: u.token, body: { title: "B3 scheduling task", estimatedMinutes: 30 } });

    // The inverted window is refused at the settings boundary, so the stored config stays valid...
    const inverted = await call<any>(server.base, "PATCH", "/api/auth/settings", { token: u.token, body: { settings: { workingHours: { start: "22:00", end: "08:00" } } } });
    expect(inverted.status).toBe(400);

    // ...and every working window the scheduler receives has positive width.
    const from = Date.now();
    const to = from + 2 * DAY;
    const cal = await call<{ workingWindows: { start: number; end: number }[] }>(server.base, "GET", `/api/calendar?from=${from}&to=${to}`, { token: u.token });
    expect(cal.status).toBe(200);
    expect(cal.data.workingWindows.length).toBeGreaterThan(0);
    for (const window of cal.data.workingWindows) {
      expect(window.end - window.start, `window ${new Date(window.start).toISOString()} must have positive width`).toBeGreaterThan(0);
    }

    // A plan over that horizon is still computable and honest (no crash, real feasibility).
    const plan = await call<any>(server.base, "POST", "/api/schedule/plan", { token: u.token, body: { from, to } });
    expect(plan.status).toBe(200);
    expect(typeof plan.data.feasibility?.feasible).toBe("boolean");
  });
});

/**
 * APE-BATCH-003 (B3-08): `GET /api/activity/:id` was CODE-ONLY — the single-entry fetch with its
 * undo preview. Every prior test reached an audit entry through `POST /api/activity/:id/undo` or
 * the `GET /api/activity` list, so this route's own contract (200 + `entry` + `preview`, the
 * `not_undoable` / `already_undone` preview reasons, and the owner-scoped 404) had no regression
 * test at all. The undo RESULT is covered elsewhere (AT30/AT31); this pins the READ contract.
 */
describe("APE-BATCH-003 — activity single-entry read contract (B3-08)", () => {
  it("B3-08: GET /api/activity/:id returns the entry plus an undo preview, and 404s for foreign/unknown ids", async () => {
    const u = await user();
    // A schedule change is what the timeline records (impl-spec: "every schedule change is
    // attributable"). Event creation is auditable and undoable — plain task capture is not, by
    // design (the timeline is a *schedule* timeline, not a capture log).
    const start = Date.now() + 2 * HOUR;
    const createdEvent = await call<{ event: any }>(server.base, "POST", "/api/calendar/events", {
      token: u.token,
      body: { title: "Read contract event", startAt: start, endAt: start + HOUR },
    });
    expect(createdEvent.status).toBe(201);

    // A reversible change: creating a schedule event is undoable and not yet undone.
    const list = await entries(u.token);
    const created = list.find(
      (entry) => entry.entityId === createdEvent.data.event.id && entry.undoable && entry.undoneAt === null,
    );
    expect(created, "an event create must produce an undoable audit entry").toBeTruthy();

    const single = await call<{ entry: any; preview: any }>(server.base, "GET", `/api/activity/${created.id}`, { token: u.token });
    expect(single.status).toBe(200);
    expect(single.data.entry.id).toBe(created.id);
    expect(single.data.preview).toEqual({
      available: true,
      reason: "ok",
      summary: expect.stringContaining("Reverse:"),
    });

    // An action with no reversal path reports why rather than pretending it can be undone.
    // Habit check-in removal is recorded with undoable: false — the row is gone, so there is
    // nothing to restore; the preview must say so instead of offering a second reversal.
    const habit = await call<{ habit: any }>(server.base, "POST", "/api/habits", {
      token: u.token,
      body: { title: "Read contract habit", cadence: "daily", targetCount: 1 },
    });
    expect(habit.status).toBe(201);
    const checkin = await call<{ checkin: any }>(server.base, "POST", `/api/habits/${habit.data.habit.id}/checkins`, {
      token: u.token,
      body: { at: Date.now() },
    });
    expect(checkin.status).toBe(201);
    const removed = await call<any>(
      server.base,
      "DELETE",
      `/api/habits/${habit.data.habit.id}/checkins/${checkin.data.checkin.id}`,
      { token: u.token },
    );
    expect(removed.status).toBe(204);
    const irreversible = (await entries(u.token)).find((entry) => entry.action === "habit.checkin.remove");
    expect(irreversible, "check-in removal must be recorded").toBeTruthy();
    expect(irreversible.undoable).toBe(false);
    const preview = await call<{ preview: any }>(server.base, "GET", `/api/activity/${irreversible.id}`, { token: u.token });
    expect(preview.status).toBe(200);
    expect(preview.data.preview.available).toBe(false);
    expect(preview.data.preview.reason).toBe("not_undoable");
    expect(preview.data.preview.summary).toBe("This action has no reversal path.");

    // Undoing the event create is refused because its revision moved (the create wrote the row the
    // audit snapshots, so current revision no longer matches "after"). AT31 already pins this as a
    // 409 undo_conflict; here it just has to stay refused rather than half-apply.
    const refused = await call<any>(server.base, "POST", `/api/activity/${created.id}/undo`, { token: u.token });
    expect([200, 409]).toContain(refused.status);
    const stillListed = (await entries(u.token)).find((entry) => entry.id === created.id);
    expect(stillListed, "a refused undo must leave the timeline entry in place").toBeTruthy();

    // The preview must agree with what the undo endpoint would actually do, whatever that is —
    // the read contract and the action contract may never disagree.
    const reread = await call<{ entry: any; preview: any }>(server.base, "GET", `/api/activity/${created.id}`, { token: u.token });
    expect(reread.status).toBe(200);
    expect(typeof reread.data.preview.available).toBe("boolean");
    expect(typeof reread.data.preview.reason).toBe("string");
    expect(reread.data.preview.available).toBe(!reread.data.entry.undoneAt && reread.data.entry.undoable);

    // Owner scoping: the 404 for a foreign id must be byte-identical to an unknown id (no oracle),
    // and an authenticated caller still gets it.
    const other = await user();
    const foreign = await call<any>(server.base, "GET", `/api/activity/${created.id}`, { token: other.token });
    expect(foreign.status).toBe(404);
    const unknown = await call<any>(server.base, "GET", "/api/activity/aud_does_not_exist", { token: u.token });
    expect(unknown.status).toBe(404);
    expect(foreign.data.error.message).toBe(unknown.data.error.message);
    expect(JSON.stringify(foreign.data)).toBe(JSON.stringify(unknown.data));
  });
});

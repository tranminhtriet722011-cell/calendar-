/**
 * Unit tests for the deterministic scheduling core, time handling and execution flags.
 * Acceptance coverage: AT11–AT19, AT21, AT23, AT26 (see docs/spec/APE_V1_1_TRACEABILITY.md).
 */

import { describe, expect, it } from "vitest";
import {
  generateProposals,
  planChunks,
  proposalSignature,
  rankTasks,
  validatePlacements,
  type BusyBlock,
  type SchedulerInput,
  type SchedulerTask,
} from "../server/domain/scheduler";
import {
  dayKey,
  localDayRange,
  mergeRanges,
  minutesSinceMidnight,
  subtractRanges,
  totalMinutes,
  zonedTimeToInstant,
} from "../server/domain/time";
import { canTransition, computeTaskFlags, remainingAfterLog } from "../server/domain/taskState";

const BASE = Date.UTC(2026, 9, 21); // 2026-10-21T00:00:00Z, a Wednesday
const HOUR = 60 * 60 * 1000;

function workingWindow(dayOffset = 0): { start: number; end: number } {
  return { start: BASE + dayOffset * 24 * HOUR + 8 * HOUR, end: BASE + dayOffset * 24 * HOUR + 22 * HOUR };
}

function task(overrides: Partial<SchedulerTask> & { id: string }): SchedulerTask {
  return {
    title: `Task ${overrides.id}`,
    remainingMinutes: 60,
    minBlockMinutes: 15,
    maxBlockMinutes: 90,
    splittable: true,
    priority: 3,
    dueAt: null,
    earliestStart: BASE,
    createdAt: BASE,
    ...overrides,
  };
}

function input(overrides: Partial<SchedulerInput> = {}): SchedulerInput {
  return {
    now: BASE + 8 * HOUR,
    horizon: { start: BASE, end: BASE + 7 * 24 * HOUR },
    tasks: [],
    workingWindows: [workingWindow(), workingWindow(1)],
    softRest: [{ start: BASE + 12 * HOUR, end: BASE + 13 * HOUR }],
    busy: [],
    allowLockedOverride: false,
    ...overrides,
  };
}

function lockedEvent(id = "evt_fixed", dayOffset = 0, hour = 19): BusyBlock {
  return {
    id,
    start: BASE + dayOffset * 24 * HOUR + hour * HOUR,
    end: BASE + dayOffset * 24 * HOUR + (hour + 1) * HOUR,
    kind: "event",
    locked: true,
    label: "Fixed lecture",
  };
}

describe("chunking (AT15)", () => {
  it("splits a 2h task into 45+45+30 with min 30 / max 45", () => {
    expect(planChunks(120, 30, 45, true)).toEqual([45, 45, 30]);
  });

  it("keeps a task that fits inside one session whole", () => {
    expect(planChunks(60, 15, 90, true)).toEqual([60]);
  });

  it("never splits a non-splittable task", () => {
    expect(planChunks(120, 30, 45, false)).toEqual([120]);
  });

  it("always sums to the remaining effort and respects [min,max] where possible", () => {
    for (const remaining of [75, 130, 200, 345, 1000]) {
      const chunks = planChunks(remaining, 15, 45, true);
      expect(chunks.reduce((sum, value) => sum + value, 0)).toBe(remaining);
      expect(Math.min(...chunks)).toBeGreaterThanOrEqual(15);
      expect(Math.max(...chunks)).toBeLessThanOrEqual(45);
    }
  });

  it("returns nothing for zero or negative effort", () => {
    expect(planChunks(0, 15, 45, true)).toEqual([]);
    expect(planChunks(-10, 15, 45, true)).toEqual([]);
  });
});

describe("ordering and stability (AT17, AT18)", () => {
  it("breaks ties deterministically by age then id", () => {
    const tasks = [
      task({ id: "b", createdAt: BASE + 1, priority: 3, dueAt: null }),
      task({ id: "a", createdAt: BASE + 2, priority: 3, dueAt: null }),
      task({ id: "c", createdAt: BASE + 1, priority: 3, dueAt: null }),
    ];
    const ranked = rankTasks(tasks, "minimal").map((item) => item.id);
    expect(ranked).toEqual(["b", "c", "a"]);
    // Identical input must produce identical order regardless of insertion order.
    const rankedAgain = rankTasks([...tasks].reverse(), "minimal").map((item) => item.id);
    expect(rankedAgain).toEqual(ranked);
  });

  it("orders deadline strategy by due date first", () => {
    const tasks = [
      task({ id: "late", dueAt: BASE + 3 * 24 * HOUR, priority: 5 }),
      task({ id: "soon", dueAt: BASE + 1 * 24 * HOUR, priority: 1 }),
    ];
    expect(rankTasks(tasks, "deadline").map((item) => item.id)).toEqual(["soon", "late"]);
  });

  it("generates byte-identical proposals for identical input (no oscillation)", () => {
    const scenario = input({
      tasks: [
        task({ id: "t1", remainingMinutes: 90, priority: 4, dueAt: BASE + 24 * HOUR }),
        task({ id: "t2", remainingMinutes: 45, priority: 4, dueAt: BASE + 24 * HOUR }),
        task({ id: "t3", remainingMinutes: 30 }),
      ],
      busy: [lockedEvent()],
    });
    const first = generateProposals(scenario);
    const second = generateProposals(scenario);
    const third = generateProposals(scenario);
    expect(first.proposals.map((proposal) => proposal.id)).toEqual(second.proposals.map((proposal) => proposal.id));
    expect(second.proposals.map((proposal) => proposal.id)).toEqual(third.proposals.map((proposal) => proposal.id));
    expect(first.proposals.map((proposal) => proposalSignature(proposal))).toEqual(
      third.proposals.map((proposal) => proposalSignature(proposal)),
    );
  });

  it("returns up to three genuinely different strategies", () => {
    const result = generateProposals(
      input({
        tasks: [
          task({ id: "t1", remainingMinutes: 120, priority: 5, dueAt: BASE + 48 * HOUR, maxBlockMinutes: 45, minBlockMinutes: 30 }),
          task({ id: "t2", remainingMinutes: 120, priority: 2, dueAt: BASE + 24 * HOUR, maxBlockMinutes: 45, minBlockMinutes: 30 }),
        ],
        busy: [lockedEvent()],
      }),
    );
    expect(result.proposals.length).toBeGreaterThanOrEqual(1);
    expect(result.proposals.length).toBeLessThanOrEqual(3);
    const signatures = new Set(result.proposals.map((proposal) => proposal.placements.map((p) => `${p.taskId}:${p.start}`).join(",")));
    expect(signatures.size).toBe(result.proposals.length);
  });
});

describe("hard constraints (H1–H11, AT11–AT13)", () => {
  it("never overlaps a locked/fixed event (AT12)", () => {
    const event = lockedEvent();
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 180, dueAt: null })],
        busy: [event],
      }),
    );
    expect(result.proposals.length).toBeGreaterThan(0);
    for (const proposal of result.proposals) {
      expect(proposal.violations).toEqual([]);
      for (const placement of proposal.placements) {
        expect(placement.start < event.end && event.start < placement.end).toBe(false);
      }
    }
  });

  it("does not place anything inside protected rest hours (AT13)", () => {
    // Protected rest is modelled as time outside the allowed working windows.
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 240 })],
        workingWindows: [{ start: BASE + 8 * HOUR, end: BASE + 12 * HOUR }],
        softRest: [],
        busy: [lockedEvent()],
      }),
    );
    for (const proposal of result.proposals) {
      for (const placement of proposal.placements) {
        expect(placement.start).toBeGreaterThanOrEqual(BASE + 8 * HOUR);
        expect(placement.end).toBeLessThanOrEqual(BASE + 12 * HOUR);
      }
    }
  });

  it("flags an override of a locked interval as not permitted (AT11)", () => {
    const event = lockedEvent();
    const violations = validatePlacements(
      [{ taskId: "t1", start: event.start, end: event.end }],
      input({ tasks: [task({ id: "t1" })], busy: [event] }),
    );
    expect(violations.map((violation) => violation.code)).toContain("OVERRIDE_NOT_PERMITTED");
  });

  it("never schedules past a hard deadline (AT16 / H9)", () => {
    const due = BASE + 10 * HOUR; // inside today's working window
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 60 * 20, dueAt: due })],
        now: BASE + 8 * HOUR,
      }),
    );
    expect(result.feasibility.feasible).toBe(false);
    expect(result.feasibility.shortfallMinutes).toBeGreaterThan(0);
    expect(result.proposals).toEqual([]);
    expect(result.feasibility.userOptions.length).toBeGreaterThan(0);
  });

  it("reports a shortfall when the deadline falls before any free window (AT16)", () => {
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 60, dueAt: BASE + 7 * HOUR })],
        now: BASE + 6 * HOUR,
      }),
    );
    expect(result.feasibility.feasible).toBe(false);
    expect(result.feasibility.shortfalls[0]?.minutes).toBeGreaterThan(0);
    expect(result.feasibility.shortfalls[0]?.reason).toMatch(/deadline|free minutes/i);
  });

  it("reports honestly when a non-splittable task has no single window long enough (AT26)", () => {
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 180, splittable: false, maxBlockMinutes: 180 })],
        workingWindows: [
          { start: BASE + 8 * HOUR, end: BASE + 9 * HOUR },
          { start: BASE + 10 * HOUR, end: BASE + 11 * HOUR },
        ],
        softRest: [],
      }),
    );
    expect(result.feasibility.feasible).toBe(false);
    expect(result.feasibility.shortfalls[0]?.reason).toMatch(/No single free window/i);
    expect(result.feasibility.userOptions.length).toBeGreaterThan(0);
  });

  it("does not mutate its input while planning", () => {
    const event = lockedEvent();
    const busyBefore = JSON.stringify([event]);
    const scenario = input({ tasks: [task({ id: "t1" })], busy: [event] });
    generateProposals(scenario);
    expect(JSON.stringify(scenario.busy)).toBe(busyBefore);
  });
});

describe("soft objectives (F4, S1–S9)", () => {
  it("penalises using soft rest and prefers genuine free time", () => {
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 60 })],
        workingWindows: [{ start: BASE + 8 * HOUR, end: BASE + 13 * HOUR }],
        softRest: [{ start: BASE + 12 * HOUR, end: BASE + 13 * HOUR }],
      }),
    );
    const proposal = result.proposals[0];
    expect(proposal).toBeDefined();
    expect(proposal?.metrics.restPenaltyMinutes).toBe(0);
    expect(proposal?.placements[0]?.start).toBeLessThan(BASE + 12 * HOUR);
  });

  it("falls back to soft rest when nothing else fits, and says so", () => {
    const result = generateProposals(
      input({
        tasks: [task({ id: "t1", remainingMinutes: 60 })],
        workingWindows: [{ start: BASE + 12 * HOUR, end: BASE + 13 * HOUR }],
        softRest: [{ start: BASE + 12 * HOUR, end: BASE + 13 * HOUR }],
      }),
    );
    const proposal = result.proposals[0];
    expect(proposal?.metrics.restPenaltyMinutes).toBeGreaterThan(0);
    expect(proposal?.reasons.join(" ")).toMatch(/soft rest/i);
  });

  it("ranks higher-priority work first in the balanced strategy", () => {
    const ranked = rankTasks(
      [task({ id: "low", priority: 1 }), task({ id: "high", priority: 5 })],
      "balanced",
    );
    expect(ranked.map((item) => item.id)).toEqual(["high", "low"]);
  });
});

describe("time utilities (AT19)", () => {
  it("resolves local day keys in the user's zone", () => {
    const instant = Date.UTC(2026, 9, 20, 18, 30); // 2026-10-21 01:30 in Ho Chi Minh
    expect(dayKey(instant, "Asia/Ho_Chi_Minh")).toBe("2026-10-21");
    expect(dayKey(instant, "UTC")).toBe("2026-10-20");
  });

  it("keeps a 23-hour spring-forward day intact", () => {
    const range = localDayRange(zonedTimeToInstant(2026, 3, 8, 12, 0, "America/New_York"), "America/New_York");
    expect((range.end - range.start) / (60 * 60 * 1000)).toBe(23);
    // A 23-hour day tops out at minute 1379 — the wall clock skips 02:00–03:00.
    expect(minutesSinceMidnight(range.end - 60 * 1000, "America/New_York")).toBe(1379);
  });

  it("keeps a 25-hour fall-back day intact", () => {
    const range = localDayRange(zonedTimeToInstant(2026, 11, 1, 12, 0, "America/New_York"), "America/New_York");
    expect((range.end - range.start) / (60 * 60 * 1000)).toBe(25);
  });

  it("normalises and subtracts ranges without leaking time", () => {
    const m = (value: number): number => value * 60_000;
    const merged = mergeRanges([
      { start: m(0), end: m(10) },
      { start: m(5), end: m(20) },
      { start: m(30), end: m(40) },
    ]);
    expect(merged).toEqual([
      { start: m(0), end: m(20) },
      { start: m(30), end: m(40) },
    ]);
    const free = subtractRanges([{ start: m(0), end: m(100) }], [
      { start: m(10), end: m(20) },
      { start: m(40), end: m(50) },
    ]);
    expect(totalMinutes(free)).toBe(80);
    expect(free).toEqual([
      { start: m(0), end: m(10) },
      { start: m(20), end: m(40) },
      { start: m(50), end: m(100) },
    ]);
  });
});

describe("execution flags and transitions (AT21, AT23, E3)", () => {
  it("marks a late start without claiming the work did not happen", () => {
    const flags = computeTaskFlags({
      now: BASE + 18 * HOUR + 30 * 60 * 1000,
      status: "not_started",
      dueAt: null,
      estimatedMinutes: 60,
      remainingMinutes: 60,
      actualMinutes: 0,
      blockStart: BASE + 18 * HOUR,
      blockEnd: BASE + 19 * HOUR,
      graceMinutes: 10,
    });
    expect(flags.late_start).toBe(true);
    expect(flags.overdue).toBe(false);
  });

  it("marks overdue without completing or cancelling the task", () => {
    const flags = computeTaskFlags({
      now: BASE + 30 * HOUR,
      status: "in_progress",
      dueAt: BASE + 20 * HOUR,
      estimatedMinutes: 60,
      remainingMinutes: 20,
      actualMinutes: 40,
      blockStart: null,
      blockEnd: null,
      graceMinutes: 10,
    });
    expect(flags.overdue).toBe(true);
    expect(flags.at_risk).toBe(true);
    expect(canTransition("in_progress", "in_progress")).toBe(true);
    expect(canTransition("not_started", "paused")).toBe(false);
    expect(canTransition("completed", "in_progress")).toBe(false);
  });

  it("flags overtime when actual exceeds estimate but never auto-completes (AT23)", () => {
    const flags = computeTaskFlags({
      now: BASE + 10 * HOUR,
      status: "in_progress",
      dueAt: null,
      estimatedMinutes: 30,
      remainingMinutes: 0,
      actualMinutes: 45,
      blockStart: null,
      blockEnd: null,
      graceMinutes: 10,
    });
    expect(flags.overtime).toBe(true);
    expect(flags.at_risk).toBe(false);
  });

  it("prefers the user's own answer about remaining effort", () => {
    expect(remainingAfterLog(60, 45, 30)).toBe(30);
    expect(remainingAfterLog(60, 45, null)).toBe(15);
    expect(remainingAfterLog(30, 45, null)).toBe(0);
    expect(remainingAfterLog(60, 45, 0)).toBe(0);
  });
});

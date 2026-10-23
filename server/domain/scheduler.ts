/**
 * Deterministic constraint & proposal service (spec F1–F10).
 *
 * Contract with the rest of the system:
 *  - The engine NEVER mutates entities. It returns proposals; a caller commits them after
 *    revalidation (H8) and explicit user approval (spec G3, D-003 suggest-only).
 *  - Hard constraints (H1–H11) are filtered before any soft objective is considered (F5.1, CR04).
 *  - No clock, no randomness, no map iteration order dependence: identical input ⇒ identical
 *    output, including proposal ids (F5, AT18).
 *  - Infeasibility is reported honestly with a shortfall instead of a schedule that quietly breaks
 *    a hard constraint (F5.5, AT16, "Honest feasibility").
 */

import {
  type Instant,
  type Range,
  MINUTE_MS,
  durationMinutes,
  intersectRanges,
  mergeRanges,
  rangesOverlap,
  subtractRanges,
  totalMinutes,
} from "./time";

export type Strategy = "minimal" | "deadline" | "balanced";

export const STRATEGIES: Strategy[] = ["minimal", "deadline", "balanced"];

export interface SchedulerTask {
  id: string;
  title: string;
  remainingMinutes: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  splittable: boolean;
  /** 1..5 — higher is more important (spec S2). */
  priority: number;
  /** Hard deadline: no placement may end after this instant (H9). */
  dueAt: Instant | null;
  earliestStart: Instant;
  createdAt: Instant;
}

export interface BusyBlock extends Range {
  id: string;
  kind: "event" | "block" | "rest";
  locked: boolean;
  label: string;
}

export interface SchedulerInput {
  now: Instant;
  horizon: Range;
  tasks: SchedulerTask[];
  /** Windows in which work is allowed at all (already excludes protected rest). */
  workingWindows: Range[];
  /** Optional soft rest (e.g. lunch): usable only when nothing else fits, and penalized (S4/H5). */
  softRest: Range[];
  /** Fixed events, protected rest and already committed blocks (H1, H3, H5). */
  busy: BusyBlock[];
  /**
   * Block ids belonging to the task being recovered: their time returns to the pool and the
   * proposal reports them as moved (spec F8). Only ever supplied for the requesting task.
   */
  releaseableBlockIds?: string[];
  /** Off by default and never enabled by the agent in this increment (H1/H2/H3, D-013). */
  allowLockedOverride: boolean;
}

export interface Placement {
  taskId: string;
  start: Instant;
  end: Instant;
}

export interface ReleasedBlock {
  blockId: string;
  taskId: string;
  start: Instant;
  end: Instant;
}

export type ViolationCode =
  | "OVERLAPS_BUSY"
  | "OVERRIDE_NOT_PERMITTED"
  | "OUTSIDE_WORKING_HOURS"
  | "PAST_HARD_DUE"
  | "NON_POSITIVE_DURATION"
  | "UNKNOWN_TASK"
  | "DUPLICATE_TASK";

export interface Violation {
  code: ViolationCode;
  message: string;
  taskId?: string;
  range?: Range;
}

export interface ProposalMetrics {
  /** Minutes that could not be placed, weighted by deadline pressure. Higher is worse. */
  deadlineRisk: number;
  /** Share of weighted minutes actually placed (0..1). */
  priorityCoverage: number;
  /** Minutes placed inside a soft-rest window (S4). */
  restPenaltyMinutes: number;
  /** Extra sessions created beyond one per task (S7 anti-fragmentation). */
  fragmentation: number;
  /** Number of blocks the proposal would create (S5 prefers fewer changes). */
  changeCount: number;
}

export interface Proposal {
  id: string;
  strategy: Strategy;
  placements: Placement[];
  releases: ReleasedBlock[];
  unplaced: { taskId: string; minutes: number; reason: string }[];
  metrics: ProposalMetrics;
  score: number;
  violations: Violation[];
  reasons: string[];
}

export interface Shortfall {
  taskId: string;
  title: string;
  minutes: number;
  reason: string;
}

export interface Feasibility {
  feasible: boolean;
  requiredMinutes: number;
  freeMinutes: number;
  shortfallMinutes: number;
  shortfalls: Shortfall[];
  /** User-facing options when nothing is feasible (F5.5). */
  userOptions: string[];
}

export interface PlanResult {
  proposals: Proposal[];
  feasibility: Feasibility;
}

export const DEFAULT_MIN_BLOCK_MINUTES = 15;
export const DEFAULT_MAX_BLOCK_MINUTES = 90;

// ---------------------------------------------------------------------------
// Chunking (AT15)
// ---------------------------------------------------------------------------

/**
 * Split `remaining` minutes into sessions that respect [min,max].
 * Greedy from the front so a 2h task with min 30 / max 45 becomes 45+45+30 exactly (AT15),
 * and a task that would otherwise strand a remainder below `min` absorbs it into the current
 * session instead.
 */
export function planChunks(
  remainingMinutes: number,
  minBlockMinutes: number,
  maxBlockMinutes: number,
  splittable: boolean,
): number[] {
  const remaining = Math.round(remainingMinutes);
  if (remaining <= 0) return [];
  const min = Math.max(1, Math.round(minBlockMinutes));
  const max = Math.max(min, Math.round(maxBlockMinutes));
  if (!splittable || remaining <= max) return [remaining];

  const chunks: number[] = [];
  let left = remaining;
  while (left > 0) {
    if (left <= max) {
      if (left < min && chunks.length > 0) {
        // Absorb a too-small tail into the previous session when that stays within max.
        const previous = chunks[chunks.length - 1];
        if (previous + left <= max) {
          chunks[chunks.length - 1] = previous + left;
          left = 0;
          break;
        }
      }
      chunks.push(left);
      left = 0;
      break;
    }
    let take = max;
    if (left - take < min) {
      // Keep the tail viable: leave at least `min` for the next session.
      take = left - min;
      if (take < min) take = left; // cannot satisfy both; single session is the honest fallback
    }
    chunks.push(take);
    left -= take;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Ordering — explicit total order, no ambient tie-breaks (AT17)
// ---------------------------------------------------------------------------

function byId(a: SchedulerTask, b: SchedulerTask): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byAgeThenId(a: SchedulerTask, b: SchedulerTask): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return byId(a, b);
}

export function rankTasks(tasks: SchedulerTask[], strategy: Strategy): SchedulerTask[] {
  const list = [...tasks];
  switch (strategy) {
    case "deadline":
      // Due soonest first; ties broken by priority, then age, then id (stable, AT17).
      return list.sort((a, b) => {
        const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
        const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return byAgeThenId(a, b);
      });
    case "balanced":
      return list.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
        const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return byAgeThenId(a, b);
      });
    case "minimal":
    default:
      // Least disruption: keep capture order so existing plans stay where they are (S5, S6).
      return list.sort(byAgeThenId);
  }
}

// ---------------------------------------------------------------------------
// Validation (H1–H11)
// ---------------------------------------------------------------------------

export function validatePlacements(placements: Placement[], input: SchedulerInput): Violation[] {
  const violations: Violation[] = [];
  const byTask = new Map<string, SchedulerTask>();
  for (const task of input.tasks) byTask.set(task.id, task);

  const ordered = [...placements].sort((a, b) => (a.start === b.start ? a.taskId.localeCompare(b.taskId) : a.start - b.start));

  for (const placement of ordered) {
    const range: Range = { start: placement.start, end: placement.end };
    const task = byTask.get(placement.taskId);
    if (!task) {
      violations.push({ code: "UNKNOWN_TASK", message: `Unknown task ${placement.taskId}`, taskId: placement.taskId });
      continue;
    }

    if (range.end <= range.start) {
      violations.push({
        code: "NON_POSITIVE_DURATION",
        message: `Placement for ${placement.taskId} has no positive duration`,
        taskId: placement.taskId,
        range,
      });
      continue;
    }

    for (const busy of input.busy) {
      if (!rangesOverlap(range, busy)) continue;
      const code: ViolationCode = busy.locked && !input.allowLockedOverride ? "OVERRIDE_NOT_PERMITTED" : "OVERLAPS_BUSY";
      violations.push({
        code,
        message: `${busy.locked ? "Locked/fixed" : "Busy"} interval "${busy.label}" overlaps the proposed session`,
        taskId: placement.taskId,
        range,
      });
      break;
    }

    const fitsWindow = input.workingWindows.some((window) => window.start <= range.start && range.end <= window.end);
    if (!fitsWindow) {
      violations.push({
        code: "OUTSIDE_WORKING_HOURS",
        message: `Placement for ${placement.taskId} falls outside working windows (H5)`,
        taskId: placement.taskId,
        range,
      });
    }

    if (task.dueAt !== null && range.end > task.dueAt) {
      violations.push({
        code: "PAST_HARD_DUE",
        message: `Placement for ${placement.taskId} ends after its hard deadline (H9)`,
        taskId: placement.taskId,
        range,
      });
    }
  }

  // A task may legitimately be split into several sessions (spec E2.1); only sessions that collide
  // with each other are invalid.
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const left = ordered[i];
      const right = ordered[j];
      if (!left || !right || !rangesOverlap(left, right)) continue;
      const sameTask = left.taskId === right.taskId;
      violations.push({
        code: sameTask ? "DUPLICATE_TASK" : "OVERLAPS_BUSY",
        message: sameTask
          ? `Two sessions proposed for task ${right.taskId} overlap each other`
          : "Two proposed sessions overlap each other",
        taskId: right.taskId,
        range: { start: right.start, end: right.end },
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

interface WindowCandidate {
  window: Range;
  soft: boolean;
}

function freeWindows(input: SchedulerInput): { hard: Range[]; soft: Range[] } {
  const releaseable = new Set(input.releaseableBlockIds ?? []);
  const retainedBusy = input.busy.filter((busy) => !(busy.kind === "block" && releaseable.has(busy.id)));
  const allFree = subtractRanges(input.workingWindows, retainedBusy);
  const soft = intersectRanges(allFree, input.softRest);
  const hard = subtractRanges(allFree, input.softRest);
  return { hard: mergeRanges(hard), soft: mergeRanges(soft) };
}

function latestStartFor(window: Range, chunkMinutes: number): number {
  return window.end - chunkMinutes * MINUTE_MS;
}

/**
 * Sessions begin on 15-minute boundaries whenever the window still allows it, so replanning the
 * same request a moment later lands on exactly the same clock time instead of drifting by seconds
 * (AT18 — "replan several times with the same input must not oscillate"). A tight window falls
 * back to the raw earliest start rather than becoming infeasible.
 */
const START_STEP_MS = 15 * MINUTE_MS;

function alignedStart(raw: number, chunkMs: number, window: Range, latestEnd: Instant | null): Instant {
  const aligned = Math.ceil(raw / START_STEP_MS) * START_STEP_MS;
  if (aligned === raw) return raw;
  if (aligned + chunkMs > window.end) return raw;
  if (latestEnd !== null && aligned + chunkMs > latestEnd) return raw;
  return aligned;
}

interface PickOptions {
  earliestStart: Instant;
  latestEnd: Instant | null;
  preferSpread: boolean;
  placed: Placement[];
}

function pickWindow(candidates: WindowCandidate[], chunkMinutes: number, options: PickOptions): WindowCandidate | null {
  const chunkMs = chunkMinutes * MINUTE_MS;
  const startOf = (candidate: WindowCandidate): number =>
    alignedStart(Math.max(candidate.window.start, options.earliestStart), chunkMs, candidate.window, options.latestEnd);
  const eligible = candidates.filter((candidate) => {
    const start = startOf(candidate);
    if (start + chunkMs > candidate.window.end) return false;
    if (options.latestEnd !== null && start + chunkMs > options.latestEnd) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  if (!options.preferSpread) {
    eligible.sort((a, b) => {
      const aStart = startOf(a);
      const bStart = startOf(b);
      if (aStart !== bStart) return aStart - bStart;
      if (a.window.end !== b.window.end) return a.window.end - b.window.end;
      return a.soft === b.soft ? 0 : a.soft ? 1 : -1;
    });
    return eligible[0] ?? null;
  }

  // Balanced strategy: spread sessions apart (S7 anti-clustering), stable tie-break by start.
  let best: WindowCandidate | null = null;
  let bestDistance = -1;
  let bestStart = Number.POSITIVE_INFINITY;
  for (const candidate of eligible) {
    const start = startOf(candidate);
    const mid = start + chunkMs / 2;
    let distance = Number.POSITIVE_INFINITY;
    for (const placed of options.placed) {
      const placedMid = (placed.start + placed.end) / 2;
      distance = Math.min(distance, Math.abs(mid - placedMid));
    }
    // Distance first, then the earlier start, so equal distances stay deterministic.
    if (distance > bestDistance || (distance === bestDistance && start < bestStart)) {
      bestDistance = distance;
      bestStart = start;
      best = candidate;
    }
  }
  return best;
}

function removeFrom(candidates: WindowCandidate[], chosen: WindowCandidate, start: Instant, chunkMinutes: number): WindowCandidate[] {
  const end = start + chunkMinutes * MINUTE_MS;
  const out: WindowCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate !== chosen) {
      out.push(candidate);
      continue;
    }
    if (candidate.window.start < start) out.push({ window: { start: candidate.window.start, end: start }, soft: candidate.soft });
    if (end < candidate.window.end) out.push({ window: { start: end, end: candidate.window.end }, soft: candidate.soft });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoring & ids
// ---------------------------------------------------------------------------

function scoreMetrics(metrics: ProposalMetrics): number {
  // Hard-filtered first: every surviving candidate is feasible, so this only ranks soft
  // objectives (S1–S9). Weights are the MVP "Balanced" preset (F4).
  return (
    -metrics.deadlineRisk * 100 +
    metrics.priorityCoverage * 10 -
    metrics.restPenaltyMinutes * 0.05 -
    metrics.fragmentation * 2 -
    metrics.changeCount * 0.25
  );
}

export function proposalSignature(proposal: Omit<Proposal, "id" | "score">): string {
  const placements = [...proposal.placements]
    .sort((a, b) => (a.start === b.start ? a.taskId.localeCompare(b.taskId) : a.start - b.start))
    .map((placement) => `${placement.taskId}@${placement.start}-${placement.end}`)
    .join("|");
  const releases = [...proposal.releases]
    .sort((a, b) => (a.blockId < b.blockId ? -1 : 1))
    .map((release) => release.blockId)
    .join("|");
  return `${proposal.strategy}~${placements}~${releases}~${proposal.unplaced.map((item) => `${item.taskId}:${item.minutes}`).join(",")}`;
}

function hashId(signature: string): string {
  // FNV-1a: small, dependency free and stable across runs (AT18).
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i += 1) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `prp_${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Stable identity of what a proposal *says* (AT18). Every stored proposal gets its own record id,
 * but two plans with the same strategy, sessions and releases report the same content id, so
 * "replan" visibly does not oscillate: the user can see the plan is unchanged.
 */
export function proposalContentId(payload: {
  strategy: string;
  placements: { taskId: string; startAt: number; endAt: number }[];
  releaseBlockIds: string[];
}): string {
  const placements = [...payload.placements]
    .sort((a, b) => (a.startAt === b.startAt ? a.taskId.localeCompare(b.taskId) : a.startAt - b.startAt))
    .map((placement) => `${placement.taskId}@${placement.startAt}-${placement.endAt}`)
    .join("|");
  const releases = [...payload.releaseBlockIds].sort().join("|");
  return hashId(`${payload.strategy}~${placements}~${releases}~`);
}

// ---------------------------------------------------------------------------
// Feasibility
// ---------------------------------------------------------------------------

function describeUserOptions(): string[] {
  return [
    "Reduce scope: lower the remaining effort or split the task across a later horizon.",
    "Move the deadline manually (a separate, explicitly confirmed action).",
    "Lower the habit cadence or pause a habit for this period.",
    "Accept the risk: keep the plan and track it in Activity — APE will keep flagging it.",
    "Free time: release or shorten a flexible block you own.",
  ];
}

function computeFeasibility(input: SchedulerInput, free: Range[]): Feasibility {
  const requiredMinutes = input.tasks.reduce((sum, task) => sum + Math.max(0, task.remainingMinutes), 0);
  const freeMinutes = totalMinutes(free);
  const shortfalls: Shortfall[] = [];

  for (const task of input.tasks) {
    if (task.remainingMinutes <= 0) continue;
    const dueAt = task.dueAt;
    // REV-009: only the part of a window that lies *before* the deadline counts as capacity — a
    // window that merely starts five minutes before the deadline must not be counted in full.
    const usable =
      dueAt === null
        ? free
        : free
            .filter((range) => range.start < dueAt)
            .map((range) => ({ start: range.start, end: Math.min(range.end, dueAt) }));
    const available = totalMinutes(usable);
    if (available < task.remainingMinutes) {
      const needsSingleWindow = !task.splittable;
      const longest = usable.reduce((max, range) => Math.max(max, durationMinutes(range)), 0);
      const reason = needsSingleWindow
        ? longest < task.remainingMinutes
          ? `No single free window is long enough for a non-split session (${longest} min available, ${task.remainingMinutes} min needed).`
          : `Only ${available} free minutes before the deadline.`
        : `Only ${available} free minutes before the deadline.`;
      shortfalls.push({
        taskId: task.id,
        title: task.title,
        minutes: task.remainingMinutes - available,
        reason,
      });
    }
  }

  const shortfallMinutes = shortfalls.reduce((sum, item) => sum + item.minutes, 0);
  const globalShortfall = Math.max(0, requiredMinutes - freeMinutes);
  // REV-009/AT26: every infeasible plan must explain itself. When each task fits on its own but the
  // whole backlog does not fit, no per-task entry is produced above — synthesise one so the UI can
  // never show "infeasible" with an empty reason list.
  if (globalShortfall > 0 && shortfalls.length === 0) {
    const culprit = input.tasks.find((task) => task.remainingMinutes > 0);
    if (culprit) {
      shortfalls.push({
        taskId: culprit.id,
        title: culprit.title,
        minutes: globalShortfall,
        reason: `Not enough free time overall: ${requiredMinutes} min of work vs ${freeMinutes} min free in the horizon.`,
      });
    }
  }
  const feasible = shortfallMinutes <= 0 && requiredMinutes <= freeMinutes;
  return {
    feasible,
    requiredMinutes,
    freeMinutes,
    shortfallMinutes: Math.max(shortfallMinutes, globalShortfall),
    shortfalls,
    userOptions: feasible ? [] : describeUserOptions(),
  };
}

// ---------------------------------------------------------------------------
// Proposal generation
// ---------------------------------------------------------------------------

function buildForStrategy(
  strategy: Strategy,
  input: SchedulerInput,
  freeSeed: { hard: Range[]; soft: Range[] },
  released: ReleasedBlock[],
): Omit<Proposal, "id" | "score"> {
  const ranked = rankTasks(input.tasks, strategy);
  let candidates: WindowCandidate[] = [
    ...freeSeed.hard.map((window) => ({ window, soft: false })),
    ...freeSeed.soft.map((window) => ({ window, soft: true })),
  ];
  const placements: Placement[] = [];
  const unplaced: { taskId: string; minutes: number; reason: string }[] = [];
  const preferSpread = strategy === "balanced";
  const releaseable = new Set(input.releaseableBlockIds ?? []);

  for (const task of ranked) {
    if (task.remainingMinutes <= 0) continue;
    const chunks = planChunks(task.remainingMinutes, task.minBlockMinutes, task.maxBlockMinutes, task.splittable);
    for (const chunk of chunks) {
      const options: PickOptions = {
        earliestStart: Math.max(task.earliestStart, input.now),
        latestEnd: task.dueAt,
        preferSpread,
        placed: placements,
      };
      // Prefer genuine free time; fall back to soft rest only when nothing else fits (H5 soft).
      let chosen = pickWindow(candidates.filter((candidate) => !candidate.soft), chunk, options);
      if (chosen) {
        const start = alignedStart(
          Math.max(chosen.window.start, options.earliestStart),
          chunk * MINUTE_MS,
          chosen.window,
          options.latestEnd,
        );
        placements.push({ taskId: task.id, start, end: start + chunk * MINUTE_MS });
        candidates = removeFrom(candidates, chosen, start, chunk);
        continue;
      }
      chosen = pickWindow(candidates, chunk, options);
      if (chosen) {
        const start = alignedStart(
          Math.max(chosen.window.start, options.earliestStart),
          chunk * MINUTE_MS,
          chosen.window,
          options.latestEnd,
        );
        placements.push({ taskId: task.id, start, end: start + chunk * MINUTE_MS });
        candidates = removeFrom(candidates, chosen, start, chunk);
        continue;
      }
      const why =
        task.dueAt !== null && task.dueAt <= input.now
          ? "The hard deadline has already passed; the remaining work cannot be placed (H9)."
          : `No free window of ${chunk} min before the deadline.`;
      unplaced.push({ taskId: task.id, minutes: chunk, reason: why });
    }
  }

  const placedMinutes = new Map<string, number>();
  let restPenaltyMinutes = 0;
  const softRanges = freeSeed.soft;
  for (const placement of placements) {
    const current = placedMinutes.get(placement.taskId) ?? 0;
    placedMinutes.set(placement.taskId, current + (placement.end - placement.start) / MINUTE_MS);
    const inSoft = softRanges.some((range) => range.start <= placement.start && placement.end <= range.end);
    if (inSoft) restPenaltyMinutes += (placement.end - placement.start) / MINUTE_MS;
  }

  const perTask = new Map<string, number>();
  for (const item of unplaced) perTask.set(item.taskId, (perTask.get(item.taskId) ?? 0) + item.minutes);

  const deadlineRisk = input.tasks.reduce((sum, task) => {
    const missing = perTask.get(task.id) ?? 0;
    if (missing <= 0) return sum;
    const pressure = task.dueAt !== null ? 2 : 1;
    return sum + missing * pressure;
  }, 0);

  const weightedTotal = input.tasks.reduce((sum, task) => sum + task.priority * Math.max(task.remainingMinutes, 0), 0);
  const weightedPlaced = input.tasks.reduce(
    (sum, task) => sum + task.priority * Math.min(placedMinutes.get(task.id) ?? 0, Math.max(task.remainingMinutes, 0)),
    0,
  );

  const tasksWithSessions = new Set(placements.map((placement) => placement.taskId));
  const metrics: ProposalMetrics = {
    deadlineRisk,
    priorityCoverage: weightedTotal > 0 ? weightedPlaced / weightedTotal : 1,
    restPenaltyMinutes,
    fragmentation: Math.max(0, placements.length - tasksWithSessions.size),
    changeCount: placements.length + released.length,
  };

  const reasons: string[] = [];
  switch (strategy) {
    case "minimal":
      // REV-022: never claim "untouched" in the same breath as a release list — the copy has to
      // match what the card shows below it.
      reasons.push(
        released.length === 0
          ? "Minimal Disruption: earliest fitting windows in capture order, existing plan untouched."
          : "Minimal Disruption: earliest fitting windows in capture order.",
      );
      break;
    case "deadline":
      reasons.push("Deadline Priority: earliest deadline first, higher priority breaks ties.");
      break;
    case "balanced":
      reasons.push("Balanced: highest priority first, sessions spread across the horizon to limit fragmentation.");
      break;
  }
  if (released.length > 0) reasons.push(`Releases ${released.length} existing session(s) for the affected task.`);
  if (unplaced.length > 0) reasons.push(`${unplaced.length} session(s) could not be placed without breaking a hard constraint.`);
  if (restPenaltyMinutes > 0) reasons.push(`Uses ${restPenaltyMinutes} min of soft rest time as a last resort.`);

  const base = {
    strategy,
    placements,
    releases: released,
    unplaced,
    metrics,
    violations: validatePlacements(
      placements.map((placement) => ({ ...placement })),
      {
        ...input,
        // Recovery releases this task's future sessions first, so the world that gets validated is
        // the world after those releases (spec F8).
        busy: input.busy.filter((busy) => !(busy.kind === "block" && releaseable.has(busy.id))),
        tasks: input.tasks,
      },
    ),
    reasons,
  };
  return base;
}

/**
 * Build up to three genuinely diverse proposals (F5.4). Returns an empty proposal list when
 * nothing satisfies the hard constraints, together with an explicit shortfall report (F5.5).
 */
export function generateProposals(input: SchedulerInput): PlanResult {
  const releaseable = new Set(input.releaseableBlockIds ?? []);
  const released: ReleasedBlock[] = input.busy
    .filter((busy) => busy.kind === "block" && releaseable.has(busy.id))
    .map((busy) => ({ blockId: busy.id, taskId: busy.label, start: busy.start, end: busy.end }));

  const free = freeWindows(input);
  const feasibility = computeFeasibility(input, [...free.hard, ...free.soft]);

  const proposals: Proposal[] = [];
  const seen = new Set<string>();
  for (const strategy of STRATEGIES) {
    const draft = buildForStrategy(strategy, input, free, released);
    const signature = proposalSignature(draft);
    if (seen.has(signature)) continue;
    seen.add(signature);
    if (draft.unplaced.length > 0 && draft.placements.length === 0) continue; // nothing usable
    proposals.push({ ...draft, id: hashId(signature), score: scoreMetrics(draft.metrics) });
  }

  proposals.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.strategy !== b.strategy) return a.strategy < b.strategy ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const valid = proposals.filter((proposal) => proposal.violations.length === 0 && proposal.unplaced.length === 0);
  return {
    proposals: valid.slice(0, 3),
    feasibility: {
      ...feasibility,
      feasible: feasibility.feasible && valid.length > 0,
      shortfallMinutes:
        feasibility.shortfallMinutes > 0
          ? feasibility.shortfallMinutes
          : valid.length === 0
            ? input.tasks.reduce((sum, task) => sum + Math.max(0, task.remainingMinutes), 0)
            : 0,
    },
  };
}

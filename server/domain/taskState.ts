/**
 * Task execution rules (spec E3 state machine, F7 late start, AT21–AT23).
 *
 * Flags are observations, never state transitions: reaching the end of a block, or passing a
 * deadline, must not silently complete or cancel a task (spec E3).
 */

import { type Instant, MINUTE_MS } from "./time";

export type TaskStatus = "not_started" | "in_progress" | "paused" | "completed" | "cancelled";

const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  not_started: ["in_progress", "completed", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export interface TaskFlagsInput {
  now: Instant;
  status: TaskStatus;
  dueAt: Instant | null;
  estimatedMinutes: number;
  remainingMinutes: number;
  actualMinutes: number;
  /** First recorded start of the current/last planned session, if any. */
  blockStart: Instant | null;
  blockEnd: Instant | null;
  /** Grace before a planned start counts as late (spec F7.1). */
  graceMinutes: number;
}

export interface TaskFlags {
  late_start: boolean;
  overdue: boolean;
  overtime: boolean;
  at_risk: boolean;
}

export function computeTaskFlags(input: TaskFlagsInput): TaskFlags {
  const late_start =
    input.blockStart !== null && input.blockEnd !== null && input.status !== "completed" && input.now > input.blockStart + input.graceMinutes * MINUTE_MS && input.now < input.blockEnd + input.graceMinutes * MINUTE_MS;

  const overdue = input.dueAt !== null && input.now > input.dueAt && input.status !== "completed" && input.status !== "cancelled";
  const overtime = input.estimatedMinutes > 0 && input.actualMinutes > input.estimatedMinutes;
  const at_risk =
    input.dueAt !== null &&
    input.status !== "completed" &&
    input.status !== "cancelled" &&
    input.remainingMinutes > 0 &&
    input.dueAt - input.now < 24 * 60 * MINUTE_MS;

  return { late_start, overdue, overtime, at_risk };
}

/**
 * Remaining effort after a work log (spec E4).
 * The user answer wins: a manual backfill asks "how much is left" instead of mechanically
 * subtracting actual from estimate, because the estimate itself may have been wrong.
 */
export function remainingAfterLog(previousRemaining: number, loggedMinutes: number, answeredRemaining: number | null): number {
  if (answeredRemaining !== null && answeredRemaining >= 0) return Math.round(answeredRemaining);
  return Math.max(0, Math.round(previousRemaining - Math.max(0, loggedMinutes)));
}

/** Guard against double counting when a timer entry and a manual entry describe the same work (H2). */
export function isDuplicateLog(existingMinutesAtSameInstant: number, loggedMinutes: number): boolean {
  return existingMinutesAtSameInstant > 0 && loggedMinutes <= 0;
}

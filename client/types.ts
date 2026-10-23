/**
 * Client-side mirror of the server's JSON contract.
 *
 * Shapes are transcribed from `server/store.ts` and `server/routes/*.ts`; keep them in sync when
 * the server changes. Only fields the UI actually reads are declared where a looser shape would
 * hide a mistake.
 */

export interface AppSettings {
  workingHours: { start: string; end: string; days: number[] };
  softRest: { enabled: boolean; start: string; end: string };
  graceMinutes: number;
}

export interface User {
  id: string;
  username: string;
  timezone: string;
  settings: AppSettings;
  createdAt: number;
}

export type TaskStatus = "not_started" | "in_progress" | "paused" | "completed" | "cancelled";

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: number;
  dueAt: number | null;
  earliestStart: number | null;
  estimatedMinutes: number;
  remainingMinutes: number;
  goalId: string | null;
  parentId: string | null;
  position: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  splittable: boolean;
  locked: boolean;
  revision: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Observations only — the server never flips task state because of a flag. */
export interface TaskFlags {
  late_start: boolean;
  overdue: boolean;
  overtime: boolean;
  at_risk: boolean;
}

export interface WorkSession {
  id: string;
  taskId: string;
  blockId: string | null;
  startedAt: number;
  endedAt: number | null;
  minutes: number;
  source: "timer" | "manual";
  note: string;
  remainingAfter: number | null;
  createdAt: number;
}

export type EventKind = "fixed" | "rest_soft" | "rest_protected";

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
  kind: EventKind;
  locked: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type BlockStatus = "planned" | "active" | "done" | "released";

export interface Block {
  id: string;
  taskId: string;
  startAt: number;
  endAt: number;
  status: BlockStatus;
  locked: boolean;
  source: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

/** Conflict entries returned by the calendar endpoints (never applied silently). */
export interface OverlapFinding {
  kind: "event" | "block" | "rest_protected";
  id: string;
  label: string;
  locked: boolean;
  start: number;
  end: number;
}

export interface BlockConflictDetails {
  conflicts?: OverlapFinding[];
  canOverride?: boolean;
}

export interface CalendarPayload {
  range: { from: number; to: number };
  events: CalendarEvent[];
  blocks: Block[];
  workingWindows: TimeRange[];
  softRest: TimeRange[];
  free: TimeRange[];
  freeMinutes: number;
}

export interface Habit {
  id: string;
  title: string;
  goalId: string | null;
  cadence: "daily" | "weekly";
  targetCount: number;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  paused: boolean;
  pausePolicy: "exclude" | "count";
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface HabitPeriod {
  periodStart: number;
  periodEnd: number;
  done: number;
  target: number;
  paused: boolean;
  attainment: number;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  occurredAt: number;
  minutes: number;
  source: string;
  createdAt: number;
}

export interface HabitHistoryPayload {
  habit: Habit;
  checkins: HabitCheckin[];
  period: HabitPeriod;
  sessions: WorkSession[];
  sessionCount: number;
  sessionMinutes: number;
  scope: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  metricType: "count" | "milestone";
  target: number;
  current: number;
  dueAt: number | null;
  status: "active" | "done" | "paused";
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  position: number;
  status: "open" | "done";
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoalView {
  goal: Goal;
  milestones: Milestone[];
  tasks: { total: number; completed: number; open: number };
  effort: { remainingMinutes: number; plannedMinutes: number };
  /** `ratio` is null when the data cannot support a figure — never invent one. */
  progress: { unitLabel: string; ratio: number | null; projected: string };
  atRisk: boolean;
}

/** PATCH /api/goals/:id adds compatibility warnings to the standard envelope. */
export type GoalPatchResponse = GoalView & { warnings: string[] };

export interface BreakdownDraft {
  title: string;
  estimatedMinutes: number;
  assumed: boolean;
  assumption: string;
}

export interface BreakdownResponse {
  drafts: BreakdownDraft[];
  existingTaskCount: number;
  note: string;
}

export interface TodayPayload {
  now: number;
  day: TimeRange;
  events: CalendarEvent[];
  blocks: Block[];
  nextAction: { kind: "block"; block: Block; task: Task | null } | { kind: "task"; block: null; task: Task } | null;
  atRisk: { task: Task; reason: string }[];
  habits: { habit: Habit; period: HabitPeriod }[];
  reflection: { plannedMinutes: number; actualMinutes: number; sessionCount: number };
  empty: { tasks: boolean; events: boolean };
}

export interface ProposalMetrics {
  deadlineRisk: number;
  priorityCoverage: number;
  restPenaltyMinutes: number;
  fragmentation: number;
  changeCount: number;
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
  userOptions: string[];
}

export interface ProposalImpact {
  movedBlocks: number;
  addedBlocks: number;
  tasksTouched: string[];
  atRiskTaskIds: string[];
}

export type ProposalStatus = "pending" | "committed" | "dismissed" | "expired";

export interface ProposalView {
  id: string;
  contentId: string;
  strategy: string;
  kind: "schedule" | "recovery";
  status: ProposalStatus;
  trigger: string;
  createdAt: number;
  expiresAt: number;
  placements: { taskId: string; title: string; startAt: number; endAt: number }[];
  releases: string[];
  reasons: string[];
  metrics: ProposalMetrics;
  impact: ProposalImpact;
  feasibility: Feasibility;
}

export interface CommitResponse {
  proposalId: string;
  applied: string[];
  released: string[];
  auditId: string;
  undoable: boolean;
  revisions: Record<string, number>;
  replayed?: boolean;
}

export interface UndoPreview {
  available: boolean;
  reason: string;
  summary: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string;
  proposalId: string | null;
  undoable: boolean;
  undoneAt: number | null;
  createdAt: number;
}

export interface ActivityEntry extends AuditEntry {
  preview: UndoPreview;
}

export interface UndoConflict {
  entity: string;
  reason: string;
  id: string;
}

export interface UndoResponse {
  outcome: { ok: boolean; code: string; message: string; conflicts?: UndoConflict[]; restored?: string[] };
  entries?: AuditEntry[];
}

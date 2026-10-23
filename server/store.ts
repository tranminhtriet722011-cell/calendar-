/**
 * Repository layer. Every query is owner-scoped by `user_id` (spec J1, AT42): a resource belonging
 * to another user is reported as "not found" so identifiers cannot be probed for existence.
 *
 * All mutations bump `revision` and append an audit event; nothing is hard-deleted (spec E2.7).
 */

import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { DB } from "./db";
import { conflict, notFound } from "./errors";
import { canTransition, type TaskStatus } from "./domain/taskState";
import type { BusyBlock, SchedulerTask } from "./domain/scheduler";
import { dayKey, dayKeysBetween, dayKeyToInstant, parseDayKey, shiftDayKey, zonedTimeToInstant, minutesSinceMidnight } from "./domain/time";

type Param = string | number | null | Uint8Array;

function all<T>(db: DB, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}
function one<T>(db: DB, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}
function run(db: DB, sql: string, ...params: Param[]): void {
  db.prepare(sql).run(...params);
}
export const newId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const now = (): number => Date.now();
const bool = (value: unknown): boolean => Number(value) === 1;
const num = (value: unknown): number => Number(value);
const nullableNum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Settings & identity
// ---------------------------------------------------------------------------

export interface AppSettings {
  workingHours: { start: string; end: string; days: number[] };
  softRest: { enabled: boolean; start: string; end: string };
  graceMinutes: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workingHours: { start: "08:00", end: "22:00", days: [0, 1, 2, 3, 4, 5, 6] },
  softRest: { enabled: true, start: "12:00", end: "13:00" },
  graceMinutes: 10,
};

export interface User {
  id: string;
  username: string;
  timezone: string;
  settings: AppSettings;
  createdAt: number;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  timezone: string;
  settings: string;
  created_at: number;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    timezone: row.timezone,
    settings: { ...DEFAULT_SETTINGS, ...parseJson<Partial<AppSettings>>(row.settings, {}) },
    createdAt: num(row.created_at),
  };
}

export function createUser(db: DB, username: string, passwordHash: string, timezone: string): User {
  const id = newId("usr");
  const created = now();
  run(
    db,
    "INSERT INTO users (id, username, password_hash, timezone, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    username,
    passwordHash,
    timezone,
    JSON.stringify(DEFAULT_SETTINGS),
    created,
  );
  return { id, username, timezone, settings: DEFAULT_SETTINGS, createdAt: created };
}

export function findUserByUsername(db: DB, username: string): (User & { passwordHash: string }) | undefined {
  const row = one<UserRow>(db, "SELECT * FROM users WHERE username = ?", username);
  return row ? { ...mapUser(row), passwordHash: row.password_hash } : undefined;
}

export function findUserById(db: DB, id: string): User | undefined {
  const row = one<UserRow>(db, "SELECT * FROM users WHERE id = ?", id);
  return row ? mapUser(row) : undefined;
}

export function updateSettings(db: DB, userId: string, settings: AppSettings, timezone?: string): User {
  run(db, "UPDATE users SET settings = ?, timezone = COALESCE(?, timezone) WHERE id = ?", JSON.stringify(settings), timezone ?? null, userId);
  const user = findUserById(db, userId);
  if (!user) throw notFound("User not found.");
  return user;
}

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function createSession(db: DB, userId: string, ttlMs = 30 * 24 * 60 * 60 * 1000): string {
  const token = randomBytes(32).toString("base64url");
  run(
    db,
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    newId("ses"),
    userId,
    hashToken(token),
    now() + ttlMs,
    now(),
  );
  return token;
}

export function findUserByToken(db: DB, token: string): User | undefined {
  const row = one<{ user_id: string; expires_at: number }>(
    db,
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
    hashToken(token),
  );
  if (!row || num(row.expires_at) < now()) return undefined;
  return findUserById(db, row.user_id);
}

export function deleteSession(db: DB, token: string): void {
  run(db, "DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

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

interface TaskRow {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: number;
  due_at: number | null;
  earliest_start: number | null;
  estimated_minutes: number;
  remaining_minutes: number;
  goal_id: string | null;
  parent_id: string | null;
  position: number;
  min_block_minutes: number;
  max_block_minutes: number;
  splittable: number;
  locked: number;
  revision: number;
  archived: number;
  created_at: number;
  updated_at: number;
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as TaskStatus,
    priority: num(row.priority),
    dueAt: nullableNum(row.due_at),
    earliestStart: nullableNum(row.earliest_start),
    estimatedMinutes: num(row.estimated_minutes),
    remainingMinutes: num(row.remaining_minutes),
    goalId: row.goal_id,
    parentId: row.parent_id,
    position: num(row.position),
    minBlockMinutes: num(row.min_block_minutes),
    maxBlockMinutes: num(row.max_block_minutes),
    splittable: bool(row.splittable),
    locked: bool(row.locked),
    revision: num(row.revision),
    archived: bool(row.archived),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export interface TaskFilter {
  status?: string;
  goalId?: string;
  parentId?: string;
  includeArchived?: boolean;
}

export function listTasks(db: DB, userId: string, filter: TaskFilter = {}): Task[] {
  const clauses = ["user_id = ?"];
  const params: Param[] = [userId];
  if (!filter.includeArchived) clauses.push("archived = 0");
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.goalId) {
    clauses.push("goal_id = ?");
    params.push(filter.goalId);
  }
  if (filter.parentId) {
    clauses.push("parent_id = ?");
    params.push(filter.parentId);
  }
  const rows = all<TaskRow>(
    db,
    `SELECT * FROM tasks WHERE ${clauses.join(" AND ")} ORDER BY position ASC, created_at ASC, id ASC`,
    ...params,
  );
  return rows.map(mapTask);
}

export function getTask(db: DB, userId: string, id: string): Task | undefined {
  const row = one<TaskRow>(db, "SELECT * FROM tasks WHERE id = ? AND user_id = ?", id, userId);
  return row ? mapTask(row) : undefined;
}

/**
 * Owner-scoped existence check for reference fields (AT42). Unknown and foreign ids answer the
 * same way, so a write can never become an existence oracle, and a bad reference can never reach
 * a foreign-key error (which would surface as a 500).
 */
export function goalExists(db: DB, userId: string, id: string): boolean {
  const row = one<{ id: string }>(db, "SELECT id FROM goals WHERE id = ? AND user_id = ?", id, userId);
  return !!row;
}

export function requireTask(db: DB, userId: string, id: string): Task {
  const task = getTask(db, userId, id);
  if (!task) throw notFound("Task not found.");
  return task;
}

export interface NewTask {
  title: string;
  notes?: string;
  priority?: number;
  dueAt?: number | null;
  earliestStart?: number | null;
  estimatedMinutes?: number;
  remainingMinutes?: number;
  goalId?: string | null;
  parentId?: string | null;
  minBlockMinutes?: number;
  maxBlockMinutes?: number;
  splittable?: boolean;
  locked?: boolean;
}

export function createTask(db: DB, userId: string, input: NewTask): Task {
  const id = newId("tsk");
  const created = now();
  const estimated = Math.max(0, Math.round(input.estimatedMinutes ?? 0));
  const remaining = Math.max(0, Math.round(input.remainingMinutes ?? estimated));
  const position = num(one<{ n: number }>(db, "SELECT COALESCE(MAX(position), 0) + 1 AS n FROM tasks WHERE user_id = ?", userId)?.n ?? 1);
  run(
    db,
    `INSERT INTO tasks (id, user_id, title, notes, status, priority, due_at, earliest_start, estimated_minutes,
       remaining_minutes, goal_id, parent_id, position, min_block_minutes, max_block_minutes, splittable, locked,
       revision, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    id,
    userId,
    input.title,
    input.notes ?? "",
    clampPriority(input.priority),
    input.dueAt ?? null,
    input.earliestStart ?? null,
    estimated,
    remaining,
    input.goalId ?? null,
    input.parentId ?? null,
    position,
    input.minBlockMinutes ?? 15,
    input.maxBlockMinutes ?? 90,
    input.splittable === false ? 0 : 1,
    input.locked ? 1 : 0,
    created,
    created,
  );
  return requireTask(db, userId, id);
}

export function clampPriority(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

export interface TaskPatch {
  title?: string;
  notes?: string;
  status?: TaskStatus;
  priority?: number;
  dueAt?: number | null;
  earliestStart?: number | null;
  estimatedMinutes?: number;
  remainingMinutes?: number;
  goalId?: string | null;
  parentId?: string | null;
  position?: number;
  minBlockMinutes?: number;
  maxBlockMinutes?: number;
  splittable?: boolean;
  locked?: boolean;
}

const COLUMN_FOR: Record<string, string> = {
  title: "title",
  notes: "notes",
  status: "status",
  priority: "priority",
  dueAt: "due_at",
  earliestStart: "earliest_start",
  estimatedMinutes: "estimated_minutes",
  remainingMinutes: "remaining_minutes",
  goalId: "goal_id",
  parentId: "parent_id",
  position: "position",
  minBlockMinutes: "min_block_minutes",
  maxBlockMinutes: "max_block_minutes",
  splittable: "splittable",
  locked: "locked",
};

export interface MutationResult<T> {
  entity: T;
  changed: boolean;
}

export function updateTask(
  db: DB,
  userId: string,
  id: string,
  patch: TaskPatch,
  expectedRevision?: number,
  options: { actor?: "user" | "agent" | "system"; reason?: string } = {},
): MutationResult<Task> {
  const before = requireTask(db, userId, id);
  assertRevision(before.revision, expectedRevision, "Task");

  const sets: string[] = [];
  const params: Param[] = [];
  for (const [key, column] of Object.entries(COLUMN_FOR)) {
    if (!(key in patch)) continue;
    const value = (patch as Record<string, unknown>)[key];
    sets.push(`${column} = ?`);
    if (typeof value === "boolean") params.push(value ? 1 : 0);
    else if (key === "priority") params.push(clampPriority(value));
    else params.push((value as Param) ?? null);
  }
  if (sets.length === 0) return { entity: before, changed: false };

  sets.push("revision = revision + 1", "updated_at = ?");
  params.push(now(), id, userId);
  run(db, `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, ...params);
  const after = requireTask(db, userId, id);
  recordAudit(db, {
    userId,
    actor: options.actor ?? "user",
    action: "task.update",
    entityType: "task",
    entityId: id,
    before,
    after,
    reason: options.reason ?? "",
    undoable: true,
  });
  return { entity: after, changed: true };
}

/** Spec E3: transitions are validated, and a deadline never implies completion/cancellation. */
export function setTaskStatus(
  db: DB,
  userId: string,
  id: string,
  status: TaskStatus,
  expectedRevision?: number,
  options: { actor?: "user" | "agent" | "system"; reason?: string } = {},
): Task {
  const task = requireTask(db, userId, id);
  if (!canTransition(task.status, status)) {
    throw conflict(`Task cannot move from ${task.status} to ${status}.`);
  }
  return updateTask(db, userId, id, { status }, expectedRevision, options).entity;
}

export function archiveTask(db: DB, userId: string, id: string, expectedRevision?: number): void {
  const task = requireTask(db, userId, id);
  assertRevision(task.revision, expectedRevision, "Task");
  // Cascade the archive decision to the *whole* subtree (spec E2.7, review REV-A-03): grandchildren
  // must not stay open, keep counting towards open work and get planned for an "archived" branch.
  // Every cascaded row is captured in the audit entry, because undo must restore the whole subtree —
  // a parent that returns while any descendant stays archived reads as data loss (review REV-011).
  const subtreeBefore = all<TaskRow>(
    db,
    `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM tasks WHERE parent_id = ? AND user_id = ?
       UNION
       SELECT t.id FROM tasks t JOIN descendants d ON t.parent_id = d.id WHERE t.user_id = ?
     )
     SELECT * FROM tasks WHERE id IN (SELECT id FROM descendants) AND user_id = ? ORDER BY id ASC`,
    id,
    userId,
    userId,
    userId,
  ).map(mapTask);
  run(db, "UPDATE tasks SET archived = 1, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?", now(), id, userId);
  for (const child of subtreeBefore) {
    run(db, "UPDATE tasks SET archived = 1, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?", now(), child.id, userId);
  }
  const childrenAfter = subtreeBefore
    .map((child) => getTask(db, userId, child.id))
    .filter((child): child is Task => child !== undefined);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "task.archive",
    entityType: "task",
    entityId: id,
    before: { task, children: subtreeBefore },
    after: { task: requireTask(db, userId, id), children: childrenAfter },
    reason: "Archived with restore available in Activity",
    undoable: true,
  });
}

function assertRevision(current: number, expected: number | undefined, label: string): void {
  if (expected === undefined) return;
  if (Number(expected) !== current) {
    throw conflict(`${label} changed since you loaded it. Refresh to see the current version.`, {
      currentRevision: current,
      expectedRevision: expected,
    });
  }
}

export function toSchedulerTask(task: Task): SchedulerTask {
  return {
    id: task.id,
    title: task.title,
    remainingMinutes: task.remainingMinutes,
    minBlockMinutes: task.minBlockMinutes,
    maxBlockMinutes: task.maxBlockMinutes,
    splittable: task.splittable,
    priority: task.priority,
    dueAt: task.dueAt,
    earliestStart: task.earliestStart ?? task.createdAt,
    createdAt: task.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Calendar events & time blocks
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
  kind: "fixed" | "rest_protected" | "rest_soft";
  locked: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

interface EventRow {
  id: string;
  title: string;
  start_at: number;
  end_at: number;
  kind: string;
  locked: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

function mapEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startAt: num(row.start_at),
    endAt: num(row.end_at),
    kind: row.kind as CalendarEvent["kind"],
    locked: bool(row.locked),
    revision: num(row.revision),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function listEvents(db: DB, userId: string, from: number, to: number): CalendarEvent[] {
  return all<EventRow>(
    db,
    "SELECT * FROM events WHERE user_id = ? AND end_at >= ? AND start_at <= ? ORDER BY start_at ASC, id ASC",
    userId,
    from,
    to,
  ).map(mapEvent);
}

export function getEvent(db: DB, userId: string, id: string): CalendarEvent | undefined {
  const row = one<EventRow>(db, "SELECT * FROM events WHERE id = ? AND user_id = ?", id, userId);
  return row ? mapEvent(row) : undefined;
}

export function requireEvent(db: DB, userId: string, id: string): CalendarEvent {
  const event = getEvent(db, userId, id);
  if (!event) throw notFound("Event not found.");
  return event;
}

export interface NewEvent {
  title: string;
  startAt: number;
  endAt: number;
  kind?: CalendarEvent["kind"];
  locked?: boolean;
}

export function createEvent(db: DB, userId: string, input: NewEvent): CalendarEvent {
  if (input.endAt <= input.startAt) throw conflict("An event must end after it starts.");
  const id = newId("evt");
  const created = now();
  run(
    db,
    "INSERT INTO events (id, user_id, title, start_at, end_at, kind, locked, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    id,
    userId,
    input.title,
    input.startAt,
    input.endAt,
    input.kind ?? "fixed",
    input.locked === false ? 0 : 1,
    created,
    created,
  );
  recordAudit(db, {
    userId,
    actor: "user",
    action: "event.create",
    entityType: "event",
    entityId: id,
    before: null,
    after: requireEvent(db, userId, id),
    reason: "",
    undoable: true,
  });
  return requireEvent(db, userId, id);
}

export function updateEvent(
  db: DB,
  userId: string,
  id: string,
  patch: { title?: string; startAt?: number; endAt?: number; kind?: CalendarEvent["kind"]; locked?: boolean },
  expectedRevision?: number,
): CalendarEvent {
  const before = requireEvent(db, userId, id);
  assertRevision(before.revision, expectedRevision, "Event");
  const startAt = patch.startAt ?? before.startAt;
  const endAt = patch.endAt ?? before.endAt;
  if (endAt <= startAt) throw conflict("An event must end after it starts.");
  run(
    db,
    "UPDATE events SET title = ?, start_at = ?, end_at = ?, kind = ?, locked = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?",
    patch.title ?? before.title,
    startAt,
    endAt,
    patch.kind ?? before.kind,
    (patch.locked ?? before.locked) ? 1 : 0,
    now(),
    id,
    userId,
  );
  const after = requireEvent(db, userId, id);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "event.update",
    entityType: "event",
    entityId: id,
    before,
    after,
    reason: "",
    undoable: true,
  });
  return after;
}

export function deleteEvent(db: DB, userId: string, id: string): void {
  const before = requireEvent(db, userId, id);
  run(db, "DELETE FROM events WHERE id = ? AND user_id = ?", id, userId);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "event.delete",
    entityType: "event",
    entityId: id,
    before,
    after: null,
    reason: "Restorable from Activity within retention window",
    undoable: true,
  });
}

export interface Block {
  id: string;
  taskId: string;
  startAt: number;
  endAt: number;
  status: "planned" | "active" | "done" | "released";
  locked: boolean;
  source: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

interface BlockRow {
  id: string;
  task_id: string;
  start_at: number;
  end_at: number;
  status: string;
  locked: number;
  source: string;
  revision: number;
  created_at: number;
  updated_at: number;
}

function mapBlock(row: BlockRow): Block {
  return {
    id: row.id,
    taskId: row.task_id,
    startAt: num(row.start_at),
    endAt: num(row.end_at),
    status: row.status as Block["status"],
    locked: bool(row.locked),
    source: row.source,
    revision: num(row.revision),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function listBlocks(db: DB, userId: string, from: number, to: number, taskId?: string): Block[] {
  const clauses = ["user_id = ?", "end_at >= ?", "start_at <= ?", "status != 'released'"];
  const params: Param[] = [userId, from, to];
  if (taskId) {
    clauses.push("task_id = ?");
    params.push(taskId);
  }
  return all<BlockRow>(
    db,
    `SELECT * FROM blocks WHERE ${clauses.join(" AND ")} ORDER BY start_at ASC, id ASC`,
    ...params,
  ).map(mapBlock);
}

export function listFutureBlocksForTask(db: DB, userId: string, taskId: string, after: number): Block[] {
  return all<BlockRow>(
    db,
    "SELECT * FROM blocks WHERE user_id = ? AND task_id = ? AND start_at >= ? AND status = 'planned' ORDER BY start_at ASC",
    userId,
    taskId,
    after,
  ).map(mapBlock);
}

export function getBlock(db: DB, userId: string, id: string): Block | undefined {
  const row = one<BlockRow>(db, "SELECT * FROM blocks WHERE id = ? AND user_id = ?", id, userId);
  return row ? mapBlock(row) : undefined;
}

export function requireBlock(db: DB, userId: string, id: string): Block {
  const block = getBlock(db, userId, id);
  if (!block) throw notFound("Time block not found.");
  return block;
}

export function createBlock(
  db: DB,
  userId: string,
  input: { taskId: string; startAt: number; endAt: number; source?: string; status?: Block["status"] },
): Block {
  if (input.endAt <= input.startAt) throw conflict("A time block must end after it starts.");
  const id = newId("blk");
  const created = now();
  run(
    db,
    "INSERT INTO blocks (id, user_id, task_id, start_at, end_at, status, locked, source, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)",
    id,
    userId,
    input.taskId,
    input.startAt,
    input.endAt,
    input.status ?? "planned",
    input.source ?? "user",
    created,
    created,
  );
  return requireBlock(db, userId, id);
}

/**
 * AT14: resizing a block changes the allocation only. `estimatedMinutes` is touched solely when
 * the caller explicitly passes `adjustEstimate`, which the UI asks the user to confirm.
 */
export function updateBlock(
  db: DB,
  userId: string,
  id: string,
  patch: { startAt?: number; endAt?: number; status?: Block["status"]; locked?: boolean; adjustEstimate?: boolean },
  expectedRevision?: number,
): { block: Block; estimateChanged: boolean } {
  const before = requireBlock(db, userId, id);
  assertRevision(before.revision, expectedRevision, "Time block");
  const startAt = patch.startAt ?? before.startAt;
  const endAt = patch.endAt ?? before.endAt;
  if (endAt <= startAt) throw conflict("A time block must end after it starts.");
  run(
    db,
    "UPDATE blocks SET start_at = ?, end_at = ?, status = ?, locked = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?",
    startAt,
    endAt,
    patch.status ?? before.status,
    (patch.locked ?? before.locked) ? 1 : 0,
    now(),
    id,
    userId,
  );

  let estimateChanged = false;
  if (patch.adjustEstimate) {
    const task = requireTask(db, userId, before.taskId);
    const delta = endAt - startAt - (before.endAt - before.startAt);
    const nextEstimate = Math.max(0, Math.round((task.estimatedMinutes * 60_000 + delta) / 60_000));
    if (nextEstimate !== task.estimatedMinutes) {
      run(
        db,
        "UPDATE tasks SET estimated_minutes = ?, remaining_minutes = MAX(?, remaining_minutes), revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?",
        nextEstimate,
        nextEstimate,
        now(),
        task.id,
        userId,
      );
      estimateChanged = true;
    }
  }

  const after = requireBlock(db, userId, id);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "block.update",
    entityType: "block",
    entityId: id,
    before,
    after,
    reason: estimateChanged ? "Estimate adjusted together with the block" : "Allocation changed; task estimate untouched",
    undoable: true,
  });
  return { block: after, estimateChanged };
}

export function setBlockStatus(db: DB, userId: string, id: string, status: Block["status"]): Block {
  const before = requireBlock(db, userId, id);
  run(db, "UPDATE blocks SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?", status, now(), id, userId);
  const after = requireBlock(db, userId, id);
  recordAudit(db, {
    userId,
    actor: "user",
    action: `block.${status}`,
    entityType: "block",
    entityId: id,
    before,
    after,
    reason: "",
    undoable: status !== "released",
  });
  return after;
}

export function deleteBlock(db: DB, userId: string, id: string): void {
  const before = requireBlock(db, userId, id);
  run(db, "DELETE FROM blocks WHERE id = ? AND user_id = ?", id, userId);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "block.delete",
    entityType: "block",
    entityId: id,
    before,
    after: null,
    reason: "",
    undoable: true,
  });
}

// ---------------------------------------------------------------------------
// Work sessions (execution reality — spec E4)
// ---------------------------------------------------------------------------

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

interface WorkRow {
  id: string;
  task_id: string;
  block_id: string | null;
  started_at: number;
  ended_at: number | null;
  minutes: number;
  source: string;
  note: string;
  remaining_after: number | null;
  created_at: number;
}

function mapWork(row: WorkRow): WorkSession {
  return {
    id: row.id,
    taskId: row.task_id,
    blockId: row.block_id,
    startedAt: num(row.started_at),
    endedAt: nullableNum(row.ended_at),
    minutes: num(row.minutes),
    source: row.source as WorkSession["source"],
    note: row.note,
    remainingAfter: nullableNum(row.remaining_after),
    createdAt: num(row.created_at),
  };
}

export function listWorkSessions(db: DB, userId: string, taskId?: string): WorkSession[] {
  const clauses = ["user_id = ?"];
  const params: Param[] = [userId];
  if (taskId) {
    clauses.push("task_id = ?");
    params.push(taskId);
  }
  return all<WorkRow>(
    db,
    `SELECT * FROM work_sessions WHERE ${clauses.join(" AND ")} ORDER BY started_at ASC, id ASC`,
    ...params,
  ).map(mapWork);
}

export function actualMinutes(db: DB, userId: string, taskId: string): number {
  const row = one<{ total: number | null }>(
    db,
    "SELECT SUM(minutes) AS total FROM work_sessions WHERE user_id = ? AND task_id = ?",
    userId,
    taskId,
  );
  return num(row?.total ?? 0);
}

export function createWorkSession(
  db: DB,
  userId: string,
  input: {
    taskId: string;
    blockId?: string | null;
    startedAt: number;
    endedAt?: number | null;
    minutes: number;
    source: "timer" | "manual";
    note?: string;
    remainingAfter?: number | null;
  },
): WorkSession {
  const id = newId("wrk");
  run(
    db,
    `INSERT INTO work_sessions (id, user_id, task_id, block_id, started_at, ended_at, minutes, source, note, remaining_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    input.taskId,
    input.blockId ?? null,
    input.startedAt,
    input.endedAt ?? null,
    Math.max(0, Math.round(input.minutes)),
    input.source,
    input.note ?? "",
    input.remainingAfter ?? null,
    now(),
  );
  const session = mapWork(one<WorkRow>(db, "SELECT * FROM work_sessions WHERE id = ?", id)!);
  recordAudit(db, {
    userId,
    actor: input.source === "timer" ? "system" : "user",
    action: "work.log",
    entityType: "work_session",
    entityId: id,
    before: null,
    after: session,
    reason: input.note ?? "",
    undoable: true,
  });
  return session;
}

// ---------------------------------------------------------------------------
// Goals & milestones
// ---------------------------------------------------------------------------

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

interface GoalRow {
  id: string;
  title: string;
  description: string;
  metric_type: string;
  target: number;
  current: number;
  due_at: number | null;
  status: string;
  revision: number;
  created_at: number;
  updated_at: number;
}

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    metricType: row.metric_type as Goal["metricType"],
    target: num(row.target),
    current: num(row.current),
    dueAt: nullableNum(row.due_at),
    status: row.status as Goal["status"],
    revision: num(row.revision),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function listGoals(db: DB, userId: string): Goal[] {
  return all<GoalRow>(db, "SELECT * FROM goals WHERE user_id = ? ORDER BY created_at ASC, id ASC", userId).map(mapGoal);
}

export function requireGoal(db: DB, userId: string, id: string): Goal {
  const row = one<GoalRow>(db, "SELECT * FROM goals WHERE id = ? AND user_id = ?", id, userId);
  if (!row) throw notFound("Goal not found.");
  return mapGoal(row);
}

export function createGoal(
  db: DB,
  userId: string,
  input: { title: string; description?: string; metricType?: Goal["metricType"]; target?: number; current?: number; dueAt?: number | null },
): Goal {
  const id = newId("gol");
  const created = now();
  run(
    db,
    `INSERT INTO goals (id, user_id, title, description, metric_type, target, current, due_at, status, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
    id,
    userId,
    input.title,
    input.description ?? "",
    input.metricType ?? "count",
    Math.max(0, Number(input.target ?? 0)),
    Math.max(0, Number(input.current ?? 0)),
    input.dueAt ?? null,
    created,
    created,
  );
  return requireGoal(db, userId, id);
}

export function updateGoal(
  db: DB,
  userId: string,
  id: string,
  patch: Partial<{ title: string; description: string; target: number; current: number; dueAt: number | null; status: Goal["status"]; metricType: Goal["metricType"] }>,
  expectedRevision?: number,
  reason = "",
): Goal {
  const before = requireGoal(db, userId, id);
  assertRevision(before.revision, expectedRevision, "Goal");
  run(
    db,
    `UPDATE goals SET title = ?, description = ?, target = ?, current = ?, due_at = ?, status = ?, metric_type = ?,
       revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    patch.title ?? before.title,
    patch.description ?? before.description,
    patch.target ?? before.target,
    patch.current ?? before.current,
    patch.dueAt === undefined ? before.dueAt : patch.dueAt,
    patch.status ?? before.status,
    patch.metricType ?? before.metricType,
    now(),
    id,
    userId,
  );
  const after = requireGoal(db, userId, id);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "goal.update",
    entityType: "goal",
    entityId: id,
    before,
    after,
    reason,
    undoable: true,
  });
  return after;
}

/**
 * AT06 / spec E2.2: outcome units are recorded explicitly. Completing a linked task never moves
 * the goal metric by itself — there is no implicit mapping.
 */
export function logGoalProgress(db: DB, userId: string, id: string, units: number, reason: string): Goal {
  const goal = requireGoal(db, userId, id);
  const next = Math.max(0, goal.current + units);
  return updateGoal(db, userId, id, { current: next }, undefined, reason || `Outcome log of ${units} unit(s)`);
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

interface MilestoneRow {
  id: string;
  goal_id: string;
  title: string;
  position: number;
  status: string;
  revision: number;
  created_at: number;
  updated_at: number;
}

function mapMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    position: num(row.position),
    status: row.status as Milestone["status"],
    revision: num(row.revision),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function listMilestones(db: DB, userId: string, goalId: string): Milestone[] {
  return all<MilestoneRow>(
    db,
    "SELECT * FROM milestones WHERE goal_id = ? AND user_id = ? ORDER BY position ASC, id ASC",
    goalId,
    userId,
  ).map(mapMilestone);
}

export function createMilestone(db: DB, userId: string, goalId: string, title: string): Milestone {
  requireGoal(db, userId, goalId);
  const id = newId("mst");
  const created = now();
  const position = num(
    one<{ n: number }>(db, "SELECT COALESCE(MAX(position), 0) + 1 AS n FROM milestones WHERE goal_id = ?", goalId)?.n ?? 1,
  );
  run(
    db,
    "INSERT INTO milestones (id, goal_id, user_id, title, position, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', 1, ?, ?)",
    id,
    goalId,
    userId,
    title,
    position,
    created,
    created,
  );
  const row = one<MilestoneRow>(db, "SELECT * FROM milestones WHERE id = ?", id);
  return mapMilestone(row!);
}

/**
 * Milestone edits are scoped to the goal in the URL as well as the owner (review REV-020): a
 * milestone belonging to another goal of the same user is "not found", never silently updated.
 */
export function updateMilestone(
  db: DB,
  userId: string,
  id: string,
  patch: { title?: string; status?: Milestone["status"]; position?: number },
  goalId?: string,
): Milestone {
  const row = one<MilestoneRow>(
    db,
    `SELECT * FROM milestones WHERE id = ? AND user_id = ?${goalId ? " AND goal_id = ?" : ""}`,
    ...(goalId ? [id, userId, goalId] : [id, userId]),
  );
  if (!row) throw notFound("Milestone not found.");
  const before = mapMilestone(row);
  run(
    db,
    "UPDATE milestones SET title = ?, status = ?, position = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?",
    patch.title ?? before.title,
    patch.status ?? before.status,
    patch.position ?? before.position,
    now(),
    id,
    userId,
  );
  const after = mapMilestone(one<MilestoneRow>(db, "SELECT * FROM milestones WHERE id = ?", id)!);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "milestone.update",
    entityType: "milestone",
    entityId: id,
    before,
    after,
    reason: "",
    undoable: true,
  });
  return after;
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

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

interface HabitRow {
  id: string;
  title: string;
  goal_id: string | null;
  cadence: string;
  target_count: number;
  min_session_minutes: number;
  max_session_minutes: number;
  paused: number;
  pause_policy: string;
  revision: number;
  created_at: number;
  updated_at: number;
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    title: row.title,
    goalId: row.goal_id,
    cadence: row.cadence as Habit["cadence"],
    targetCount: num(row.target_count),
    minSessionMinutes: num(row.min_session_minutes),
    maxSessionMinutes: num(row.max_session_minutes),
    paused: bool(row.paused),
    pausePolicy: row.pause_policy as Habit["pausePolicy"],
    revision: num(row.revision),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function listHabits(db: DB, userId: string): Habit[] {
  return all<HabitRow>(db, "SELECT * FROM habit_definitions WHERE user_id = ? ORDER BY created_at ASC, id ASC", userId).map(mapHabit);
}

export function requireHabit(db: DB, userId: string, id: string): Habit {
  const row = one<HabitRow>(db, "SELECT * FROM habit_definitions WHERE id = ? AND user_id = ?", id, userId);
  if (!row) throw notFound("Habit not found.");
  return mapHabit(row);
}

export function createHabit(
  db: DB,
  userId: string,
  input: { title: string; goalId?: string | null; cadence?: Habit["cadence"]; targetCount?: number; minSessionMinutes?: number; maxSessionMinutes?: number },
): Habit {
  const id = newId("hab");
  const created = now();
  run(
    db,
    `INSERT INTO habit_definitions (id, user_id, title, goal_id, cadence, target_count, min_session_minutes, max_session_minutes, paused, pause_policy, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'exclude', 1, ?, ?)`,
    id,
    userId,
    input.title,
    input.goalId ?? null,
    input.cadence ?? "weekly",
    Math.max(1, Math.round(input.targetCount ?? 4)),
    Math.max(0, Math.round(input.minSessionMinutes ?? 0)),
    Math.max(0, Math.round(input.maxSessionMinutes ?? 0)),
    created,
    created,
  );
  return requireHabit(db, userId, id);
}

export function updateHabit(
  db: DB,
  userId: string,
  id: string,
  patch: Partial<Pick<Habit, "title" | "cadence" | "targetCount" | "minSessionMinutes" | "maxSessionMinutes" | "paused" | "pausePolicy" | "goalId">>,
  expectedRevision?: number,
  reason = "",
): Habit {
  const before = requireHabit(db, userId, id);
  assertRevision(before.revision, expectedRevision, "Habit");
  run(
    db,
    `UPDATE habit_definitions SET title = ?, goal_id = ?, cadence = ?, target_count = ?, min_session_minutes = ?,
       max_session_minutes = ?, paused = ?, pause_policy = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    patch.title ?? before.title,
    patch.goalId === undefined ? before.goalId : patch.goalId,
    patch.cadence ?? before.cadence,
    patch.targetCount ?? before.targetCount,
    patch.minSessionMinutes ?? before.minSessionMinutes,
    patch.maxSessionMinutes ?? before.maxSessionMinutes,
    (patch.paused ?? before.paused) ? 1 : 0,
    patch.pausePolicy ?? before.pausePolicy,
    now(),
    id,
    userId,
  );
  const after = requireHabit(db, userId, id);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "habit.update",
    entityType: "habit",
    entityId: id,
    before,
    after,
    reason,
    undoable: true,
  });
  return after;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  occurredAt: number;
  minutes: number;
  source: string;
  createdAt: number;
}

// --- Habit pause windows (AT33) -----------------------------------------------

export interface HabitPause {
  id: string;
  habitId: string;
  startedAt: number;
  endedAt: number | null;
  /** What happens to occurrences logged inside this window. */
  policy: "exclude" | "count";
  createdAt: number;
  updatedAt: number;
}

interface PauseRow {
  id: string;
  habit_id: string;
  started_at: number;
  ended_at: number | null;
  policy: string;
  created_at: number;
  updated_at: number;
}

function mapPause(row: PauseRow): HabitPause {
  return {
    id: row.id,
    habitId: row.habit_id,
    startedAt: num(row.started_at),
    endedAt: row.ended_at === null ? null : num(row.ended_at),
    policy: row.policy as HabitPause["policy"],
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export function listPauses(db: DB, userId: string, habitId: string): HabitPause[] {
  return all<PauseRow>(
    db,
    "SELECT * FROM habit_pauses WHERE user_id = ? AND habit_id = ? ORDER BY started_at ASC, id ASC",
    userId,
    habitId,
  ).map(mapPause);
}

/** Pausing an already paused habit keeps the original window open (idempotent). */
export function startHabitPause(db: DB, userId: string, habitId: string, policy: HabitPause["policy"]): HabitPause {
  const open = listPauses(db, userId, habitId).filter((pause) => pause.endedAt === null);
  const current = open.length > 0 ? open[open.length - 1] : null;
  if (current) {
    if (current.policy === policy) return current;
    run(db, "UPDATE habit_pauses SET policy = ?, updated_at = ? WHERE id = ?", policy, now(), current.id);
    return mapPause(one<PauseRow>(db, "SELECT * FROM habit_pauses WHERE id = ?", current.id)!);
  }
  const id = newId("pau");
  const ts = now();
  run(
    db,
    "INSERT INTO habit_pauses (id, user_id, habit_id, started_at, ended_at, policy, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
    id,
    userId,
    habitId,
    ts,
    policy,
    ts,
    ts,
  );
  return mapPause(one<PauseRow>(db, "SELECT * FROM habit_pauses WHERE id = ?", id)!);
}

export function endHabitPause(db: DB, userId: string, habitId: string): void {
  const ts = now();
  run(
    db,
    "UPDATE habit_pauses SET ended_at = ?, updated_at = ? WHERE user_id = ? AND habit_id = ? AND ended_at IS NULL",
    ts,
    ts,
    userId,
    habitId,
  );
}

/**
 * AT34: the same occurrence submitted twice (timer + manual entry, or a retried request) must stay
 * a single occurrence, so look for an identical entry before inserting one.
 */
export function findCheckin(
  db: DB,
  userId: string,
  habitId: string,
  occurredAt: number,
  minutes: number,
): HabitCheckin | null {
  const row = one<CheckinRow>(
    db,
    "SELECT * FROM habit_checkins WHERE user_id = ? AND habit_id = ? AND occurred_at = ? AND minutes = ? ORDER BY created_at ASC LIMIT 1",
    userId,
    habitId,
    occurredAt,
    Math.max(0, Math.round(minutes)),
  );
  return row ? mapCheckin(row) : null;
}

interface CheckinRow {
  id: string;
  habit_id: string;
  occurred_at: number;
  minutes: number;
  source: string;
  created_at: number;
}

function mapCheckin(row: CheckinRow): HabitCheckin {
  return {
    id: row.id,
    habitId: row.habit_id,
    occurredAt: num(row.occurred_at),
    minutes: num(row.minutes),
    source: row.source,
    createdAt: num(row.created_at),
  };
}

export function listCheckins(db: DB, userId: string, habitId: string, from?: number, to?: number): HabitCheckin[] {
  const clauses = ["user_id = ?", "habit_id = ?"];
  const params: Param[] = [userId, habitId];
  if (from !== undefined) {
    clauses.push("occurred_at >= ?");
    params.push(from);
  }
  if (to !== undefined) {
    clauses.push("occurred_at <= ?");
    params.push(to);
  }
  return all<CheckinRow>(
    db,
    `SELECT * FROM habit_checkins WHERE ${clauses.join(" AND ")} ORDER BY occurred_at ASC, id ASC`,
    ...params,
  ).map(mapCheckin);
}

export function createCheckin(db: DB, userId: string, habitId: string, occurredAt: number, minutes = 0): HabitCheckin {
  requireHabit(db, userId, habitId);
  const id = newId("chk");
  run(
    db,
    "INSERT INTO habit_checkins (id, user_id, habit_id, occurred_at, minutes, source, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?)",
    id,
    userId,
    habitId,
    occurredAt,
    Math.max(0, Math.round(minutes)),
    now(),
  );
  const checkin = mapCheckin(one<CheckinRow>(db, "SELECT * FROM habit_checkins WHERE id = ?", id)!);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "habit.checkin",
    entityType: "habit",
    entityId: habitId,
    before: null,
    after: checkin,
    reason: "",
    undoable: true,
  });
  return checkin;
}

/**
 * Scoped to the habit in the URL as well as the owner (review REV-020): a check-in of another
 * habit owned by the same user can never be deleted through the wrong URL.
 */
export function deleteCheckin(db: DB, userId: string, id: string, habitId: string): void {
  const row = one<CheckinRow>(
    db,
    "SELECT * FROM habit_checkins WHERE id = ? AND user_id = ? AND habit_id = ?",
    id,
    userId,
    habitId,
  );
  if (!row) throw notFound("Check-in not found.");
  run(db, "DELETE FROM habit_checkins WHERE id = ? AND user_id = ? AND habit_id = ?", id, userId, habitId);
  recordAudit(db, {
    userId,
    actor: "user",
    action: "habit.checkin.remove",
    entityType: "habit",
    entityId: row.habit_id,
    before: mapCheckin(row),
    after: null,
    reason: "",
    undoable: false,
  });
}

/** Spec H2: period attainment, never "streak" as the default judgement (CR07). */
export function habitPeriod(
  habit: Habit,
  checkins: HabitCheckin[],
  nowMs: number,
  timeZone: string,
  pauses: HabitPause[] = [],
): { periodStart: number; periodEnd: number; done: number; target: number; paused: boolean; attainment: number } {
  const dayStartKey = dayKey(nowMs, timeZone);
  const { year, month, day } = parseDayKey(dayStartKey);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // Week starts Monday. Both edges are calendar days resolved in the user's own zone, so a DST
  // transition (23h/25h day) inside the week can no longer drag either boundary by an hour
  // (review REV-023) — the old code added fixed 7×24h milliseconds to a DST-aware midnight.
  const periodStartKey = habit.cadence === "weekly" ? shiftDayKey(dayStartKey, -((weekday + 6) % 7)) : dayStartKey;
  const periodEndKey = shiftDayKey(periodStartKey, habit.cadence === "weekly" ? 7 : 1);
  const periodStart = dayKeyToInstant(periodStartKey, timeZone);
  const periodEnd = dayKeyToInstant(periodEndKey, timeZone);
  // AT33: occurrences inside a pause window follow that window's policy instead of being
  // silently skipped or silently counted.
  const suppressed = (instant: number): boolean =>
    pauses.some(
      (pause) => pause.policy === "exclude" && pause.startedAt <= instant && instant <= (pause.endedAt ?? nowMs),
    );
  const inPeriod = checkins.filter(
    (checkin) =>
      checkin.occurredAt >= periodStart &&
      checkin.occurredAt < periodEnd &&
      !suppressed(checkin.occurredAt),
  );
  const done = inPeriod.length;
  const target = Math.max(1, habit.targetCount);
  return {
    periodStart,
    periodEnd,
    done,
    target,
    paused: habit.paused,
    attainment: Math.min(1, done / target),
  };
}

// ---------------------------------------------------------------------------
// Scheduler input assembly
// ---------------------------------------------------------------------------

export interface ScheduleContext {
  busy: BusyBlock[];
  workingWindows: { start: number; end: number }[];
  softRest: { start: number; end: number }[];
}

function parseClock(value: string): number {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function buildScheduleContext(user: User, db: DB, from: number, to: number): ScheduleContext {
  const events = listEvents(db, user.id, from, to);
  const blocks = listBlocks(db, user.id, from, to);
  const busy: BusyBlock[] = [
    ...events.map((event) => ({
      id: event.id,
      start: event.startAt,
      end: event.endAt,
      kind: (event.kind === "rest_soft" ? "rest" : "event") as BusyBlock["kind"],
      locked: event.locked,
      label: event.title,
    })),
    ...blocks
      .filter((block) => block.status !== "released")
      .map((block) => ({
        id: block.id,
        start: block.startAt,
        end: block.endAt,
        kind: "block" as const,
        locked: block.locked,
        label: block.taskId,
      })),
  ];

  const working = user.settings.workingHours;
  const dayKeys = dayKeysBetween(from, to, user.timezone);
  const workingWindows: { start: number; end: number }[] = [];
  const softRest: { start: number; end: number }[] = [];

  for (const key of dayKeys) {
    const dayStart = dayKeyToInstant(key, user.timezone);
    const weekday = new Date(Date.parse(`${key}T00:00:00Z`)).getUTCDay();
    if (!working.days.includes(weekday)) continue;
    const startMinutes = parseClock(working.start);
    const endMinutes = parseClock(working.end);
    const start = dayStart + startMinutes * 60_000;
    const end = dayStart + endMinutes * 60_000;
    if (end <= from || start >= to) continue;
    workingWindows.push({ start: Math.max(start, from), end: Math.min(end, to) });
    if (user.settings.softRest.enabled) {
      const restStart = dayStart + parseClock(user.settings.softRest.start) * 60_000;
      const restEnd = dayStart + parseClock(user.settings.softRest.end) * 60_000;
      if (restEnd > from && restStart < to) softRest.push({ start: restStart, end: restEnd });
    }
  }

  // Events marked protected rest are hard-unavailable (H5) even if they sit in working hours.
  for (const event of events) {
    if (event.kind === "rest_protected") busy.push({ id: event.id, start: event.startAt, end: event.endAt, kind: "rest", locked: true, label: event.title });
  }

  return { busy, workingWindows, softRest };
}

/** Unused helper kept for call sites that need local noon anchors without importing time utils. */
export const zonedNoon = (dayKeyString: string, timeZone: string): number => {
  const [year, month, day] = dayKeyString.split("-").map((part) => Number(part));
  return zonedTimeToInstant(year ?? 1970, month ?? 1, day ?? 1, 12, 0, timeZone);
};

export const minutesOfDay = (instant: number, timeZone: string): number => minutesSinceMidnight(instant, timeZone);

// ---------------------------------------------------------------------------
// Proposals, audit, idempotency
// ---------------------------------------------------------------------------

export interface ProposalRecord<TPayload = unknown> {
  id: string;
  kind: "schedule" | "recovery";
  strategy: string;
  payload: TPayload;
  baseRevisions: Record<string, number>;
  status: "pending" | "committed" | "dismissed" | "expired";
  trigger: string;
  idempotencyKey: string | null;
  createdAt: number;
  expiresAt: number;
  resolvedAt: number | null;
}

interface ProposalRow {
  id: string;
  kind: string;
  strategy: string;
  payload: string;
  base_revisions: string;
  status: string;
  trigger: string;
  idempotency_key: string | null;
  created_at: number;
  expires_at: number;
  resolved_at: number | null;
}

function mapProposal<T>(row: ProposalRow): ProposalRecord<T> {
  return {
    id: row.id,
    kind: row.kind as ProposalRecord["kind"],
    strategy: row.strategy,
    payload: parseJson<T>(row.payload, {} as T),
    baseRevisions: parseJson<Record<string, number>>(row.base_revisions, {}),
    status: row.status as ProposalRecord["status"],
    trigger: row.trigger,
    idempotencyKey: row.idempotency_key,
    createdAt: num(row.created_at),
    expiresAt: num(row.expires_at),
    resolvedAt: nullableNum(row.resolved_at),
  };
}

export function saveProposal<T>(
  db: DB,
  userId: string,
  input: { kind: "schedule" | "recovery"; strategy: string; payload: T; baseRevisions: Record<string, number>; trigger: string; ttlMs?: number },
): ProposalRecord<T> {
  const id = newId("prp");
  const created = now();
  run(
    db,
    `INSERT INTO proposals (id, user_id, kind, strategy, payload, base_revisions, status, trigger, idempotency_key, created_at, expires_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, NULL)`,
    id,
    userId,
    input.kind,
    input.strategy,
    JSON.stringify(input.payload),
    JSON.stringify(input.baseRevisions),
    input.trigger,
    created,
    created + (input.ttlMs ?? 15 * 60 * 1000),
  );
  return getProposal<T>(db, userId, id)!;
}

export function getProposal<T>(db: DB, userId: string, id: string): ProposalRecord<T> | undefined {
  const row = one<ProposalRow>(db, "SELECT * FROM proposals WHERE id = ? AND user_id = ?", id, userId);
  return row ? mapProposal<T>(row) : undefined;
}

export function requireProposal<T>(db: DB, userId: string, id: string): ProposalRecord<T> {
  const proposal = getProposal<T>(db, userId, id);
  if (!proposal) throw notFound("Proposal not found.");
  return proposal;
}

export function listProposals<T>(db: DB, userId: string, status?: string): ProposalRecord<T>[] {
  const clauses = ["user_id = ?"];
  const params: Param[] = [userId];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  return all<ProposalRow>(
    db,
    `SELECT * FROM proposals WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id ASC`,
    ...params,
  ).map((row) => mapProposal<T>(row));
}

export function resolveProposal(db: DB, userId: string, id: string, status: ProposalRecord["status"]): void {
  run(db, "UPDATE proposals SET status = ?, resolved_at = ? WHERE id = ? AND user_id = ?", status, now(), id, userId);
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

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  reason: string;
  proposal_id: string | null;
  undoable: number;
  undone_at: number | null;
  created_at: number;
}

function mapAudit(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before_json ? parseJson<unknown>(row.before_json, null) : null,
    after: row.after_json ? parseJson<unknown>(row.after_json, null) : null,
    reason: row.reason,
    proposalId: row.proposal_id,
    undoable: bool(row.undoable),
    undoneAt: nullableNum(row.undone_at),
    createdAt: num(row.created_at),
  };
}

export function recordAudit(
  db: DB,
  input: {
    userId: string;
    actor: "user" | "agent" | "system";
    action: string;
    entityType: string;
    entityId: string;
    before: unknown;
    after: unknown;
    reason: string;
    proposalId?: string | null;
    undoable?: boolean;
  },
): AuditEntry {
  const id = newId("aud");
  run(
    db,
    `INSERT INTO audit_events (id, user_id, actor, action, entity_type, entity_id, before_json, after_json, reason, proposal_id, undoable, undone_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    id,
    input.userId,
    input.actor,
    input.action,
    input.entityType,
    input.entityId,
    input.before === null || input.before === undefined ? null : JSON.stringify(input.before),
    input.after === null || input.after === undefined ? null : JSON.stringify(input.after),
    input.reason,
    input.proposalId ?? null,
    input.undoable === false ? 0 : 1,
    now(),
  );
  return getAudit(db, input.userId, id)!;
}

export function listAudit(db: DB, userId: string, limit = 100): AuditEntry[] {
  return all<AuditRow>(
    db,
    "SELECT * FROM audit_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    userId,
    Math.min(500, Math.max(1, limit)),
  ).map(mapAudit);
}

export function getAudit(db: DB, userId: string, id: string): AuditEntry | undefined {
  const row = one<AuditRow>(db, "SELECT * FROM audit_events WHERE id = ? AND user_id = ?", id, userId);
  return row ? mapAudit(row) : undefined;
}

export function markAuditUndone(db: DB, userId: string, id: string): void {
  run(db, "UPDATE audit_events SET undone_at = ? WHERE id = ? AND user_id = ?", now(), id, userId);
}

export function findIdempotent<T>(db: DB, userId: string, key: string): T | undefined {
  const row = one<{ response_json: string }>(
    db,
    "SELECT response_json FROM idempotency_keys WHERE user_id = ? AND key = ?",
    userId,
    key,
  );
  return row ? parseJson<T>(row.response_json, undefined as T) : undefined;
}

export function saveIdempotent<T>(db: DB, userId: string, key: string, response: T): void {
  run(
    db,
    "INSERT OR IGNORE INTO idempotency_keys (id, user_id, key, response_json, created_at) VALUES (?, ?, ?, ?, ?)",
    newId("idm"),
    userId,
    key,
    JSON.stringify(response),
    now(),
  );
}

export function exportUserData(db: DB, userId: string): Record<string, unknown> {
  return {
    exportedAt: now(),
    profile: findUserById(db, userId),
    goals: listGoals(db, userId),
    milestones: all<MilestoneRow>(db, "SELECT * FROM milestones WHERE user_id = ?", userId).map(mapMilestone),
    tasks: listTasks(db, userId, { includeArchived: true }),
    events: all<EventRow>(db, "SELECT * FROM events WHERE user_id = ? ORDER BY start_at", userId).map(mapEvent),
    blocks: all<BlockRow>(db, "SELECT * FROM blocks WHERE user_id = ? ORDER BY start_at", userId).map(mapBlock),
    workSessions: listWorkSessions(db, userId),
    habits: listHabits(db, userId),
    checkins: all<CheckinRow>(db, "SELECT * FROM habit_checkins WHERE user_id = ?", userId).map(mapCheckin),
    activity: listAudit(db, userId, 500),
  };
}

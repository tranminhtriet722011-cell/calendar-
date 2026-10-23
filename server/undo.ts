/**
 * Semantic undo (spec D8/I3, Decision D-010, AT30/AT31).
 *
 * Rules:
 *  - Undo is derived from the audit trail, never from guessing.
 *  - An entity that changed after the audited mutation cannot be blindly restored: the caller gets
 *    a conflict preview instead (AT31).
 *  - Undo never deletes schedule data: schedule blocks are *released*, so the change stays
 *    auditable. The one exception is a manual work log (E4 "did it but forgot Start" correction):
 *    undoing `work.log` removes that logged entry itself, which is disclosed in the Activity
 *    message (see docs/spec/APE_V1_1_IMPLEMENTATION_SPEC.md §10, R-8).
 */

import type { DB } from "./db";
import {
  getAudit,
  markAuditUndone,
  recordAudit,
  setBlockStatus,
  type AuditEntry,
} from "./store";

export interface UndoOutcome {
  ok: boolean;
  code: string;
  message: string;
  conflicts?: { entity: string; reason: string; id: string }[];
  restored?: string[];
}

const TABLE_FOR: Record<string, string> = {
  task: "tasks",
  block: "blocks",
  event: "events",
  goal: "goals",
  habit: "habit_definitions",
};

const COLUMNS: Record<string, Record<string, string>> = {
  tasks: {
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
    archived: "archived",
  },
  blocks: { taskId: "task_id", startAt: "start_at", endAt: "end_at", status: "status", locked: "locked" },
  events: { title: "title", startAt: "start_at", endAt: "end_at", kind: "kind", locked: "locked" },
  goals: {
    title: "title",
    description: "description",
    metricType: "metric_type",
    target: "target",
    current: "current",
    dueAt: "due_at",
    status: "status",
  },
  habit_definitions: {
    title: "title",
    goalId: "goal_id",
    cadence: "cadence",
    targetCount: "target_count",
    minSessionMinutes: "min_session_minutes",
    maxSessionMinutes: "max_session_minutes",
    paused: "paused",
    pausePolicy: "pause_policy",
  },
};

const now = (): number => Date.now();

function currentValue(db: DB, userId: string, table: string, id: string): Record<string, unknown> | undefined {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId) as
    | Record<string, unknown>
    | undefined;
  return row;
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>, columns: Record<string, string>): string[] {
  return Object.keys(columns).filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
}

function restoreRow(
  db: DB,
  userId: string,
  table: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): UndoOutcome {
  const columns = COLUMNS[table];
  const id = String(before.id ?? "");
  const current = currentValue(db, userId, table, id);
  if (!current) {
    return { ok: false, code: "entity_missing", message: "The item no longer exists, so it cannot be restored." };
  }
  if (Number(current.revision) !== Number(after.revision)) {
    return {
      ok: false,
      code: "undo_conflict",
      message: "This item changed after the recorded action. Preview the difference instead of restoring blindly.",
      conflicts: [{ entity: table, id, reason: `revision ${current.revision} ≠ ${after.revision} recorded by the action` }],
    };
  }
  const keys = changedKeys(before, after, columns);
  if (keys.length === 0) return { ok: true, code: "noop", message: "Nothing to restore.", restored: [] };

  const assignments = keys.map((key) => `${columns[key]} = ?`);
  const params = keys.map((key) => {
    const value = before[key];
    if (typeof value === "boolean") return value ? 1 : 0;
    return (value ?? null) as string | number | null;
  });
  db.prepare(
    `UPDATE ${table} SET ${assignments.join(", ")}, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
  ).run(...params, now(), id, userId);
  return { ok: true, code: "restored", message: "Restored.", restored: [id] };
}

/**
 * Re-insert a row that a `*.delete` action removed. Only events and blocks are hard-deleted by the
 * API; everything else is archived, so this is deliberately narrow.
 */
function reinsert(db: DB, userId: string, table: string, snapshot: Record<string, unknown>): UndoOutcome {
  const columns = COLUMNS[table];
  if (!columns) return { ok: false, code: "not_undoable", message: "This deletion cannot be undone." };
  const id = String(snapshot.id ?? "");
  const existing = currentValue(db, userId, table, id);
  if (existing) return { ok: true, code: "already_present", message: "Already restored.", restored: [id] };

  const keys = Object.keys(columns).filter((key) => snapshot[key] !== undefined);
  const columnNames = [...keys.map((key) => columns[key]), "revision", "created_at", "updated_at"];
  const values = [
    ...keys.map((key) => {
      const value = snapshot[key];
      if (typeof value === "boolean") return value ? 1 : 0;
      return (value ?? null) as string | number | null;
    }),
    1,
    Number(snapshot.createdAt ?? now()),
    now(),
  ];
  db.prepare(
    `INSERT OR IGNORE INTO ${table} (id, user_id, ${columnNames.join(", ")}) VALUES (?, ?, ${columnNames.map(() => "?").join(", ")})`,
  ).run(id, userId, ...values);
  return { ok: true, code: "restored", message: "Restored.", restored: [id] };
}

function undoScheduleCommit(db: DB, userId: string, entry: AuditEntry): UndoOutcome {
  const after = entry.after as { applied?: string[]; released?: string[] } | null;
  if (!after) return { ok: false, code: "not_undoable", message: "This schedule change has no recorded impact to undo." };

  const conflicts: { entity: string; reason: string; id: string }[] = [];
  const restored: string[] = [];
  for (const blockId of after.applied ?? []) {
    const block = currentValue(db, userId, "blocks", blockId);
    if (!block) continue;
    // Blocks created by the proposal still carry revision 1 unless the user edited them (AT31).
    if (Number(block.revision) !== 1) {
      conflicts.push({ entity: "block", id: blockId, reason: "edited since the proposal was applied" });
      continue;
    }
    setBlockStatus(db, userId, blockId, "released");
    restored.push(blockId);
  }
  for (const blockId of after.released ?? []) {
    const block = currentValue(db, userId, "blocks", blockId) as { status: string; revision: number } | undefined;
    if (!block || block.status !== "released") continue;
    // The release itself bumped the revision by exactly one; anything more means the user edited it.
    if (Number(block.revision) > 2) {
      conflicts.push({ entity: "block", id: blockId, reason: "changed after it was released" });
      continue;
    }
    setBlockStatus(db, userId, blockId, "planned");
    restored.push(blockId);
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: "undo_conflict",
      message: "Restoring this plan would conflict with later changes. Review the affected sessions first.",
      conflicts,
      restored,
    };
  }
  return { ok: true, code: "restored", message: "Schedule restored.", restored };
}

export function undoAuditEntry(db: DB, userId: string, entryId: string): UndoOutcome {
  const entry = getAudit(db, userId, entryId);
  if (!entry) return { ok: false, code: "not_found", message: "Activity entry not found." };
  if (entry.undoneAt !== null) return { ok: false, code: "already_undone", message: "This action was already undone." };
  if (!entry.undoable) return { ok: false, code: "not_undoable", message: "This action cannot be undone." };

  let outcome: UndoOutcome;
  if (entry.action === "schedule.commit") {
    outcome = undoScheduleCommit(db, userId, entry);
  } else if (entry.action === "task.archive") {
    const legacyBefore = entry.before as Record<string, unknown> | null;
    const legacyAfter = entry.after as Record<string, unknown> | null;
    const isLegacy = !!legacyBefore && typeof legacyBefore.title === "string";
    if (isLegacy) {
      // Audit rows written before the cascade was recorded: restore the single row as before.
      outcome = restoreRow(db, userId, "tasks", legacyBefore!, legacyAfter!);
    } else {
      const before = entry.before as { task?: Record<string, unknown>; children?: Record<string, unknown>[] } | null;
      const after = entry.after as { task?: Record<string, unknown>; children?: Record<string, unknown>[] } | null;
      if (!before?.task || !after?.task) {
        outcome = { ok: false, code: "not_undoable", message: "Nothing to restore." };
      } else {
        // REV-011: the archive cascaded to subtasks, so the inverse restores the parent *and* every
        // cascaded child — all-or-nothing, so a child edited since then surfaces as a conflict
        // preview instead of a half-restored hierarchy.
        db.exec("BEGIN");
        try {
          const parent = restoreRow(db, userId, "tasks", before.task, after.task);
          const restored = [...(parent.restored ?? [])];
          const conflicts = [...(parent.conflicts ?? [])];
          if (parent.ok) {
            const childrenBefore = before.children ?? [];
            const childrenAfter = after.children ?? [];
            for (let index = 0; index < childrenBefore.length; index += 1) {
              const child = restoreRow(db, userId, "tasks", childrenBefore[index], childrenAfter[index] ?? childrenBefore[index]);
              if (child.ok) restored.push(...(child.restored ?? []));
              else conflicts.push(...(child.conflicts ?? []));
            }
          }
          if (!parent.ok || conflicts.length > 0) {
            db.exec("ROLLBACK");
            outcome = parent.ok
              ? {
                  ok: false,
                  code: "undo_conflict",
                  message: "A subtask changed after the archive. Preview the difference instead of restoring blindly.",
                  conflicts,
                }
              : parent;
          } else {
            db.exec("COMMIT");
            outcome = { ok: true, code: "restored", message: "Task and its subtasks restored.", restored };
          }
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
    }
  } else if (entry.action === "event.delete" || entry.action === "block.delete") {
    const before = entry.before as Record<string, unknown> | null;
    outcome = before ? reinsert(db, userId, entry.entityType === "event" ? "events" : "blocks", before) : { ok: false, code: "not_undoable", message: "Nothing to restore." };
  } else if (entry.action === "work.log") {
    const after = entry.after as { id?: string } | null;
    if (after?.id) {
      db.prepare("DELETE FROM work_sessions WHERE id = ? AND user_id = ?").run(after.id, userId);
      outcome = { ok: true, code: "restored", message: "Work log removed.", restored: [after.id] };
    } else {
      outcome = { ok: false, code: "not_undoable", message: "This work log cannot be removed." };
    }
  } else {
    const table = TABLE_FOR[entry.entityType];
    const before = entry.before as Record<string, unknown> | null;
    const after = entry.after as Record<string, unknown> | null;
    if (!table || !before || !after) {
      outcome = { ok: false, code: "not_undoable", message: "This action has no reversible snapshot." };
    } else {
      outcome = restoreRow(db, userId, table, before, after);
    }
  }

  if (outcome.ok && outcome.code !== "noop") {
    markAuditUndone(db, userId, entry.id);
    recordAudit(db, {
      userId,
      actor: "user",
      action: `${entry.action}.undo`,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.after,
      after: entry.before,
      reason: `Undo of ${entry.id}`,
      undoable: false,
    });
  }
  return outcome;
}

/** Preview helper used by the UI before an undo is offered (spec D8). */
export function undoPreview(entry: AuditEntry): { available: boolean; reason: string; summary: string } {
  if (!entry.undoable) return { available: false, reason: "not_undoable", summary: "This action has no reversal path." };
  if (entry.undoneAt !== null) return { available: false, reason: "already_undone", summary: "Already undone." };
  const label = entry.action.replace(/\./g, " ");
  return { available: true, reason: "ok", summary: `Reverse: ${label} on ${entry.entityType}` };
}

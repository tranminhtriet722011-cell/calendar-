/**
 * TasksView — capture, inspection and execution of tasks.
 *
 * - List with status / priority / due / estimate / remaining.
 * - Inline edit of estimate, due date, priority and status (status goes through the validated
 *   status endpoint, so illegal transitions surface the server's message instead of silently
 *   rewriting state).
 * - Subtasks, sessions list, completion (releases only this task's future sessions), starting
 *   effort and manual work logging.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiGet, apiPatch, apiPost, errorMessage } from "../api";
import { useAsyncData } from "../useAsyncData";
import { useStatus } from "../statusContext";
import { AsyncSection } from "../components/AsyncSection";
import { DateTimeField, NumberField, SelectField, TextField, parseNumber } from "../components/fields";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatDateTime, formatDurationMinutes, fromDateTimeLocal, toDateTimeLocal } from "../format";
import type { Task, TaskStatus, WorkSession } from "../types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_OPTIONS: { value: string; label: string }[] = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PRIORITY_OPTIONS = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `P${value}` }));

interface SessionsEntry {
  loading: boolean;
  error: string | null;
  data: { sessions: WorkSession[]; actualMinutes: number } | null;
}

export default function TasksView() {
  const { announce } = useStatus();
  const state = useAsyncData<{ tasks: Task[] }>(() => apiGet<{ tasks: Task[] }>("/api/tasks"), []);

  const [createForm, setCreateForm] = useState({ title: "", estimatedMinutes: "60", dueAt: "", priority: "3" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionsCache, setSessionsCache] = useState<Record<string, SessionsEntry>>({});

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ estimatedMinutes: "", dueAt: "", priority: "3", status: "not_started" });
  const [editError, setEditError] = useState<string | null>(null);

  const [subtaskForms, setSubtaskForms] = useState<Record<string, string>>({});
  const [logForms, setLogForms] = useState<Record<string, { minutes: string; remainingAfter: string; note: string }>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<{ kind: "complete"; task: Task } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const tasks = state.data?.tasks ?? [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const topLevel = tasks.filter((task) => task.parentId === null || !byId.has(task.parentId));
  const childrenOf = (taskId: string): Task[] =>
    tasks.filter((task) => task.parentId === taskId).sort((a, b) => a.position - b.position);

  function setDetailError(key: string, message: string | null): void {
    setDetailErrors((current) => {
      const next = { ...current };
      if (message === null) delete next[key];
      else next[key] = message;
      return next;
    });
  }

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const title = createForm.title.trim();
    if (!title) {
      setCreateError("Enter a task title.");
      return;
    }
    const estimate = parseNumber(createForm.estimatedMinutes) ?? 0;
    const dueAt = fromDateTimeLocal(createForm.dueAt);
    setCreateBusy(true);
    setCreateError(null);
    try {
      await apiPost("/api/tasks", {
        title,
        estimatedMinutes: estimate,
        dueAt,
        priority: Number(createForm.priority),
      });
      announce(`Task “${title}” created.`, "success");
      setCreateForm({ title: "", estimatedMinutes: "60", dueAt: "", priority: "3" });
      state.reload();
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(task: Task): void {
    setEditId(task.id);
    setEditError(null);
    setEditForm({
      estimatedMinutes: String(task.estimatedMinutes),
      dueAt: toDateTimeLocal(task.dueAt),
      priority: String(task.priority),
      status: task.status,
    });
  }

  /** Save inline edits: status changes go through the validated status endpoint first. */
  async function submitEdit(task: Task): Promise<void> {
    setEditError(null);
    let current = task;
    const dueAt = fromDateTimeLocal(editForm.dueAt);
    const estimate = parseNumber(editForm.estimatedMinutes);
    if (estimate === null || estimate < 0) {
      setEditError("Estimate must be zero or more minutes.");
      return;
    }
    try {
      if (editForm.status !== task.status) {
        const statusResult = await apiPost<{ task: Task }>(`/api/tasks/${encodeURIComponent(task.id)}/status`, {
          status: editForm.status,
          revision: current.revision,
        });
        current = statusResult.task;
      }
      const patch: Record<string, unknown> = {
        estimatedMinutes: estimate,
        priority: Number(editForm.priority),
        revision: current.revision,
      };
      if (editForm.dueAt === "" && task.dueAt !== null) patch.dueAt = null;
      else if (dueAt !== null && dueAt !== task.dueAt) patch.dueAt = dueAt;
      await apiPatch(`/api/tasks/${encodeURIComponent(task.id)}`, patch);
      announce(`Task “${task.title}” updated.`, "success");
      setEditId(null);
      state.reload();
    } catch (error) {
      const message = errorMessage(error);
      if (error instanceof ApiError && error.status === 409) {
        setEditError(`${message} Refreshing the list.`);
        state.reload();
      } else {
        setEditError(message);
      }
    }
  }

  async function startTask(task: Task): Promise<void> {
    setBusyId(task.id);
    try {
      await apiPost(`/api/tasks/${encodeURIComponent(task.id)}/status`, {
        status: "in_progress",
        revision: task.revision,
      });
      announce(`“${task.title}” is now in progress.`, "success");
      state.reload();
    } catch (error) {
      announce(errorMessage(error), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function completeTask(task: Task): Promise<void> {
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      const result = await apiPost<{ task: Task; releasedBlocks: string[] }>(
        `/api/tasks/${encodeURIComponent(task.id)}/complete`,
        { revision: task.revision },
      );
      announce(
        result.releasedBlocks.length > 0
          ? `“${task.title}” completed; ${result.releasedBlocks.length} future session(s) released.`
          : `“${task.title}” completed.`,
        "success",
      );
      setConfirm(null);
      state.reload();
    } catch (error) {
      setConfirmError(errorMessage(error));
    } finally {
      setConfirmBusy(false);
    }
  }

  function toggleDetail(taskId: string): void {
    const willOpen = expandedId !== taskId;
    setExpandedId(willOpen ? taskId : null);
    if (willOpen && !sessionsCache[taskId]) void loadSessions(taskId);
  }

  async function loadSessions(taskId: string): Promise<void> {
    setSessionsCache((current) => ({ ...current, [taskId]: { loading: true, error: null, data: current[taskId]?.data ?? null } }));
    try {
      const result = await apiGet<{ sessions: WorkSession[]; actualMinutes: number }>(
        `/api/tasks/${encodeURIComponent(taskId)}/sessions`,
      );
      setSessionsCache((current) => ({ ...current, [taskId]: { loading: false, error: null, data: result } }));
    } catch (error) {
      setSessionsCache((current) => ({
        ...current,
        [taskId]: { loading: false, error: errorMessage(error), data: null },
      }));
    }
  }

  async function submitSubtask(parent: Task): Promise<void> {
    const title = (subtaskForms[parent.id] ?? "").trim();
    if (!title) {
      setDetailError(parent.id, "Enter a subtask title.");
      return;
    }
    setDetailError(parent.id, null);
    try {
      await apiPost("/api/tasks", { title, parentId: parent.id });
      announce(`Subtask “${title}” added.`, "success");
      setSubtaskForms((current) => ({ ...current, [parent.id]: "" }));
      state.reload();
    } catch (error) {
      setDetailError(parent.id, errorMessage(error));
    }
  }

  async function submitLog(task: Task): Promise<void> {
    const form = logForms[task.id] ?? { minutes: "", remainingAfter: "", note: "" };
    const minutes = parseNumber(form.minutes);
    if (minutes === null || minutes <= 0) {
      setDetailError(task.id, "Enter the minutes you worked (1 or more).");
      return;
    }
    const remainingAfter = parseNumber(form.remainingAfter);
    setDetailError(task.id, null);
    setBusyId(task.id);
    try {
      await apiPost(`/api/tasks/${encodeURIComponent(task.id)}/log`, {
        minutes,
        remainingAfter,
        note: form.note,
        source: "manual",
      });
      announce(`Logged ${formatDurationMinutes(minutes)} on “${task.title}”.`, "success");
      setLogForms((current) => ({ ...current, [task.id]: { minutes: "", remainingAfter: "", note: "" } }));
      state.reload();
      void loadSessions(task.id);
    } catch (error) {
      setDetailError(task.id, errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="view">
      <h1>Tasks</h1>

      <section aria-labelledby="tasks-create">
        <h2 id="tasks-create">New task</h2>
        <form className="form-grid" onSubmit={submitCreate} noValidate>
          <TextField
            id="task-title"
            label="Title"
            value={createForm.title}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, title: value }))}
            required
            error={createError && !createForm.title ? createError : null}
          />
          <NumberField
            id="task-estimate"
            label="Estimate (minutes)"
            value={createForm.estimatedMinutes}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, estimatedMinutes: value }))}
            min={0}
            step={5}
          />
          <DateTimeField
            id="task-due"
            label="Due (optional)"
            value={createForm.dueAt}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, dueAt: value }))}
          />
          <SelectField
            id="task-priority"
            label="Priority"
            value={createForm.priority}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, priority: value }))}
            options={PRIORITY_OPTIONS}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={createBusy}>
              {createBusy ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
        {createError && createForm.title ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {createError}
          </p>
        ) : null}
      </section>

      <AsyncSection
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        loadingLabel="Loading tasks…"
        isEmpty={tasks.length === 0}
        emptyTitle="No tasks yet"
        emptyMessage="Create your first task with the form above. A title alone is enough — nothing is scheduled until you say so."
      >
        <ul className="item-list">
          {topLevel.map((task) => {
            const expanded = expandedId === task.id;
            const sessions = sessionsCache[task.id];
            const subtasks = childrenOf(task.id);
            const logForm = logForms[task.id] ?? { minutes: "", remainingAfter: "", note: "" };
            return (
              <li key={task.id} className="item item-column">
                <div className="item-head">
                  <div>
                    <strong>{task.title}</strong>{" "}
                    <span className="flag flag-info">{STATUS_LABELS[task.status]}</span>{" "}
                    <span className="muted">P{task.priority}</span>
                    <p className="muted">
                      {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : "No due date"} · Estimate{" "}
                      {formatDurationMinutes(task.estimatedMinutes)} · Remaining{" "}
                      {formatDurationMinutes(task.remainingMinutes)}
                    </p>
                  </div>
                  <div className="btn-row">
                    {task.status !== "completed" && task.status !== "cancelled" && task.status !== "in_progress" ? (
                      <button type="button" className="btn" disabled={busyId === task.id} onClick={() => void startTask(task)}>
                        Start
                      </button>
                    ) : null}
                    {task.status !== "completed" && task.status !== "cancelled" ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setConfirmError(null);
                          setConfirm({ kind: "complete", task });
                        }}
                      >
                        Complete
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      aria-expanded={expanded}
                      onClick={() => toggleDetail(task.id)}
                    >
                      {expanded ? "Hide details" : "Details"}
                    </button>
                    {editId === task.id ? null : (
                      <button type="button" className="btn" onClick={() => openEdit(task)}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editId === task.id ? (
                  <form
                    className="form-grid item-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitEdit(task);
                    }}
                    noValidate
                  >
                    <h3>Edit “{task.title}”</h3>
                    <NumberField
                      id={`edit-est-${task.id}`}
                      label="Estimate (minutes)"
                      value={editForm.estimatedMinutes}
                      onValueChange={(value) => setEditForm((form) => ({ ...form, estimatedMinutes: value }))}
                      min={0}
                      step={5}
                    />
                    <DateTimeField
                      id={`edit-due-${task.id}`}
                      label="Due date (empty clears it)"
                      value={editForm.dueAt}
                      onValueChange={(value) => setEditForm((form) => ({ ...form, dueAt: value }))}
                    />
                    <SelectField
                      id={`edit-prio-${task.id}`}
                      label="Priority"
                      value={editForm.priority}
                      onValueChange={(value) => setEditForm((form) => ({ ...form, priority: value }))}
                      options={PRIORITY_OPTIONS}
                    />
                    <SelectField
                      id={`edit-status-${task.id}`}
                      label="Status"
                      value={editForm.status}
                      onValueChange={(value) => setEditForm((form) => ({ ...form, status: value }))}
                      options={STATUS_OPTIONS}
                      hint="Only legal transitions are accepted; a deadline never completes a task by itself."
                    />
                    {editError ? (
                      <p className="field-error" role="alert">
                        <span aria-hidden="true">⚠ </span>Error: {editError}
                      </p>
                    ) : null}
                    <div className="btn-row">
                      <button type="submit" className="btn btn-primary">
                        Save changes
                      </button>
                      <button type="button" className="btn" onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                {expanded ? (
                  <div className="item-detail">
                    <h3>Subtasks ({subtasks.length})</h3>
                    {subtasks.length === 0 ? (
                      <p className="muted">No subtasks yet.</p>
                    ) : (
                      <ul className="plain-list">
                        {subtasks.map((child) => (
                          <li key={child.id}>
                            {child.title}{" "}
                            <span className="muted">
                              ({STATUS_LABELS[child.status]} · {formatDurationMinutes(child.estimatedMinutes)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form
                      className="inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitSubtask(task);
                      }}
                      noValidate
                    >
                      <TextField
                        id={`subtask-${task.id}`}
                        label="New subtask title"
                        value={subtaskForms[task.id] ?? ""}
                        onValueChange={(value) => setSubtaskForms((current) => ({ ...current, [task.id]: value }))}
                      />
                      <button type="submit" className="btn">
                        Add subtask
                      </button>
                    </form>

                    <h3>Work sessions</h3>
                    {sessions?.loading ? (
                      <p role="status">Loading sessions…</p>
                    ) : sessions?.error ? (
                      <div className="error-panel" role="alert">
                        <p>
                          <span aria-hidden="true">⚠ </span>
                          {sessions.error}
                        </p>
                        <button type="button" className="btn" onClick={() => void loadSessions(task.id)}>
                          Retry
                        </button>
                      </div>
                    ) : sessions?.data ? (
                      sessions.data.sessions.length === 0 ? (
                        <p className="muted">
                          No work logged yet. Use “Log effort” below — a manual backfill is a first-class session.
                        </p>
                      ) : (
                        <>
                          <ul className="plain-list">
                            {sessions.data.sessions.map((session) => (
                              <li key={session.id}>
                                {formatDateTime(session.startedAt)} · {formatDurationMinutes(session.minutes)} ·{" "}
                                {session.source}
                                {session.note ? ` — ${session.note}` : ""}
                              </li>
                            ))}
                          </ul>
                          <p className="muted">Actual effort so far: {formatDurationMinutes(sessions.data.actualMinutes)}.</p>
                        </>
                      )
                    ) : null}

                    <h3>Log effort</h3>
                    <form
                      className="form-grid item-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitLog(task);
                      }}
                      noValidate
                    >
                      <NumberField
                        id={`log-min-${task.id}`}
                        label="Minutes worked"
                        value={logForm.minutes}
                        onValueChange={(value) =>
                          setLogForms((current) => ({ ...current, [task.id]: { ...logForm, minutes: value } }))
                        }
                        min={1}
                        step={5}
                      />
                      <NumberField
                        id={`log-left-${task.id}`}
                        label="What’s left (minutes)"
                        value={logForm.remainingAfter}
                        onValueChange={(value) =>
                          setLogForms((current) => ({ ...current, [task.id]: { ...logForm, remainingAfter: value } }))
                        }
                        min={0}
                        hint="Your answer wins over any mechanical subtraction. Leave empty to subtract the logged minutes."
                      />
                      <TextField
                        id={`log-note-${task.id}`}
                        label="Note (optional)"
                        value={logForm.note}
                        onValueChange={(value) =>
                          setLogForms((current) => ({ ...current, [task.id]: { ...logForm, note: value } }))
                        }
                      />
                      {detailErrors[task.id] ? (
                        <p className="field-error" role="alert">
                          <span aria-hidden="true">⚠ </span>Error: {detailErrors[task.id]}
                        </p>
                      ) : null}
                      <div className="btn-row">
                        <button type="submit" className="btn btn-primary" disabled={busyId === task.id}>
                          {busyId === task.id ? "Saving…" : "Log effort"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </AsyncSection>

      <ConfirmDialog
        open={confirm !== null}
        title="Complete this task?"
        body={
          <>
            <p>
              “{confirm?.task.title}” will be marked completed. Its future planned sessions are released — your recorded
              work logs are never touched.
            </p>
            {confirmError ? (
              <p className="field-error" role="alert">
                <span aria-hidden="true">⚠ </span>Error: {confirmError}
              </p>
            ) : null}
          </>
        }
        confirmLabel="Complete task"
        busy={confirmBusy}
        onConfirm={() => {
          if (confirm) void completeTask(confirm.task);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/**
 * HabitsView — cadence-based habits with period attainment (never a "streak" judgement).
 *
 * - Create daily/weekly habits with a target and an optional linked goal.
 * - Check in, undo a check-in (delete), pause/resume (a paused habit is reported as paused,
 *   not as failed).
 * - History includes the scope note plus sessionCount / sessionMinutes from
 *   GET /api/habits/:id/history (AT34 — only sessions on tasks linked to the habit's goal count).
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "../api";
import { useAsyncData } from "../useAsyncData";
import { useStatus } from "../statusContext";
import { AsyncSection } from "../components/AsyncSection";
import { NumberField, SelectField, TextField, parseNumber } from "../components/fields";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatDateTime, formatDurationMinutes } from "../format";
import type { Goal, HabitCheckin, HabitHistoryPayload, HabitPeriod, Habit } from "../types";

interface HabitEntry {
  habit: Habit;
  period: HabitPeriod;
  history: HabitCheckin[];
}

interface HistoryEntry {
  loading: boolean;
  error: string | null;
  data: HabitHistoryPayload | null;
}

function periodSummary(entry: HabitEntry | HabitHistoryPayload): string {
  const { period } = entry;
  if (period.paused) return "Paused — pauses are reported as pauses, never as failures.";
  return `${period.done} of ${period.target} this period (${Math.round(period.attainment * 100)}% attainment)`;
}

export default function HabitsView() {
  const { announce } = useStatus();
  const state = useAsyncData<{ habits: HabitEntry[] }>(() => apiGet<{ habits: HabitEntry[] }>("/api/habits"), []);
  const goalsState = useAsyncData<{ goals: GoalViewGoal[] }>(() => apiGet<{ goals: GoalViewGoal[] }>("/api/goals"), []);

  const [createForm, setCreateForm] = useState({ title: "", cadence: "weekly", targetCount: "4", goalId: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [checkinMinutes, setCheckinMinutes] = useState<Record<string, string>>({});
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);

  const [historyCache, setHistoryCache] = useState<Record<string, HistoryEntry>>({});
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  const [pendingUndo, setPendingUndo] = useState<{ habitId: string; checkin: HabitCheckin } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  const habits = state.data?.habits ?? [];
  const goals = goalsState.data?.goals ?? [];

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const title = createForm.title.trim();
    const target = parseNumber(createForm.targetCount);
    if (!title) {
      setCreateError("Enter a habit title.");
      return;
    }
    if (target === null || target < 1) {
      setCreateError("The target must be at least 1.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      await apiPost("/api/habits", {
        title,
        cadence: createForm.cadence,
        targetCount: target,
        goalId: createForm.goalId === "" ? null : createForm.goalId,
      });
      announce(`Habit “${title}” created.`, "success");
      setCreateForm({ title: "", cadence: "weekly", targetCount: "4", goalId: "" });
      state.reload();
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreateBusy(false);
    }
  }

  async function checkIn(habit: Habit): Promise<void> {
    const minutes = parseNumber(checkinMinutes[habit.id] ?? "") ?? 0;
    setBusyHabitId(habit.id);
    try {
      await apiPost(`/api/habits/${encodeURIComponent(habit.id)}/checkins`, { minutes });
      announce(`Checked in to “${habit.title}”.`, "success");
      state.reload();
    } catch (error) {
      announce(errorMessage(error), "error");
    } finally {
      setBusyHabitId(null);
    }
  }

  async function togglePause(habit: Habit): Promise<void> {
    setBusyHabitId(habit.id);
    try {
      await apiPatch(`/api/habits/${encodeURIComponent(habit.id)}`, { paused: !habit.paused });
      announce(habit.paused ? `“${habit.title}” resumed.` : `“${habit.title}” paused.`, "success");
      state.reload();
    } catch (error) {
      announce(errorMessage(error), "error");
    } finally {
      setBusyHabitId(null);
    }
  }

  async function toggleHistory(habit: Habit): Promise<void> {
    const willOpen = openHistoryId !== habit.id;
    setOpenHistoryId(willOpen ? habit.id : null);
    if (willOpen && !historyCache[habit.id]) void loadHistory(habit.id);
  }

  async function loadHistory(habitId: string): Promise<void> {
    setHistoryCache((current) => ({
      ...current,
      [habitId]: { loading: true, error: null, data: current[habitId]?.data ?? null },
    }));
    try {
      const result = await apiGet<HabitHistoryPayload>(`/api/habits/${encodeURIComponent(habitId)}/history`);
      setHistoryCache((current) => ({ ...current, [habitId]: { loading: false, error: null, data: result } }));
    } catch (error) {
      setHistoryCache((current) => ({
        ...current,
        [habitId]: { loading: false, error: errorMessage(error), data: null },
      }));
    }
  }

  async function confirmUndo(): Promise<void> {
    if (!pendingUndo) return;
    setUndoBusy(true);
    setUndoError(null);
    try {
      await apiDelete(
        `/api/habits/${encodeURIComponent(pendingUndo.habitId)}/checkins/${encodeURIComponent(pendingUndo.checkin.id)}`,
      );
      announce("Check-in removed.", "success");
      setPendingUndo(null);
      state.reload();
      if (openHistoryId) void loadHistory(openHistoryId);
    } catch (error) {
      setUndoError(errorMessage(error));
    } finally {
      setUndoBusy(false);
    }
  }

  return (
    <div className="view">
      <h1>Habits</h1>

      <section aria-labelledby="habits-create">
        <h2 id="habits-create">New habit</h2>
        <form className="form-grid" onSubmit={submitCreate} noValidate>
          <TextField
            id="habit-title"
            label="Title"
            value={createForm.title}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, title: value }))}
            required
            error={createError && !createForm.title ? createError : null}
          />
          <SelectField
            id="habit-cadence"
            label="Cadence"
            value={createForm.cadence}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, cadence: value }))}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
          />
          <NumberField
            id="habit-target"
            label="Check-ins per period"
            value={createForm.targetCount}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, targetCount: value }))}
            min={1}
          />
          <SelectField
            id="habit-goal"
            label="Linked goal (optional)"
            value={createForm.goalId}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, goalId: value }))}
            options={[
              { value: "", label: "No linked goal" },
              ...goals.map((goal) => ({ value: goal.goal.id, label: goal.goal.title })),
            ]}
            hint="With a linked goal, work sessions on that goal’s tasks count toward this habit’s history."
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={createBusy}>
              {createBusy ? "Creating…" : "Create habit"}
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
        loadingLabel="Loading habits…"
        isEmpty={habits.length === 0}
        emptyTitle="No habits yet"
        emptyMessage="Create a habit above — a cadence, a target, and optionally a linked goal. Check in when the habit happens; nothing is counted for you automatically."
      >
        {habits.map((entry) => {
          const { habit, period } = entry;
          const history = openHistoryId === habit.id ? historyCache[habit.id] : undefined;
          return (
            <article key={habit.id} className="card" aria-label={`Habit: ${habit.title}`}>
              <header className="card-head">
                <h2>{habit.title}</h2>
                <p>
                  <span className="flag flag-info">{habit.cadence}</span>{" "}
                  {period.paused ? (
                    <span className="flag flag-warn">
                      <span aria-hidden="true">⏸ </span>Paused
                    </span>
                  ) : (
                    <strong>{periodSummary(entry)}</strong>
                  )}
                </p>
                <p className="muted">
                  Period {formatDateTime(period.periodStart)} – {formatDateTime(period.periodEnd)} · Target{" "}
                  {period.target} check-in(s) · {habit.goalId ? "Linked to a goal" : "No linked goal"}
                </p>
              </header>

              <div className="inline-form">
                <NumberField
                  id={`checkin-minutes-${habit.id}`}
                  label="Minutes for this check-in (optional)"
                  value={checkinMinutes[habit.id] ?? ""}
                  onValueChange={(value) => setCheckinMinutes((current) => ({ ...current, [habit.id]: value }))}
                  min={0}
                />
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyHabitId === habit.id}
                  onClick={() => void checkIn(habit)}
                >
                  {busyHabitId === habit.id ? "Saving…" : "Check in now"}
                </button>
                <button type="button" className="btn" disabled={busyHabitId === habit.id} onClick={() => void togglePause(habit)}>
                  {habit.paused ? "Resume habit" : "Pause habit"}
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={openHistoryId === habit.id}
                  onClick={() => void toggleHistory(habit)}
                >
                  {openHistoryId === habit.id ? "Hide history" : "Show history"}
                </button>
              </div>

              {entry.history.length > 0 ? (
                <details className="recent-checkins">
                  <summary>Recent check-ins ({entry.history.length}, last 28 days)</summary>
                  <ul className="plain-list">
                    {[...entry.history].reverse().map((checkin) => (
                      <li key={checkin.id}>
                        {formatDateTime(checkin.occurredAt)}
                        {checkin.minutes > 0 ? ` · ${formatDurationMinutes(checkin.minutes)}` : ""}{" "}
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => {
                            setUndoError(null);
                            setPendingUndo({ habitId: habit.id, checkin });
                          }}
                        >
                          Undo this check-in
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="muted">No check-ins in the last 28 days.</p>
              )}

              {openHistoryId === habit.id ? (
                <section className="proposal-section" aria-label={`History for ${habit.title}`}>
                  <h3>History &amp; scope</h3>
                  {history?.loading ? (
                    <p role="status">Loading history…</p>
                  ) : history?.error ? (
                    <div className="error-panel" role="alert">
                      <p>
                        <span aria-hidden="true">⚠ </span>
                        {history.error}
                      </p>
                      <button type="button" className="btn" onClick={() => void loadHistory(habit.id)}>
                        Retry
                      </button>
                    </div>
                  ) : history?.data ? (
                    <>
                      <p>
                        {periodSummary(history.data)} · Work sessions counted:{" "}
                        {history.data.sessionCount} ({formatDurationMinutes(history.data.sessionMinutes)}) · Scope:{" "}
                        {history.data.scope}
                      </p>
                      <p className="muted">
                        Only work sessions on tasks linked to this habit’s goal are counted, so unrelated work never
                        inflates the history.
                      </p>
                      {history.data.checkins.length > 0 ? (
                        <ul className="plain-list">
                          {history.data.checkins.map((checkin) => (
                            <li key={checkin.id}>
                              {formatDateTime(checkin.occurredAt)}
                              {checkin.minutes > 0 ? ` · ${formatDurationMinutes(checkin.minutes)}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">No check-ins recorded in this window.</p>
                      )}
                    </>
                  ) : null}
                </section>
              ) : null}
            </article>
          );
        })}
      </AsyncSection>

      <ConfirmDialog
        open={pendingUndo !== null}
        title="Undo this check-in?"
        body={
          <>
            <p>
              The check-in from {pendingUndo ? formatDateTime(pendingUndo.checkin.occurredAt) : ""} will be removed and
              the period count recalculated.
            </p>
            {undoError ? (
              <p className="field-error" role="alert">
                <span aria-hidden="true">⚠ </span>Error: {undoError}
              </p>
            ) : null}
          </>
        }
        confirmLabel="Remove check-in"
        danger
        busy={undoBusy}
        onConfirm={() => void confirmUndo()}
        onCancel={() => setPendingUndo(null)}
      />
    </div>
  );
}

/** The goals list only needs id/title for the linked-goal select; reuse the server's envelope. */
interface GoalViewGoal {
  goal: Goal;
}

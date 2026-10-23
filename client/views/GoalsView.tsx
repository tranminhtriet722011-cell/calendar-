/**
 * GoalsView — outcome tracking that never moves on its own.
 *
 * - Goal progress is an explicit outcome log (AT06); the ratio label comes from the server.
 * - PATCH warnings (AT07: metric changed on a populated goal) are shown verbatim.
 * - Breakdown is two-step: POST /breakdown returns DRAFTS ONLY which the user can edit, and only
 *   an explicit commit (POST /breakdown/commit) creates tasks (AT08).
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { apiGet, apiPatch, apiPost, errorMessage } from "../api";
import { useAsyncData } from "../useAsyncData";
import { useStatus } from "../statusContext";
import { AsyncSection } from "../components/AsyncSection";
import { DateTimeField, NumberField, SelectField, TextField, parseNumber } from "../components/fields";
import { formatDateTime, formatDurationMinutes, fromDateTimeLocal, toDateTimeLocal } from "../format";
import type {
  BreakdownResponse,
  GoalPatchResponse,
  GoalView,
  Milestone,
} from "../types";

function ratioLabel(view: GoalView): string {
  if (view.progress.ratio === null) return "Progress not measurable yet";
  return `${Math.round(view.progress.ratio * 100)}% complete`;
}

export default function GoalsView() {
  const { announce } = useStatus();
  const state = useAsyncData<{ goals: GoalView[] }>(() => apiGet<{ goals: GoalView[] }>("/api/goals"), []);

  const [createForm, setCreateForm] = useState({ title: "", metricType: "count", target: "10", dueAt: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const title = createForm.title.trim();
    const target = parseNumber(createForm.target);
    if (!title) {
      setCreateError("Enter a goal title.");
      return;
    }
    if (createForm.metricType === "count" && (target === null || target <= 0)) {
      setCreateError("A counted goal needs a target above zero.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      await apiPost("/api/goals", {
        title,
        metricType: createForm.metricType,
        target: target ?? 0,
        dueAt: fromDateTimeLocal(createForm.dueAt),
      });
      announce(`Goal “${title}” created.`, "success");
      setCreateForm({ title: "", metricType: "count", target: "10", dueAt: "" });
      state.reload();
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreateBusy(false);
    }
  }

  const goals = state.data?.goals ?? [];

  return (
    <div className="view">
      <h1>Goals</h1>

      <section aria-labelledby="goals-create">
        <h2 id="goals-create">New goal</h2>
        <form className="form-grid" onSubmit={submitCreate} noValidate>
          <TextField
            id="goal-title"
            label="Title"
            value={createForm.title}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, title: value }))}
            required
            error={createError && !createForm.title ? createError : null}
          />
          <SelectField
            id="goal-metric"
            label="How progress is measured"
            value={createForm.metricType}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, metricType: value }))}
            options={[
              { value: "count", label: "Count of outcome units" },
              { value: "milestone", label: "Milestones" },
            ]}
            hint="Counted goals track explicit outcome units; milestone goals track completed milestones."
          />
          <NumberField
            id="goal-target"
            label="Target units"
            value={createForm.target}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, target: value }))}
            min={0}
            hint="Used for counted goals."
          />
          <DateTimeField
            id="goal-due"
            label="Deadline (optional)"
            value={createForm.dueAt}
            onValueChange={(value) => setCreateForm((form) => ({ ...form, dueAt: value }))}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={createBusy}>
              {createBusy ? "Creating…" : "Create goal"}
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
        loadingLabel="Loading goals…"
        isEmpty={goals.length === 0}
        emptyTitle="No goals yet"
        emptyMessage="Create a goal above, then log outcome units when they happen. Finishing a task never moves a goal by itself — only your explicit outcome log does."
      >
        {goals.map((view) => (
          <GoalCard key={view.goal.id} view={view} onChanged={state.reload} announce={announce} />
        ))}
      </AsyncSection>
    </div>
  );
}

interface GoalCardProps {
  view: GoalView;
  onChanged: () => void;
  announce: (message: string, tone?: "info" | "success" | "error") => void;
}

function GoalCard({ view, onChanged, announce }: GoalCardProps) {
  const { goal, milestones, progress } = view;

  const [progressForm, setProgressForm] = useState({ units: "1", reason: "" });
  const [progressBusy, setProgressBusy] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    target: String(goal.target),
    metricType: goal.metricType,
    status: goal.status,
    dueAt: toDateTimeLocal(goal.dueAt),
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function submitProgress(event: FormEvent): Promise<void> {
    event.preventDefault();
    const units = parseNumber(progressForm.units);
    if (units === null || units === 0) {
      setProgressError("Enter a non-zero number of units (use a negative number to record a setback).");
      return;
    }
    setProgressBusy(true);
    setProgressError(null);
    try {
      const updated = await apiPost<GoalPatchResponse>(`/api/goals/${encodeURIComponent(goal.id)}/progress`, {
        units,
        reason: progressForm.reason,
      });
      announce(`Progress logged: ${updated.goal.current} of ${updated.goal.target}.`, "success");
      setProgressForm({ units: "1", reason: "" });
      onChanged();
    } catch (error) {
      setProgressError(errorMessage(error));
    } finally {
      setProgressBusy(false);
    }
  }

  async function submitMilestone(event: FormEvent): Promise<void> {
    event.preventDefault();
    const title = milestoneTitle.trim();
    if (!title) {
      setMilestoneError("Enter a milestone title.");
      return;
    }
    setMilestoneError(null);
    try {
      await apiPost(`/api/goals/${encodeURIComponent(goal.id)}/milestones`, { title });
      announce(`Milestone “${title}” added.`, "success");
      setMilestoneTitle("");
      onChanged();
    } catch (error) {
      setMilestoneError(errorMessage(error));
    }
  }

  async function toggleMilestone(milestone: Milestone): Promise<void> {
    try {
      await apiPatch(`/api/goals/${encodeURIComponent(goal.id)}/milestones/${encodeURIComponent(milestone.id)}`, {
        status: milestone.status === "done" ? "open" : "done",
        revision: milestone.revision,
      });
      onChanged();
    } catch (error) {
      announce(errorMessage(error), "error");
    }
  }

  async function submitEdit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const target = parseNumber(editForm.target);
    setEditBusy(true);
    setEditError(null);
    try {
      const result = await apiPatch<GoalPatchResponse>(`/api/goals/${encodeURIComponent(goal.id)}`, {
        target: target ?? goal.target,
        metricType: editForm.metricType,
        status: editForm.status,
        dueAt: fromDateTimeLocal(editForm.dueAt),
        revision: goal.revision,
        reason: "Edited by user from the Goals view",
      });
      setWarnings(result.warnings ?? []);
      announce(
        (result.warnings ?? []).length > 0
          ? "Goal updated — check the compatibility warnings."
          : "Goal updated.",
        (result.warnings ?? []).length > 0 ? "info" : "success",
      );
      onChanged();
    } catch (error) {
      setEditError(errorMessage(error));
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <article className="card" aria-label={`Goal: ${goal.title}`}>
      <header className="card-head">
        <h2>{goal.title}</h2>
        <p>
          <span className="flag flag-info">{goal.status}</span>{" "}
          <strong>{ratioLabel(view)}</strong> · {progress.unitLabel}
        </p>
        <p className="muted">
          {goal.dueAt ? `Deadline ${formatDateTime(goal.dueAt)} · ` : ""}Forecast: {progress.projected}
          {view.atRisk ? " · ⚠ At risk: deadline within 3 days and unfinished" : ""}
        </p>
        {goal.description ? <p>{goal.description}</p> : null}
        <p className="muted">
          Tasks: {view.tasks.completed}/{view.tasks.total} completed ({view.tasks.open} open) · Remaining effort{" "}
          {formatDurationMinutes(view.effort.remainingMinutes)} of {formatDurationMinutes(view.effort.plannedMinutes)}{" "}
          planned
        </p>
      </header>

      <section className="proposal-section" aria-label={`Log progress for ${goal.title}`}>
        <h3>Log progress</h3>
        <form className="inline-form" onSubmit={submitProgress} noValidate>
          <NumberField
            id={`progress-units-${goal.id}`}
            label="Outcome units (negative for a setback)"
            value={progressForm.units}
            onValueChange={(value) => setProgressForm((form) => ({ ...form, units: value }))}
          />
          <TextField
            id={`progress-reason-${goal.id}`}
            label="Reason (optional)"
            value={progressForm.reason}
            onValueChange={(value) => setProgressForm((form) => ({ ...form, reason: value }))}
          />
          <button type="submit" className="btn btn-primary" disabled={progressBusy}>
            {progressBusy ? "Logging…" : "Log progress"}
          </button>
        </form>
        {progressError ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {progressError}
          </p>
        ) : null}
      </section>

      <section className="proposal-section" aria-label={`Milestones for ${goal.title}`}>
        <h3>Milestones ({milestones.length})</h3>
        {milestones.length === 0 ? (
          <p className="muted">No milestones yet. Milestone goals count completed milestones as progress.</p>
        ) : (
          <ul className="plain-list">
            {milestones.map((milestone) => (
              <li key={milestone.id}>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => void toggleMilestone(milestone)}
                  aria-pressed={milestone.status === "done"}
                >
                  {milestone.status === "done" ? "✓ Done — reopen" : "Mark done"}
                </button>{" "}
                {milestone.title}
              </li>
            ))}
          </ul>
        )}
        <form className="inline-form" onSubmit={submitMilestone} noValidate>
          <TextField
            id={`milestone-${goal.id}`}
            label="New milestone"
            value={milestoneTitle}
            onValueChange={setMilestoneTitle}
            error={milestoneError}
          />
          <button type="submit" className="btn">
            Add milestone
          </button>
        </form>
      </section>

      <BreakdownPanel goalId={goal.id} goalTitle={goal.title} onCommitted={onChanged} announce={announce} />

      <section className="proposal-section" aria-label={`Edit ${goal.title}`}>
        <h3>Edit goal</h3>
        {warnings.length > 0 ? (
          <div className="warn-panel" role="status">
            <p>
              <strong>Compatibility warnings</strong>
            </p>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {editOpen ? (
          <form className="form-grid" onSubmit={submitEdit} noValidate>
            <SelectField
              id={`edit-metric-${goal.id}`}
              label="Metric"
              value={editForm.metricType}
              onValueChange={(value) =>
                setEditForm((form) => ({ ...form, metricType: value as "count" | "milestone" }))
              }
              options={[
                { value: "count", label: "Count of outcome units" },
                { value: "milestone", label: "Milestones" },
              ]}
            />
            <NumberField
              id={`edit-target-${goal.id}`}
              label="Target units"
              value={editForm.target}
              onValueChange={(value) => setEditForm((form) => ({ ...form, target: value }))}
              min={0}
            />
            <SelectField
              id={`edit-status-${goal.id}`}
              label="Status"
              value={editForm.status}
              onValueChange={(value) =>
                setEditForm((form) => ({
                  ...form,
                  status: value as "active" | "done" | "paused",
                }))
              }
              options={[
                { value: "active", label: "Active" },
                { value: "done", label: "Done" },
                { value: "paused", label: "Paused" },
              ]}
            />
            <DateTimeField
              id={`edit-due-${goal.id}`}
              label="Deadline (empty clears it)"
              value={editForm.dueAt}
              onValueChange={(value) => setEditForm((form) => ({ ...form, dueAt: value }))}
            />
            {editError ? (
              <p className="field-error" role="alert">
                <span aria-hidden="true">⚠ </span>Error: {editError}
              </p>
            ) : null}
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save goal"}
              </button>
              <button type="button" className="btn" onClick={() => setEditOpen(false)}>
                Close
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditForm({
                target: String(goal.target),
                metricType: goal.metricType,
                status: goal.status,
                dueAt: toDateTimeLocal(goal.dueAt),
              });
              setEditOpen(true);
            }}
          >
            Edit metric / target / status
          </button>
        )}
      </section>
    </article>
  );
}

interface DraftRow {
  title: string;
  estimatedMinutes: string;
}

interface BreakdownPanelProps {
  goalId: string;
  goalTitle: string;
  onCommitted: () => void;
  announce: (message: string, tone?: "info" | "success" | "error") => void;
}

/** Step 1 returns drafts only; nothing exists until the user commits the edited drafts. */
function BreakdownPanel({ goalId, goalTitle, onCommitted, announce }: BreakdownPanelProps) {
  const [count, setCount] = useState("5");
  const [estimate, setEstimate] = useState("60");
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const draftCount = parseNumber(count) ?? 5;
    const perTask = parseNumber(estimate) ?? 60;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<BreakdownResponse>(`/api/goals/${encodeURIComponent(goalId)}/breakdown`, {
        count: draftCount,
        estimatedMinutes: perTask,
      });
      setDrafts(result.drafts.map((draft) => ({ title: draft.title, estimatedMinutes: String(draft.estimatedMinutes) })));
      setNote(result.note);
      announce("Draft steps generated. Edit them, then commit — nothing is stored until you commit.", "info");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function commit(): Promise<void> {
    if (!drafts || drafts.length === 0) return;
    const cleaned = drafts
      .map((draft) => ({ title: draft.title.trim(), estimatedMinutes: parseNumber(draft.estimatedMinutes) ?? 0 }))
      .filter((draft) => draft.title.length > 0);
    if (cleaned.length === 0) {
      setError("Give at least one draft a title before committing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ tasks: unknown[] }>(`/api/goals/${encodeURIComponent(goalId)}/breakdown/commit`, {
        drafts: cleaned,
      });
      announce(`${result.tasks.length} task(s) created from your committed drafts.`, "success");
      setDrafts(null);
      setNote("");
      onCommitted();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="proposal-section" aria-label={`Break down ${goalTitle}`}>
      <h3>Break down into tasks</h3>
      <form className="inline-form" onSubmit={generate} noValidate>
        <NumberField
          id={`bd-count-${goalId}`}
          label="Number of steps"
          value={count}
          onValueChange={setCount}
          min={1}
          max={50}
        />
        <NumberField
          id={`bd-est-${goalId}`}
          label="Minutes per step"
          value={estimate}
          onValueChange={setEstimate}
          min={0}
          step={5}
        />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Working…" : "Suggest steps"}
        </button>
      </form>

      {drafts ? (
        <div className="draft-panel">
          <p className="flag flag-warn">
            <span aria-hidden="true">⚠ </span>
            {note || "These drafts are not stored. Nothing exists in your workspace until you commit them."}
          </p>
          <h4>Editable drafts ({drafts.length})</h4>
          <ul className="draft-list">
            {drafts.map((draft, index) => (
              <li key={index} className="inline-form">
                <TextField
                  id={`draft-title-${goalId}-${index}`}
                  label={`Draft ${index + 1} title`}
                  value={draft.title}
                  onValueChange={(value) =>
                    setDrafts((current) =>
                      current ? current.map((row, rowIdx) => (rowIdx === index ? { ...row, title: value } : row)) : current,
                    )
                  }
                />
                <NumberField
                  id={`draft-est-${goalId}-${index}`}
                  label="Estimate (min)"
                  value={draft.estimatedMinutes}
                  onValueChange={(value) =>
                    setDrafts((current) =>
                      current
                        ? current.map((row, rowIdx) => (rowIdx === index ? { ...row, estimatedMinutes: value } : row))
                        : current,
                    )
                  }
                  min={0}
                />
              </li>
            ))}
          </ul>
          {error ? (
            <p className="field-error" role="alert">
              <span aria-hidden="true">⚠ </span>Error: {error}
            </p>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void commit()}>
              {busy ? "Committing…" : `Commit ${drafts.length} draft(s) as tasks`}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDrafts(null);
                setNote("");
                setError(null);
              }}
            >
              Discard drafts
            </button>
          </div>
        </div>
      ) : null}
      {error && !drafts ? (
        <p className="field-error" role="alert">
          <span aria-hidden="true">⚠ </span>Error: {error}
        </p>
      ) : null}
    </section>
  );
}

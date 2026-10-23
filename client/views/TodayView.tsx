/**
 * TodayView — dashboard for the current day.
 *
 * - Schedule for today (GET /api/calendar/today) with the server-computed next action.
 * - Task flags (late start / overdue / overtime / at risk) rendered as text.
 * - Quick-add task (title only — AT01: nothing is silently placed on the calendar).
 * - Manual work log with the user's own "what's left" answer.
 * - "Need more time" recovery: the server answers with proposals which are only previews until
 *   the user applies or dismisses them.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { apiGet, apiPost, errorMessage } from "../api";
import { useAsyncData } from "../useAsyncData";
import { useStatus } from "../statusContext";
import { AsyncSection } from "../components/AsyncSection";
import { NumberField, SelectField, TextField, parseNumber } from "../components/fields";
import { FlagBadges } from "../components/FlagBadges";
import { FeasibilityPanel, ProposalCard } from "../components/ProposalCard";
import { formatDay, formatDurationMinutes, formatRange } from "../format";
import type { CommitResponse, Feasibility, ProposalView, Task, TaskFlags, TodayPayload, WorkSession } from "../types";

interface TodayBundle {
  today: TodayPayload;
  tasks: Task[];
  nextFlags: TaskFlags | null;
}

async function loadToday(): Promise<TodayBundle> {
  const [today, taskList] = await Promise.all([
    apiGet<TodayPayload>("/api/calendar/today"),
    apiGet<{ tasks: Task[] }>("/api/tasks"),
  ]);
  let nextFlags: TaskFlags | null = null;
  const nextTaskId = today.nextAction?.task?.id ?? today.nextAction?.block?.taskId ?? null;
  if (nextTaskId) {
    const detail = await apiGet<{ flags: TaskFlags }>(`/api/tasks/${encodeURIComponent(nextTaskId)}`);
    nextFlags = detail.flags;
  }
  return { today, tasks: taskList.tasks, nextFlags };
}

function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
}

function taskOptions(tasks: Task[], placeholder: string): { value: string; label: string }[] {
  return [{ value: "", label: placeholder }, ...openTasks(tasks).map((task) => ({ value: task.id, label: task.title }))];
}

export default function TodayView() {
  const { announce } = useStatus();
  const state = useAsyncData<TodayBundle>(loadToday, []);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const [logForm, setLogForm] = useState({ taskId: "", minutes: "25", remainingAfter: "", note: "" });
  const [logBusy, setLogBusy] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logResult, setLogResult] = useState<{ title: string; flags: TaskFlags } | null>(null);

  const [recoveryForm, setRecoveryForm] = useState({ taskId: "", extraMinutes: "30" });
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryProposals, setRecoveryProposals] = useState<ProposalView[]>([]);
  const [recoveryFeasibility, setRecoveryFeasibility] = useState<Feasibility | null>(null);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [proposalIssues, setProposalIssues] = useState<Record<string, string>>({});

  async function submitQuickAdd(event: FormEvent): Promise<void> {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) {
      setQuickError("Enter a task title.");
      return;
    }
    setQuickBusy(true);
    setQuickError(null);
    try {
      await apiPost("/api/tasks", { title });
      setQuickTitle("");
      announce(`Task “${title}” added to your inbox. Nothing is scheduled until you ask for a plan.`, "success");
      state.reload();
    } catch (error) {
      setQuickError(errorMessage(error));
    } finally {
      setQuickBusy(false);
    }
  }

  async function submitLog(event: FormEvent): Promise<void> {
    event.preventDefault();
    const minutes = parseNumber(logForm.minutes);
    const task = state.data?.tasks.find((item) => item.id === logForm.taskId) ?? null;
    if (!task) {
      setLogError("Choose the task you worked on.");
      return;
    }
    if (minutes === null || minutes <= 0) {
      setLogError("Enter the minutes you worked (1 or more).");
      return;
    }
    const remaining = parseNumber(logForm.remainingAfter);
    setLogBusy(true);
    setLogError(null);
    try {
      const result = await apiPost<{ session: WorkSession; task: Task; flags: TaskFlags }>(
        `/api/tasks/${encodeURIComponent(task.id)}/log`,
        {
          minutes,
          remainingAfter: remaining,
          note: logForm.note,
          source: "manual",
        },
      );
      setLogResult({ title: task.title, flags: result.flags });
      announce(`Logged ${formatDurationMinutes(minutes)} on “${task.title}”.`, "success");
      setLogForm({ taskId: "", minutes: "25", remainingAfter: "", note: "" });
      state.reload();
    } catch (error) {
      setLogError(errorMessage(error));
    } finally {
      setLogBusy(false);
    }
  }

  async function submitRecovery(event: FormEvent): Promise<void> {
    event.preventDefault();
    const task = state.data?.tasks.find((item) => item.id === recoveryForm.taskId) ?? null;
    const extra = parseNumber(recoveryForm.extraMinutes);
    if (!task) {
      setRecoveryError("Choose the task that needs more time.");
      return;
    }
    if (extra === null || extra < 0) {
      setRecoveryError("Enter how many extra minutes the task needs.");
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const result = await apiPost<{ proposals: ProposalView[]; feasibility: Feasibility }>(
        "/api/schedule/need-more",
        { taskId: task.id, extraMinutes: extra },
      );
      setRecoveryProposals(result.proposals);
      setRecoveryFeasibility(result.feasibility);
      setProposalIssues({});
      announce(
        result.proposals.length > 0
          ? `${result.proposals.length} recovery proposal(s) ready. Review and apply the one you want.`
          : "No recovery proposal could be generated.",
        result.proposals.length > 0 ? "success" : "error",
      );
    } catch (error) {
      setRecoveryError(errorMessage(error));
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function applyProposal(proposal: ProposalView): Promise<void> {
    setProposalBusyId(proposal.id);
    setProposalIssues((current) => ({ ...current, [proposal.id]: "" }));
    try {
      const result = await apiPost<CommitResponse>("/api/schedule/commit", { proposalId: proposal.id });
      announce(
        `Plan applied: ${result.applied.length} session(s) placed, ${result.released.length} released.`,
        "success",
      );
      setRecoveryProposals((list) => list.filter((item) => item.id !== proposal.id));
      state.reload();
    } catch (error) {
      const message = errorMessage(error);
      setProposalIssues((current) => ({ ...current, [proposal.id]: message }));
      announce(message, "error");
    } finally {
      setProposalBusyId(null);
    }
  }

  async function dismissProposal(proposal: ProposalView): Promise<void> {
    setProposalBusyId(proposal.id);
    try {
      await apiPost(`/api/schedule/proposals/${encodeURIComponent(proposal.id)}/dismiss`);
      announce("Proposal dismissed. Nothing was changed.", "info");
      setRecoveryProposals((list) => list.filter((item) => item.id !== proposal.id));
    } catch (error) {
      const message = errorMessage(error);
      setProposalIssues((current) => ({ ...current, [proposal.id]: message }));
      announce(message, "error");
    } finally {
      setProposalBusyId(null);
    }
  }

  const data = state.data;
  const taskTitle = (taskId: string): string => data?.tasks.find((task) => task.id === taskId)?.title ?? taskId;

  return (
    <div className="view">
      <h1>Today</h1>

      <AsyncSection
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        loadingLabel="Loading today’s schedule…"
        isEmpty={Boolean(data && data.today.empty.tasks && data.today.blocks.length === 0 && data.today.events.length === 0)}
        emptyTitle="A blank day — a good place to start"
        emptyMessage="Nothing is scheduled yet. Add your first task with the quick-add form below, then use “Need more time” or the Activity view to ask for a plan. Nothing gets placed on your calendar without your approval."
        emptyAction={<QuickAddHint />}
      >
        {data ? (
          <>
            <p className="lede">
              {formatDay(data.today.day.start)} · Planned {formatDurationMinutes(data.today.reflection.plannedMinutes)} ·
              Logged {formatDurationMinutes(data.today.reflection.actualMinutes)} in {data.today.reflection.sessionCount}{" "}
              session(s)
            </p>

            <section aria-labelledby="today-next">
              <h2 id="today-next">Next action</h2>
              {data.today.nextAction ? (
                <div className="card">
                  {data.today.nextAction.task ? (
                    <p className="card-title">
                      <strong>{data.today.nextAction.task.title}</strong>
                    </p>
                  ) : (
                    <p>Session for task {data.today.nextAction.block?.taskId ?? "unknown"}</p>
                  )}
                  {data.today.nextAction.block ? (
                    <p className="muted">
                      Scheduled {formatRange(data.today.nextAction.block.startAt, data.today.nextAction.block.endAt)} (
                      {formatDurationMinutes(
                        (data.today.nextAction.block.endAt - data.today.nextAction.block.startAt) / 60_000,
                      )}
                      )
                    </p>
                  ) : (
                    <p className="muted">Not on the calendar yet — pick it up whenever you are ready.</p>
                  )}
                  {data.nextFlags ? <FlagBadges flags={data.nextFlags} /> : null}
                </div>
              ) : (
                <p>
                  Nothing waiting right now. Add a task below, or rest — the plan can wait.
                </p>
              )}
            </section>

            <section aria-labelledby="today-risk">
              <h2 id="today-risk">At risk</h2>
              {data.today.atRisk.length === 0 ? (
                <p className="flag flag-ok">
                  <span aria-hidden="true">✓ </span>No task is near a deadline.
                </p>
              ) : (
                <ul className="plain-list">
                  {data.today.atRisk.map((entry) => (
                    <li key={entry.task.id}>
                      <span className="flag flag-warn">
                        <span aria-hidden="true">⚠ </span>
                        {entry.reason}
                      </span>{" "}
                      {entry.task.title}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="today-schedule">
              <h2 id="today-schedule">Today’s sessions</h2>
              {data.today.blocks.length === 0 ? (
                <p>
                  No time blocks today. Place one from the Calendar view, or ask for a plan below.
                </p>
              ) : (
                <ul className="plain-list">
                  {data.today.blocks.map((block) => (
                    <li key={block.id}>
                      <strong>{formatRange(block.startAt, block.endAt)}</strong> — {taskTitle(block.taskId)}{" "}
                      <span className="muted">({block.status})</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.today.events.length > 0 ? (
                <>
                  <h3>Fixed events &amp; rest</h3>
                  <ul className="plain-list">
                    {data.today.events.map((event) => (
                      <li key={event.id}>
                        <strong>{formatRange(event.startAt, event.endAt)}</strong> — {event.title}{" "}
                        <span className="muted">({event.kind.replace("_", " ")})</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </AsyncSection>

      <section aria-labelledby="today-quickadd">
        <h2 id="today-quickadd">Quick add task</h2>
        <form className="form-grid" onSubmit={submitQuickAdd} noValidate>
          <TextField
            id="quick-title"
            label="Task title"
            value={quickTitle}
            onValueChange={setQuickTitle}
            error={quickError}
            required
            placeholder="e.g. Draft the sprint report"
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={quickBusy}>
              {quickBusy ? "Adding…" : "Add task"}
            </button>
          </div>
        </form>
        <p className="field-hint">A title is enough: the task lands in your inbox and is never scheduled silently.</p>
      </section>

      <section aria-labelledby="today-log">
        <h2 id="today-log">Log work</h2>
        <form className="form-grid" onSubmit={submitLog} noValidate>
          <SelectField
            id="log-task"
            label="Task you worked on"
            value={logForm.taskId}
            onValueChange={(value) => setLogForm((form) => ({ ...form, taskId: value }))}
            options={taskOptions(data?.tasks ?? [], "Choose a task…")}
            error={logError && !logForm.taskId ? logError : null}
          />
          <NumberField
            id="log-minutes"
            label="Minutes worked"
            value={logForm.minutes}
            onValueChange={(value) => setLogForm((form) => ({ ...form, minutes: value }))}
            min={1}
            step={5}
            required
          />
          <NumberField
            id="log-remaining"
            label="What’s left (minutes)"
            value={logForm.remainingAfter}
            onValueChange={(value) => setLogForm((form) => ({ ...form, remainingAfter: value }))}
            min={0}
            step={5}
            hint="Your answer wins over any mechanical estimate. Leave empty to subtract the logged minutes."
          />
          <TextField
            id="log-note"
            label="Note (optional)"
            value={logForm.note}
            onValueChange={(value) => setLogForm((form) => ({ ...form, note: value }))}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={logBusy}>
              {logBusy ? "Saving…" : "Save work log"}
            </button>
          </div>
        </form>
        {logError && logForm.taskId ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {logError}
          </p>
        ) : null}
        {logResult ? (
          <div className="card" role="status">
            <p className="card-title">
              Work log recorded for “{logResult.title}”.
            </p>
            <FlagBadges flags={logResult.flags} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="today-recovery">
        <h2 id="today-recovery">Need more time</h2>
        <p className="field-hint">
          Tell the scheduler a task needs extra time. It answers with proposals only — your calendar changes when (and
          only when) you apply one.
        </p>
        <form className="form-grid" onSubmit={submitRecovery} noValidate>
          <SelectField
            id="recovery-task"
            label="Task that needs more time"
            value={recoveryForm.taskId}
            onValueChange={(value) => setRecoveryForm((form) => ({ ...form, taskId: value }))}
            options={taskOptions(data?.tasks ?? [], "Choose a task…")}
          />
          <NumberField
            id="recovery-minutes"
            label="Extra minutes needed"
            value={recoveryForm.extraMinutes}
            onValueChange={(value) => setRecoveryForm((form) => ({ ...form, extraMinutes: value }))}
            min={0}
            step={15}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={recoveryBusy}>
              {recoveryBusy ? "Asking the scheduler…" : "Ask for recovery proposals"}
            </button>
          </div>
        </form>
        {recoveryError ? (
          <div className="error-panel" role="alert">
            <p>
              <span aria-hidden="true">⚠ </span>
              {recoveryError}
            </p>
          </div>
        ) : null}
        {recoveryFeasibility ? <FeasibilityPanel feasibility={recoveryFeasibility} /> : null}
        {recoveryProposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            busy={proposalBusyId === proposal.id}
            issue={proposalIssues[proposal.id] || null}
            onApply={(item) => void applyProposal(item)}
            onDismiss={(item) => void dismissProposal(item)}
          />
        ))}
      </section>
    </div>
  );
}

function QuickAddHint() {
  return <p className="muted">Use the “Quick add task” form below to capture your first task.</p>;
}

/**
 * CalendarView — day/week range of events and time blocks with free time.
 *
 * Conflict policy (AT09/AT10, spec F3/H3): the server returns conflicts and never applies them
 * silently. A hard conflict (fixed/locked event) requires an explicit override plus a separate
 * confirmation; protected rest can never be overridden. The UI mirrors that with a warning panel
 * and a deliberate two-step confirm flow.
 */

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "../api";
import { useAsyncData } from "../useAsyncData";
import { useStatus } from "../statusContext";
import { AsyncSection } from "../components/AsyncSection";
import { CheckboxField, DateTimeField, SelectField, TextField } from "../components/fields";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatDateTime, formatDurationMinutes, fromDateTimeLocal, nextHourRange, startOfDay, startOfWeek, toDateTimeLocal } from "../format";
import type { Block, BlockConflictDetails, CalendarEvent, CalendarPayload, OverlapFinding, Task } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface CalendarBundle {
  calendar: CalendarPayload;
  tasks: Task[];
}

function loadCalendar(from: number, to: number): Promise<CalendarBundle> {
  return Promise.all([
    apiGet<CalendarPayload>("/api/calendar", { from, to }),
    apiGet<{ tasks: Task[] }>("/api/tasks"),
  ]).then(([calendar, taskList]) => ({ calendar, tasks: taskList.tasks }));
}

function kindLabel(kind: CalendarEvent["kind"]): string {
  if (kind === "rest_protected") return "Protected rest";
  if (kind === "rest_soft") return "Soft rest";
  return "Fixed event";
}

function conflictLabel(finding: OverlapFinding): string {
  if (finding.kind === "rest_protected") return "Protected rest";
  if (finding.kind === "block") return "Existing session";
  return finding.locked ? "Fixed (locked) event" : "Event";
}

interface PendingOverride {
  message: string;
  conflicts: OverlapFinding[];
  acknowledged: boolean;
}

export default function CalendarView() {
  const { announce } = useStatus();

  const [mode, setMode] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const range = useMemo(() => {
    if (mode === "day") return { from: anchor, to: anchor + DAY_MS };
    const weekStart = startOfWeek(anchor);
    return { from: weekStart, to: weekStart + 7 * DAY_MS };
  }, [mode, anchor]);

  const state = useAsyncData<CalendarBundle>(() => loadCalendar(range.from, range.to), [range.from, range.to]);

  const defaultTimes = useMemo(() => nextHourRange(), []);
  const [eventForm, setEventForm] = useState(() => ({
    title: "",
    kind: "fixed",
    start: toDateTimeLocal(defaultTimes.start),
    end: toDateTimeLocal(defaultTimes.end),
  }));
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventWarning, setEventWarning] = useState<string | null>(null);

  const [blockForm, setBlockForm] = useState(() => ({
    taskId: "",
    start: toDateTimeLocal(defaultTimes.start),
    end: toDateTimeLocal(defaultTimes.end),
  }));
  const [blockError, setBlockError] = useState<string | null>(null);
  const [pendingOverride, setPendingOverride] = useState<PendingOverride | null>(null);

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ start: "", end: "", adjustEstimate: false });
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingEditOverride, setPendingEditOverride] = useState<PendingOverride | null>(null);

  const [dialog, setDialog] = useState<
    | { kind: "deleteEvent"; event: CalendarEvent }
    | { kind: "releaseBlock"; block: Block }
    | null
  >(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const tasks = state.data?.tasks ?? [];
  const taskTitle = (taskId: string): string => tasks.find((task) => task.id === taskId)?.title ?? taskId;

  function shiftAnchor(direction: number): void {
    setAnchor((current) => current + direction * (mode === "day" ? DAY_MS : 7 * DAY_MS));
  }

  async function submitEvent(form: typeof eventForm): Promise<void> {
    const title = form.title.trim();
    const startAt = fromDateTimeLocal(form.start);
    const endAt = fromDateTimeLocal(form.end);
    if (!title) {
      setEventError("Enter a title for the event.");
      return;
    }
    if (startAt === null || endAt === null || endAt <= startAt) {
      setEventError("The event must end after it starts.");
      return;
    }
    setEventError(null);
    setEventWarning(null);
    try {
      const result = await apiPost<{ event: CalendarEvent; conflicts: OverlapFinding[] }>("/api/calendar/events", {
        title,
        kind: form.kind,
        startAt,
        endAt,
      });
      if (result.conflicts.length > 0) {
        setEventWarning(
          `Event created, but it overlaps: ${result.conflicts
            .map((conflict) => `“${conflict.label}” ${formatDateTime(conflict.start)}–${formatDateTime(conflict.end)}`)
            .join("; ")}.`,
        );
      }
      announce(`Event “${result.event.title}” created.`, result.conflicts.length > 0 ? "info" : "success");
      setEventForm({
        title: "",
        kind: form.kind,
        start: toDateTimeLocal(defaultTimes.start),
        end: toDateTimeLocal(defaultTimes.end),
      });
      state.reload();
    } catch (error) {
      setEventError(errorMessage(error));
    }
  }

  /** Create a block; on a hard conflict, stop and surface the explicit override flow. */
  async function submitBlock(payload: { taskId: string; startAt: number; endAt: number }, override: boolean): Promise<void> {
    setBlockError(null);
    setPendingOverride(null);
    try {
      const body = override ? { ...payload, override: true, confirm: true } : payload;
      const result = await apiPost<{ block: Block; conflicts: OverlapFinding[] }>("/api/calendar/blocks", body);
      announce(
        override
          ? "Block placed with an override — the exception was recorded in your activity log."
          : "Time block created.",
        override ? "info" : "success",
      );
      if (result.conflicts.length > 0 && !override) {
        announce(`Block created, but it overlaps ${result.conflicts.length} softer item(s).`, "info");
      }
      setBlockForm((form) => ({ ...form, taskId: "" }));
      state.reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const details = (error.details ?? null) as BlockConflictDetails | null;
        if (details?.canOverride && !override) {
          setPendingOverride({ message: error.message, conflicts: details.conflicts ?? [], acknowledged: false });
          announce(error.message, "error");
          return;
        }
      }
      setBlockError(errorMessage(error));
      announce(errorMessage(error), "error");
    }
  }

  function submitBlockForm(event: FormEvent): void {
    event.preventDefault();
    const startAt = fromDateTimeLocal(blockForm.start);
    const endAt = fromDateTimeLocal(blockForm.end);
    if (!blockForm.taskId) {
      setBlockError("Choose the task to schedule.");
      return;
    }
    if (startAt === null || endAt === null || endAt <= startAt) {
      setBlockError("The block must end after it starts.");
      return;
    }
    void submitBlock({ taskId: blockForm.taskId, startAt, endAt }, false);
  }

  function openEdit(block: Block): void {
    setEditingBlockId(block.id);
    setEditForm({ start: toDateTimeLocal(block.startAt), end: toDateTimeLocal(block.endAt), adjustEstimate: false });
    setEditError(null);
    setPendingEditOverride(null);
  }

  /** Move/resize a block; the task estimate is untouched unless the user asks for it. */
  async function submitEdit(block: Block, override: boolean): Promise<void> {
    const startAt = fromDateTimeLocal(editForm.start);
    const endAt = fromDateTimeLocal(editForm.end);
    if (startAt === null || endAt === null || endAt <= startAt) {
      setEditError("The block must end after it starts.");
      return;
    }
    setEditError(null);
    setPendingEditOverride(null);
    try {
      const body: Record<string, unknown> = { startAt, endAt };
      if (override) {
        // The checkbox the user ticked is the explicit confirmation the server demands on every
        // override path (AT10, review REV-005) — flag alone is never enough.
        body.override = true;
        body.confirm = true;
        body.adjustEstimate = editForm.adjustEstimate;
      } else if (editForm.adjustEstimate) {
        body.adjustEstimate = true;
      }
      const result = await apiPatch<{ block: Block; estimateChanged: boolean; conflicts: OverlapFinding[] }>(
        `/api/calendar/blocks/${encodeURIComponent(block.id)}`,
        body,
      );
      announce(
        result.estimateChanged
          ? "Block moved and the task estimate was adjusted with it."
          : "Block moved. The task estimate was not changed.",
        "success",
      );
      setEditingBlockId(null);
      state.reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const details = (error.details ?? null) as BlockConflictDetails | null;
        if (details?.canOverride && !override) {
          setPendingEditOverride({ message: error.message, conflicts: details.conflicts ?? [], acknowledged: false });
          announce(error.message, "error");
          return;
        }
      }
      setEditError(errorMessage(error));
      announce(errorMessage(error), "error");
    }
  }

  async function confirmDialogAction(): Promise<void> {
    if (!dialog) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (dialog.kind === "deleteEvent") {
        // REV-021: a locked event cannot be deleted (the server refuses without an explicit force).
        // Say so up front instead of promising a removal that would bounce off a 409.
        if (dialog.event.locked) {
          setDialogError("This event is locked. Unlock it first, then delete it.");
          return;
        }
        await apiDelete(`/api/calendar/events/${encodeURIComponent(dialog.event.id)}`);
        announce(`Event “${dialog.event.title}” deleted. You can restore it from Activity.`, "success");
      } else {
        await apiDelete(`/api/calendar/blocks/${encodeURIComponent(dialog.block.id)}`);
        announce("Time block released. You can restore it from Activity.", "success");
      }
      setDialog(null);
      state.reload();
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally {
      setDialogBusy(false);
    }
  }

  async function toggleEventLock(event: CalendarEvent): Promise<void> {
    try {
      await apiPatch(`/api/calendar/events/${encodeURIComponent(event.id)}`, { locked: !event.locked });
      announce(event.locked ? "Event unlocked." : "Event locked.", "success");
      state.reload();
    } catch (error) {
      announce(errorMessage(error), "error");
    }
  }

  const calendar = state.data?.calendar ?? null;

  return (
    <div className="view">
      <h1>Calendar</h1>

      <div className="toolbar" role="group" aria-label="Calendar range">
        <button
          type="button"
          className={mode === "day" ? "btn btn-primary" : "btn"}
          aria-pressed={mode === "day"}
          onClick={() => setMode("day")}
        >
          Day
        </button>
        <button
          type="button"
          className={mode === "week" ? "btn btn-primary" : "btn"}
          aria-pressed={mode === "week"}
          onClick={() => setMode("week")}
        >
          Week
        </button>
        <button type="button" className="btn" onClick={() => shiftAnchor(-1)}>
          <span aria-hidden="true">← </span>Previous {mode}
        </button>
        <button type="button" className="btn" onClick={() => setAnchor(startOfDay(Date.now()))}>
          Today
        </button>
        <button type="button" className="btn" onClick={() => shiftAnchor(1)}>
          Next {mode}<span aria-hidden="true"> →</span>
        </button>
      </div>

      <AsyncSection
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        loadingLabel="Loading the calendar…"
        isEmpty={Boolean(calendar && calendar.events.length === 0 && calendar.blocks.length === 0)}
        emptyTitle="No events or sessions in this range"
        emptyMessage="Add a fixed event or rest period below, or place a time block for a task. Free working time is listed above the forms."
      >
        {calendar ? (
          <>
            <section aria-labelledby="cal-free">
              <h2 id="cal-free">Free time</h2>
              <p className="lede">
                {formatDurationMinutes(calendar.freeMinutes)} free between {formatDateTime(calendar.range.from)} and{" "}
                {formatDateTime(calendar.range.to)}.
              </p>
              {calendar.free.length === 0 ? (
                <p>No free working time remains in this range — every window is booked or outside working hours.</p>
              ) : (
                <ul className="plain-list">
                  {calendar.free.map((rangeItem) => (
                    <li key={rangeItem.start}>
                      {formatDateTime(rangeItem.start)} – {formatDateTime(rangeItem.end)} (
                      {formatDurationMinutes((rangeItem.end - rangeItem.start) / 60_000)})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="cal-events">
              <h2 id="cal-events">Events</h2>
              {calendar.events.length === 0 ? (
                <p>No events in this range. Create one below — fixed events are hard obstacles the scheduler never overrides.</p>
              ) : (
                <ul className="item-list">
                  {calendar.events.map((item) => (
                    <li key={item.id} className="item">
                      <div>
                        <strong>{item.title}</strong>{" "}
                        <span className="flag flag-info">{kindLabel(item.kind)}</span>{" "}
                        {item.locked ? (
                          <span className="flag flag-warn">
                            <span aria-hidden="true">🔒 </span>Locked
                          </span>
                        ) : null}
                        <p className="muted">
                          {formatDateTime(item.startAt)} – {formatDateTime(item.endAt)} (
                          {formatDurationMinutes((item.endAt - item.startAt) / 60_000)})
                        </p>
                      </div>
                      <div className="btn-row">
                        <button type="button" className="btn" onClick={() => void toggleEventLock(item)}>
                          {item.locked ? "Unlock" : "Lock"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            setDialogError(null);
                            setDialog({ kind: "deleteEvent", event: item });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="cal-blocks">
              <h2 id="cal-blocks">Time blocks</h2>
              {calendar.blocks.length === 0 ? (
                <p>No time blocks in this range. Place one with the form below — conflicts are always shown, never applied silently.</p>
              ) : (
                <ul className="item-list">
                  {calendar.blocks.map((block) => (
                    <li key={block.id} className="item">
                      <div>
                        <strong>{taskTitle(block.taskId)}</strong>{" "}
                        <span className="flag flag-info">{block.status}</span>{" "}
                        <span className="muted">({block.source})</span>
                        <p className="muted">
                          {formatDateTime(block.startAt)} – {formatDateTime(block.endAt)} (
                          {formatDurationMinutes((block.endAt - block.startAt) / 60_000)})
                        </p>
                      </div>
                      <div className="btn-row">
                        <button type="button" className="btn" onClick={() => openEdit(block)}>
                          Move / edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            setDialogError(null);
                            setDialog({ kind: "releaseBlock", block });
                          }}
                        >
                          Release
                        </button>
                      </div>
                      {editingBlockId === block.id ? (
                        <form
                          className="form-grid item-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitEdit(block, false);
                          }}
                          noValidate
                        >
                          <h3>Move or resize this block</h3>
                          <DateTimeField
                            id={`edit-start-${block.id}`}
                            label="New start"
                            value={editForm.start}
                            onValueChange={(value) => setEditForm((form) => ({ ...form, start: value }))}
                          />
                          <DateTimeField
                            id={`edit-end-${block.id}`}
                            label="New end"
                            value={editForm.end}
                            onValueChange={(value) => setEditForm((form) => ({ ...form, end: value }))}
                          />
                          <CheckboxField
                            id={`edit-adjust-${block.id}`}
                            label="Also adjust the task estimate by the same number of minutes"
                            checked={editForm.adjustEstimate}
                            onCheckedChange={(checked) => setEditForm((form) => ({ ...form, adjustEstimate: checked }))}
                            hint="Off by default: resizing a block changes the allocation, not your estimate."
                          />
                          {pendingEditOverride ? (
                            <div className="error-panel" role="alert">
                              <p>
                                <strong>Scheduling conflict.</strong> {pendingEditOverride.message}
                              </p>
                              <p className="flag flag-warn">
                                <span aria-hidden="true">⚠ </span>Warning: moving this block on top of a fixed event
                                double-books that time. The exception is recorded in your activity log.
                              </p>
                              <ul>
                                {pendingEditOverride.conflicts.map((conflict) => (
                                  <li key={conflict.id}>
                                    {conflictLabel(conflict)} “{conflict.label}” — {formatDateTime(conflict.start)} –{" "}
                                    {formatDateTime(conflict.end)}
                                  </li>
                                ))}
                              </ul>
                              <CheckboxField
                                id={`edit-override-ack-${block.id}`}
                                label="I understand this overlaps a fixed event and I want to move the block anyway"
                                checked={pendingEditOverride.acknowledged}
                                onCheckedChange={(checked) =>
                                  setPendingEditOverride((current) =>
                                    current ? { ...current, acknowledged: checked } : current,
                                  )
                                }
                              />
                              <div className="btn-row">
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={!pendingEditOverride.acknowledged}
                                  onClick={() => void submitEdit(block, true)}
                                >
                                  Move anyway (override)
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => setPendingEditOverride(null)}
                                >
                                  Keep my block where it is
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {editError ? (
                            <p className="field-error" role="alert">
                              <span aria-hidden="true">⚠ </span>Error: {editError}
                            </p>
                          ) : null}
                          <div className="btn-row">
                            <button type="submit" className="btn btn-primary">
                              Save block
                            </button>
                            <button type="button" className="btn" onClick={() => setEditingBlockId(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </AsyncSection>

      <section aria-labelledby="cal-new-event">
        <h2 id="cal-new-event">New event</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEvent(eventForm);
          }}
          noValidate
        >
          <TextField
            id="event-title"
            label="Title"
            value={eventForm.title}
            onValueChange={(value) => setEventForm((form) => ({ ...form, title: value }))}
            required
            error={eventError && !eventForm.title ? eventError : null}
          />
          <SelectField
            id="event-kind"
            label="Kind"
            value={eventForm.kind}
            onValueChange={(value) => setEventForm((form) => ({ ...form, kind: value }))}
            options={[
              { value: "fixed", label: "Fixed event (hard obstacle)" },
              { value: "rest_soft", label: "Soft rest (scheduler avoids, but may use)" },
              { value: "rest_protected", label: "Protected rest (never scheduled over)" },
            ]}
          />
          <DateTimeField
            id="event-start"
            label="Starts"
            value={eventForm.start}
            onValueChange={(value) => setEventForm((form) => ({ ...form, start: value }))}
          />
          <DateTimeField
            id="event-end"
            label="Ends"
            value={eventForm.end}
            onValueChange={(value) => setEventForm((form) => ({ ...form, end: value }))}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">
              Create event
            </button>
          </div>
        </form>
        {eventError && eventForm.title ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {eventError}
          </p>
        ) : null}
        {eventWarning ? (
          <div className="warn-panel" role="status">
            <p>
              <span aria-hidden="true">⚠ </span>
              {eventWarning}
            </p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="cal-new-block">
        <h2 id="cal-new-block">Place a time block</h2>
        <form className="form-grid" onSubmit={submitBlockForm} noValidate>
          <SelectField
            id="block-task"
            label="Task"
            value={blockForm.taskId}
            onValueChange={(value) => setBlockForm((form) => ({ ...form, taskId: value }))}
            options={[
              { value: "", label: "Choose a task…" },
              ...tasks.map((task) => ({ value: task.id, label: task.title })),
            ]}
          />
          <DateTimeField
            id="block-start"
            label="Starts"
            value={blockForm.start}
            onValueChange={(value) => setBlockForm((form) => ({ ...form, start: value }))}
          />
          <DateTimeField
            id="block-end"
            label="Ends"
            value={blockForm.end}
            onValueChange={(value) => setBlockForm((form) => ({ ...form, end: value }))}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">
              Place block
            </button>
          </div>
        </form>
        {blockError ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {blockError}
          </p>
        ) : null}
        {pendingOverride ? (
          <div className="error-panel" role="alert">
            <p>
              <strong>Scheduling conflict.</strong> {pendingOverride.message}
            </p>
            <p className="flag flag-warn">
              <span aria-hidden="true">⚠ </span>Warning: placing this block on top of a fixed event double-books that
              time. The exception is recorded in your activity log.
            </p>
            <ul>
              {pendingOverride.conflicts.map((conflict) => (
                <li key={conflict.id}>
                  {conflictLabel(conflict)} “{conflict.label}” — {formatDateTime(conflict.start)} –{" "}
                  {formatDateTime(conflict.end)}
                </li>
              ))}
            </ul>
            <CheckboxField
              id="block-override-ack"
              label="I understand this overlaps a fixed event and I want to place the block anyway"
              checked={pendingOverride.acknowledged}
              onCheckedChange={(checked) =>
                setPendingOverride((current) => (current ? { ...current, acknowledged: checked } : current))
              }
            />
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-danger"
                disabled={!pendingOverride.acknowledged}
                onClick={() =>
                  void submitBlock(
                    {
                      taskId: blockForm.taskId,
                      startAt: fromDateTimeLocal(blockForm.start) ?? 0,
                      endAt: fromDateTimeLocal(blockForm.end) ?? 0,
                    },
                    true,
                  )
                }
              >
                Place anyway (override)
              </button>
              <button type="button" className="btn" onClick={() => setPendingOverride(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.kind === "deleteEvent" ? "Delete this event?" : "Release this time block?"}
        body={
          dialog?.kind === "deleteEvent" ? (
            dialog.event.locked ? (
              <p>
                “{dialog.event.title}” is <strong>locked</strong>, so it cannot be deleted yet — nothing will be changed.
                Unlock it first from the event list, then delete it.
              </p>
            ) : (
              <p>
                “{dialog.event.title}” ({formatDateTime(dialog.event.startAt)} – {formatDateTime(dialog.event.endAt)}){" "}
                will be removed from your calendar. You can restore it from the Activity view.
              </p>
            )
          ) : dialog ? (
            <p>
              The session for {taskTitle(dialog.block.taskId)} (
              {formatDateTime(dialog.block.startAt)} – {formatDateTime(dialog.block.endAt)}) will be released. The time
              returns to the free pool and the release stays auditable.
            </p>
          ) : null
        }
        confirmLabel={
          dialog?.kind === "deleteEvent" ? (dialog.event.locked ? "Close" : "Delete event") : "Release block"
        }
        danger={!(dialog?.kind === "deleteEvent" && dialog.event.locked)}
        busy={dialogBusy}
        onConfirm={() => {
          // REV-021: a locked event cannot be deleted, so this dialog only explains that and
          // closes — no request is fired, nothing can change behind the user's back.
          if (dialog?.kind === "deleteEvent" && dialog.event.locked) {
            setDialog(null);
            return;
          }
          void confirmDialogAction();
        }}
        onCancel={() => setDialog(null)}
      />
      {dialogError ? (
        <div className="error-panel" role="alert">
          <p>
            <span aria-hidden="true">⚠ </span>
            {dialogError}
          </p>
        </div>
      ) : null}
    </div>
  );
}

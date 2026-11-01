/**
 * SettingsView — account settings over the existing `PATCH /api/auth/settings` contract (D-042).
 *
 * Scope is limited to fields the API already stores: time zone, working hours (start/end/days),
 * protected soft rest (enabled/start/end) and the scheduling grace window. The master-spec
 * Settings branches for AI permissions, notifications and connected calendars have no backing API
 * and are deliberately absent — this screen never implies them.
 *
 * The SERVER is the single source of truth for validation. This view sends the whole settings
 * object in one PATCH and surfaces any 400 by field via `role="alert"`; it does not duplicate the
 * validation rules as blocking client logic, so what the user sees always matches what the server
 * enforces (and the invalid classes are exercised end-to-end through the real contract). Because
 * the PATCH is atomic server-side (a 400 anywhere leaves the stored settings byte-identical), a
 * rejected save applies nothing — there is no partial save to undo.
 *
 * "Download my data" is backed by `GET /api/export`, which answers with a JSON attachment. It is
 * fetched with the bearer token (never placed in a URL) and saved through a Blob so credentials
 * stay out of the address bar.
 *
 * Disclosure: settings carry no revision field, so — unlike tasks and calendar blocks — there is
 * no optimistic-concurrency (stale-edit) guard on this screen; concurrent edits are last-write-wins
 * per the API contract. This is stated rather than faked.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiPatch, errorMessage, getToken } from "../api";
import { useStatus } from "../statusContext";
import { CheckboxField, NumberField, TextField } from "../components/fields";
import type { User } from "../types";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Server `details.field` → this view's control id, so a 400 lands on the offending input. */
const FIELD_TO_CONTROL: Record<string, string> = {
  "settings.workingHours.start": "settings-wh-start",
  "settings.workingHours.end": "settings-wh-end",
  "settings.softRest.start": "settings-rest-start",
  "settings.softRest.end": "settings-rest-end",
  "settings.graceMinutes": "settings-grace",
  timezone: "settings-timezone",
};

/** Control id → the label a screen reader should hear named in the form-level alert. */
const CONTROL_LABELS: Record<string, string> = {
  "settings-timezone": "Time zone",
  "settings-wh-start": "Working hours start",
  "settings-wh-end": "Working hours end",
  "settings-rest-start": "Rest starts",
  "settings-rest-end": "Rest ends",
  "settings-grace": "Late-start grace (minutes)",
};

interface SettingsViewProps {
  user: User;
  onUserUpdated: (user: User) => void;
}

export default function SettingsView({ user, onUserUpdated }: SettingsViewProps) {
  const { announce } = useStatus();

  const [timezone, setTimezone] = useState(user.timezone);
  const [whStart, setWhStart] = useState(user.settings.workingHours.start);
  const [whEnd, setWhEnd] = useState(user.settings.workingHours.end);
  const [days, setDays] = useState<number[]>([...user.settings.workingHours.days]);
  const [restEnabled, setRestEnabled] = useState(user.settings.softRest.enabled);
  const [restStart, setRestStart] = useState(user.settings.softRest.start);
  const [restEnd, setRestEnd] = useState(user.settings.softRest.end);
  // Kept as the raw input string so an empty or malformed value reaches the server and is
  // rejected there (named, 400) instead of being silently coerced to a number here.
  const [grace, setGrace] = useState(String(user.settings.graceMinutes));

  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function toggleDay(day: number, checked: boolean): void {
    setDays((current) => {
      const next = checked ? [...current, day] : current.filter((value) => value !== day);
      return next.sort((a, b) => a - b);
    });
    setSaved(false);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    setSaved(false);

    // The grace value is forwarded as the user left it: "" and non-numeric text reach the server
    // as-is (both are 400s naming the field), while a real number is sent as a number so the
    // server's 0–120 bounds and rounding apply. Nothing is coerced or clamped on the client.
    const graceRaw = grace.trim();
    const gracePayload = graceRaw === "" ? "" : Number.isFinite(Number(graceRaw)) ? Number(graceRaw) : graceRaw;

    try {
      const result = await apiPatch<{ user: User }>("/api/auth/settings", {
        timezone,
        settings: {
          workingHours: { start: whStart, end: whEnd, days },
          softRest: { enabled: restEnabled, start: restStart, end: restEnd },
          graceMinutes: gracePayload,
        },
      });
      // Re-seed the form from the server's persisted view (the single source of truth), so the
      // screen can never drift from what was actually stored.
      const updated = result.user;
      setTimezone(updated.timezone);
      setWhStart(updated.settings.workingHours.start);
      setWhEnd(updated.settings.workingHours.end);
      setDays([...updated.settings.workingHours.days]);
      setRestEnabled(updated.settings.softRest.enabled);
      setRestStart(updated.settings.softRest.start);
      setRestEnd(updated.settings.softRest.end);
      setGrace(String(updated.settings.graceMinutes));
      onUserUpdated(updated);
      setSaved(true);
      announce("Settings saved.", "success");
    } catch (error) {
      const message = errorMessage(error);
      if (error instanceof ApiError && error.status === 400) {
        const serverField = (error.details as { field?: string } | null)?.field;
        const control = serverField ? FIELD_TO_CONTROL[serverField] : undefined;
        if (control) {
          setFieldErrors({ [control]: message });
          // Name the offending control on the assertive channel too, in human terms, so a
          // screen-reader user hears WHICH field was refused and not just the server string.
          setFormError(`${CONTROL_LABELS[control]}: ${message}`);
        } else {
          setFormError(message);
        }
      } else {
        setFormError(message);
      }
      announce(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function downloadData(): Promise<void> {
    setExportBusy(true);
    setExportError(null);
    try {
      const token = getToken();
      const response = await fetch("/api/export", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Export failed with status ${response.status}.`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ape-export-${user.username}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Defer the revoke: revoking synchronously right after click() cancels the download in
      // some browsers (older Firefox); a macrotask is enough for every current engine.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      announce("Your data has been downloaded.", "success");
    } catch (error) {
      const message = errorMessage(error);
      setExportError(message);
      announce(message, "error");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="view">
      <h1>Settings</h1>
      <p className="lede">
        Working hours, protected rest and the scheduling grace window the planner uses. Changes apply to future
        scheduling; nothing already on your calendar is moved by saving settings.
      </p>

      <form className="form-grid settings-form" onSubmit={submit} noValidate>
        <TextField
          id="settings-timezone"
          label="Time zone"
          value={timezone}
          onValueChange={(value) => {
            setTimezone(value);
            setSaved(false);
          }}
          error={fieldErrors["settings-timezone"]}
          hint="IANA name, e.g. Asia/Ho_Chi_Minh. Working windows and day boundaries are computed in this zone."
        />

        <TextField
          id="settings-wh-start"
          label="Working hours start"
          type="time"
          value={whStart}
          onValueChange={(value) => {
            setWhStart(value);
            setSaved(false);
          }}
          error={fieldErrors["settings-wh-start"]}
          hint="Time in HH:mm. Must be before the end time."
        />
        <TextField
          id="settings-wh-end"
          label="Working hours end"
          type="time"
          value={whEnd}
          onValueChange={(value) => {
            setWhEnd(value);
            setSaved(false);
          }}
          error={fieldErrors["settings-wh-end"]}
          hint="Time in HH:mm. Must be after the start time."
        />

        <NumberField
          id="settings-grace"
          label="Late-start grace (minutes)"
          value={grace}
          onValueChange={(value) => {
            setGrace(value);
            setSaved(false);
          }}
          min={0}
          max={120}
          step={1}
          error={fieldErrors["settings-grace"]}
          hint="Whole minutes (0–120) after a session's scheduled start before it is flagged as a late start."
        />

        <CheckboxField
          id="settings-rest-enabled"
          label="Protect a daily rest window"
          checked={restEnabled}
          onCheckedChange={(checked) => {
            setRestEnabled(checked);
            setSaved(false);
          }}
          hint="When on, the scheduler treats this window as protected rest and never places work inside it."
        />
        <TextField
          id="settings-rest-start"
          label="Rest starts"
          type="time"
          value={restStart}
          onValueChange={(value) => {
            setRestStart(value);
            setSaved(false);
          }}
          error={fieldErrors["settings-rest-start"]}
          hint="Time in HH:mm. Must be before the rest end."
        />
        <TextField
          id="settings-rest-end"
          label="Rest ends"
          type="time"
          value={restEnd}
          onValueChange={(value) => {
            setRestEnd(value);
            setSaved(false);
          }}
          error={fieldErrors["settings-rest-end"]}
          hint="Time in HH:mm. Must be after the rest start."
        />

        <fieldset className="settings-days">
          <legend>Working days</legend>
          <p className="field-hint">At least one day is required. The scheduler only plans inside these days.</p>
          <div className="days-row">
            {DAY_LABELS.map((label, day) => (
              <CheckboxField
                key={day}
                id={`settings-day-${day}`}
                label={label}
                checked={days.includes(day)}
                onCheckedChange={(checked) => toggleDay(day, checked)}
              />
            ))}
          </div>
        </fieldset>

        {formError ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {formError}
          </p>
        ) : null}
        {saved && !formError ? (
          <p className="field-hint" role="status">
            <span aria-hidden="true">✓ </span>Settings saved.
          </p>
        ) : null}

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      <section aria-labelledby="settings-data">
        <h2 id="settings-data">Data &amp; privacy</h2>
        <p className="muted">
          Download a JSON copy of everything this planner stores about you — profile, tasks, calendar, goals, habits
          and the activity timeline. It contains no credentials.
        </p>
        {exportError ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {exportError}
          </p>
        ) : null}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void downloadData()} disabled={exportBusy}>
            {exportBusy ? "Preparing…" : "Download my data"}
          </button>
        </div>
      </section>
    </div>
  );
}

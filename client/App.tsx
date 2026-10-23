/**
 * App shell: authentication gate + signed-in layout.
 *
 * - Sign in / register against the local API; the bearer token lives in localStorage.
 * - Any 401 from the API drops the app back to the sign-in screen (see api.ts).
 * - View switching is driven by the URL hash (no router dependency).
 * - Landmarks: skip link, header, nav, main, plus a polite aria-live status region.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiGet, apiPost, errorMessage, getToken, setToken, subscribeUnauthorized } from "./api";
import { StatusContext } from "./statusContext";
import type { Tone } from "./statusContext";
import { setFormatTimeZone } from "./format";
import type { User } from "./types";
import { TextField } from "./components/fields";
import TodayView from "./views/TodayView";
import CalendarView from "./views/CalendarView";
import TasksView from "./views/TasksView";
import GoalsView from "./views/GoalsView";
import HabitsView from "./views/HabitsView";
import ActivityView from "./views/ActivityView";

type ViewId = "today" | "calendar" | "tasks" | "goals" | "habits" | "activity";

const VIEW_ORDER: { id: ViewId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
  { id: "tasks", label: "Tasks" },
  { id: "goals", label: "Goals" },
  { id: "habits", label: "Habits" },
  { id: "activity", label: "Activity" },
];

function viewFromHash(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return VIEW_ORDER.some((item) => item.id === raw) ? (raw as ViewId) : "today";
}

type Session = { phase: "loading" } | { phase: "signedOut" } | { phase: "signedIn"; user: User };

const TONE_ICON: Record<Tone, string> = { info: "ⓘ", success: "✓", error: "⚠" };

export default function App() {
  const [session, setSession] = useState<Session>(() => (getToken() ? { phase: "loading" } : { phase: "signedOut" }));
  const [view, setView] = useState<ViewId>(viewFromHash);
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null);
  const timerRef = useRef<number | null>(null);

  const announce = useCallback((text: string, tone: Tone = "info") => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setStatus({ text, tone });
    timerRef.current = window.setTimeout(() => setStatus(null), tone === "error" ? 9000 : 5000);
  }, []);

  const statusApi = useMemo(() => ({ announce }), [announce]);

  // Restore the session from the stored token.
  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    apiGet<{ user: User }>("/api/auth/me")
      .then(({ user }) => {
        if (!cancelled) setSession({ phase: "signedIn", user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSession({ phase: "signedOut" });
        announce(errorMessage(error), "error");
      });
    return () => {
      cancelled = true;
    };
  }, [announce]);

  // Every instant on screen must use the account's timezone (the server builds working windows,
  // day boundaries and habit periods in that zone); without this a session can appear shifted.
  useEffect(() => {
    setFormatTimeZone(session.phase === "signedIn" ? session.user.timezone : null);
  }, [session]);

  // 401 from anywhere: token already cleared by api.ts — return to the sign-in screen.
  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => {
      setSession({ phase: "signedOut" });
      announce("Your session expired. Please sign in again.", "error");
    });
    return () => {
      unsubscribe();
    };
  }, [announce]);

  // Hash-based view switching.
  useEffect(() => {
    function onHashChange(): void {
      setView(viewFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  function handleAuthenticated(token: string, user: User): void {
    setToken(token);
    setSession({ phase: "signedIn", user });
    announce(`Signed in as ${user.username}.`, "success");
  }

  async function handleLogout(): Promise<void> {
    try {
      await apiPost("/api/auth/logout");
    } catch {
      // The local session is cleared regardless of the server's answer.
    }
    setToken(null);
    setSession({ phase: "signedOut" });
    announce("Signed out.", "info");
  }

  return (
    <StatusContext.Provider value={statusApi}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        {session.phase === "loading" ? (
          <main id="main" className="auth-shell" tabIndex={-1}>
            <p role="status">Restoring your session…</p>
          </main>
        ) : session.phase === "signedOut" ? (
          <main id="main" className="auth-shell" tabIndex={-1}>
            <AuthGate onAuthenticated={handleAuthenticated} />
          </main>
        ) : (
          <>
            <header className="app-header">
              <p className="brand">AI Planning Ecosystem</p>
              <p className="header-user">
                Signed in as <strong>{session.user.username}</strong>
              </p>
              <button type="button" className="btn" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </header>

            <nav className="app-nav" aria-label="Views">
              <ul>
                {VIEW_ORDER.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={view === item.id ? "tab tab-active" : "tab"}
                      aria-current={view === item.id ? "page" : undefined}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <main id="main" tabIndex={-1}>
              <ViewRenderer view={view} />
            </main>

            <footer className="app-footer">
              <p>
                Local-first planner — your data stays on this machine. Nothing is scheduled without your approval.
              </p>
            </footer>
          </>
        )}

        <div className="status-region" role="status" aria-live="polite" aria-atomic="true">
          {status ? (
            <p className={`status status-${status.tone}`}>
              <span aria-hidden="true">{TONE_ICON[status.tone]} </span>
              {status.text}
            </p>
          ) : null}
        </div>
      </div>
    </StatusContext.Provider>
  );
}

function ViewRenderer({ view }: { view: ViewId }): ReactNode {
  switch (view) {
    case "today":
      return <TodayView />;
    case "calendar":
      return <CalendarView />;
    case "tasks":
      return <TasksView />;
    case "goals":
      return <GoalsView />;
    case "habits":
      return <HabitsView />;
    case "activity":
      return <ActivityView />;
    default:
      return <TodayView />;
  }
}

interface AuthGateProps {
  onAuthenticated: (token: string, user: User) => void;
}

function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
    } catch {
      return "Asia/Ho_Chi_Minh";
    }
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string; timezone?: string }>({});

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const errors: { username?: string; password?: string; timezone?: string } = {};
    if (!username.trim()) errors.username = "Enter your username.";
    if (!password) errors.password = "Enter your password.";
    if (mode === "register" && password.length < 8) errors.password = "Use at least 8 characters.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setFormError(null);
    try {
      if (mode === "register") {
        const result = await apiPost<{ token: string; user: User }>("/api/auth/register", {
          username: username.trim(),
          password,
          timezone,
        });
        onAuthenticated(result.token, result.user);
      } else {
        const result = await apiPost<{ token: string; user: User }>("/api/auth/login", {
          username: username.trim(),
          password,
        });
        onAuthenticated(result.token, result.user);
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>AI Planning Ecosystem</h1>
      <p className="lede">
        A local-first planner for tasks, calendar, goals and habits — with a deterministic scheduler that proposes, and
        you decide.
      </p>
      <h2>{mode === "register" ? "Create your account" : "Sign in"}</h2>
      <form className="form-grid" onSubmit={submit} noValidate>
        <TextField
          id="auth-username"
          label="Username"
          value={username}
          onValueChange={setUsername}
          error={fieldErrors.username}
          required
          autoComplete="username"
          hint={mode === "register" ? "3–32 characters: letters, digits, dot, underscore or hyphen." : undefined}
        />
        <TextField
          id="auth-password"
          label="Password"
          type="password"
          value={password}
          onValueChange={setPassword}
          error={fieldErrors.password}
          required
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          hint={mode === "register" ? "At least 8 characters." : undefined}
        />
        {mode === "register" ? (
          <TextField
            id="auth-timezone"
            label="Time zone"
            value={timezone}
            onValueChange={setTimezone}
            error={fieldErrors.timezone}
            hint="Used to build working-hour windows; defaults to your browser's zone."
          />
        ) : null}
        {formError ? (
          <p className="field-error" role="alert">
            <span aria-hidden="true">⚠ </span>Error: {formError}
          </p>
        ) : null}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : mode === "register" ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMode(mode === "register" ? "signin" : "register");
              setFormError(null);
              setFieldErrors({});
            }}
          >
            {mode === "register" ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </form>
    </div>
  );
}

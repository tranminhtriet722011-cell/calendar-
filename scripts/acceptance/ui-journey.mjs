// APE-BATCH-004 Phase 1: committed UI journey probe.
//
// Drives the BUILT client through the real UI over headless Chrome (CDP) on a throwaway
// database and a fresh throwaway user. This is deliberately NOT an HTTP journey: every flow
// clicks, types and reads the DOM, so it exercises the same code paths a person would (React
// state, controlled inputs, role="alert" surfacing, empty/loading/error states, the two-step
// override confirm). The separate HTTP journeys and the Vitest suite cover the API contract;
// this covers the interface.
//
// Prereq: a built client + running server on a fresh temp DB.
//   npm run build
//   $env:APE_PORT = 8788; $env:APE_DB_FILE = "$env:TEMP\ape-ui-journey.db"; node dist/server.mjs
// Env:    APE_BASE     (default http://127.0.0.1:8788)
//         APE_CHROME   (path to chrome.exe; autodetected)
//         APE_UI_OUT   (output dir for results.json; default <os tmp>/ape-ui-journey)
//         APE_CDP_PORT (Chrome remote-debugging port; default 9444)
// Exit:   0 only when every flow reports PASS.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.APE_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) throw new Error(`chrome.exe not found - set APE_CHROME. Tried:\n  ${CANDIDATES.join("\n  ")}`);

const BASE = process.env.APE_BASE ?? "http://127.0.0.1:8788";
const PORT = Number(process.env.APE_CDP_PORT ?? 9444);
const OUT = process.env.APE_UI_OUT ?? join(tmpdir(), "ape-ui-journey");

rmSync(join(OUT, "user-data"), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- throwaway user (registered THROUGH the UI below, not via HTTP) ---
const stamp = Date.now().toString(36);
const USERNAME = `ui${stamp}`;
const PASSWORD = "Batch004-UI-Pass1!";

// --- headless Chrome ---
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(OUT, "user-data")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--window-size=1280,900",
  "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(250);
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    wsUrl = v.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { chrome.kill(); throw new Error("Chrome DevTools endpoint never came up"); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const listeners = new Map(); // method -> [cb(params, sessionId)]
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
  } else if (msg.method && listeners.has(msg.method)) {
    for (const cb of listeners.get(msg.method)) cb(msg.params, msg.sessionId);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
const onEvent = (method, cb) => {
  const arr = listeners.get(method) ?? [];
  arr.push(cb);
  listeners.set(method, arr);
};

// A page bound to one CDP session (target). `sid` is null for the root session.
function makePage(sid) {
  const call = (method, params = {}) => send(method, params, sid);
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const detail = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
      throw new Error(`page exception: ${detail}`);
    }
    return r.result?.value;
  };
  const text = () => evaluate("document.body.innerText");
  const innerH1 = () => evaluate("(document.querySelector('h1')||{textContent:''}).textContent.trim()");

  async function waitFor(predicateExpr, { timeout = 12000, label = "condition" } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    // Coerce DOM nodes (from `querySelector(...)` predicates) to a boolean so
    // returnByValue never tries to serialize an element (RangeError).
    const guard = `(() => { const __r = (${predicateExpr}); return (typeof __r === "object" && __r !== null) ? true : __r; })()`;
    while (Date.now() < deadline) {
      last = await evaluate(guard);
      if (last) return last;
      await sleep(150);
    }
    const body = (await text().catch(() => "")) || "";
    throw new Error(`timeout waiting for ${label}. Last body:\n${body.slice(0, 1200)}`);
  }

  async function gotoHash(view) {
    // Cache-buster BEFORE the hash so React re-reads the route; an unknown view silently
    // falls back to Today, so callers assert the h1 they expect.
    await call("Page.navigate", { url: `${BASE}/?ui=${Date.now()}#/${view}` });
    await sleep(1400);
    return innerH1();
  }

  // Poll until a role="alert" matching `regexSource` exists, then RETURN that alert's text.
  // Capturing detect+text in one evaluate avoids a race where a 409 handler also triggers a
  // reload that briefly unmounts the alert (AsyncSection loading state) between two calls.
  async function alertMatching(regexSource, { timeout = 12000, label = "alert" } = {}) {
    const deadline = Date.now() + timeout;
    const probe = `(() => { const m = Array.from(document.querySelectorAll('[role="alert"]')).map(e => (e.textContent||'').trim()).find(x => (${regexSource}).test(x)); return m || ""; })()`;
    while (Date.now() < deadline) {
      const found = await evaluate(probe);
      if (found) return found;
      await sleep(150);
    }
    const body = (await text().catch(() => "")) || "";
    throw new Error(`timeout waiting for ${label}. Last body:\n${body.slice(0, 1200)}`);
  }

  return { call, evaluate, text, innerH1, waitFor, gotoHash, alertMatching };
}

// Create a fresh target (tab) that inherits the profile's localStorage (same origin),
// attach a session, enable Page/Runtime, and inject the auth token before app boot.
async function newTarget() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  return { targetId, sessionId, page: makePage(sessionId) };
}

// Inject shared page-side helpers + the token for a session.
async function bootSession(page, sid, token) {
  await page.call("Page.addScriptToEvaluateOnNewDocument", {
    source: `${token ? `localStorage.setItem("ape.token", ${JSON.stringify(token)});` : ""}
window.__ui = {
  setVal(el, val) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, val); else el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  },
  field(id, val) { const el = document.getElementById(id); if (!el) return false; this.setVal(el, val); return true; },
  check(id, want) { const el = document.getElementById(id); if (!el) return false; if (el.checked !== !!want) el.click(); return true; },
  btnByText(text, root) { const scope = root || document; return Array.from(scope.querySelectorAll("button")).find(b => (b.textContent||"").trim().includes(text)); },
  clickBtn(text, root) { const b = this.btnByText(text, root); if (!b) return false; b.click(); return true; },
  text() { return document.body.innerText; },
  alerts() { return Array.from(document.querySelectorAll('[role="alert"]')).map(e => (e.textContent||"").trim()); },
  has(sel) { return !!document.querySelector(sel); },
  count(sel) { return document.querySelectorAll(sel).length; }
};`,
  }, sid);
}

// Node-side UI action helpers (drive through the DOM via __ui).
function actions(page) {
  return {
    field: (id, val) => page.evaluate(`__ui.field(${JSON.stringify(id)}, ${JSON.stringify(val)})`),
    check: (id, want) => page.evaluate(`__ui.check(${JSON.stringify(id)}, ${want})`),
    clickBtn: (text, rootSel) => page.evaluate(`__ui.clickBtn(${JSON.stringify(text)}, ${rootSel ? `document.querySelector(${JSON.stringify(rootSel)})` : "document"})`),
    submitFormContaining: (fieldId) => page.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(fieldId)}); const f = el && el.closest("form"); if (!f) return false; f.requestSubmit(); return true; })()`),
    alerts: () => page.evaluate("__ui.alerts()"),
    count: (sel) => page.evaluate(`__ui.count(${JSON.stringify(sel)})`),
    text: () => page.text(),
  };
}

// --- flow bookkeeping ---
const flows = [];
function flow(name, pass, detail = "") {
  flows.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

let failures = 0;
function step(name, fn) {
  return (async () => {
    try {
      const detail = await fn();
      flow(name, true, typeof detail === "string" ? detail : "");
    } catch (error) {
      failures++;
      flow(name, false, error.message);
      throw error; // abort the run: later flows depend on earlier state
    }
  })();
}

// A datetime-local string (YYYY-MM-DDTHH:mm) in UTC for a given offset, matching the
// throwaway user's timezone (UTC) so the client round-trips it exactly.
function dtl(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

try {
  // =====================================================================
  // 1. Register THROUGH the UI (fresh user).
  // =====================================================================
  const main = await newTarget();
  await bootSession(main.page, main.sessionId, null); // no token yet -> AuthGate
  const act = actions(main.page);
  await main.page.call("Page.navigate", { url: `${BASE}/?ui=${Date.now()}` });
  await sleep(1600);

  await step("1 register via the auth gate", async () => {
    await main.page.waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent.includes('AI Planning Ecosystem')`, { label: "auth gate" });
    await act.clickBtn("Create an account"); // switch to register mode
    await main.page.waitFor(`document.querySelector('h2') && document.querySelector('h2').textContent.includes('Create your account')`, { label: "register mode" });
    await act.field("auth-username", USERNAME);
    await act.field("auth-password", PASSWORD);
    await act.field("auth-timezone", "UTC");
    await act.submitFormContaining("auth-username");
    await main.page.waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent.trim() === 'Today'`, { label: "signed-in Today view" });
    const t = await act.text();
    if (!t.includes(`Signed in as ${USERNAME}`)) throw new Error("header does not show the signed-in user");
    return `user=${USERNAME}`;
  });

  // Read the token out of the page for the second tab later.
  const TOKEN = await main.page.evaluate('localStorage.getItem("ape.token")');
  if (!TOKEN) throw new Error("no auth token stored after register");

  // =====================================================================
  // 2. Reload stays signed in (session restore).
  // =====================================================================
  await step("2 reload keeps the session signed in", async () => {
    await main.page.call("Page.navigate", { url: `${BASE}/?ui=${Date.now()}#/today` });
    await main.page.waitFor(`document.querySelector('h1') && document.querySelector('h1').textContent.trim() === 'Today'`, { label: "restored Today view" });
    const t = await act.text();
    if (!t.includes(`Signed in as ${USERNAME}`)) throw new Error("session not restored after reload");
    return "still signed in";
  });

  // =====================================================================
  // 3. Empty state on a blank day.
  // =====================================================================
  await step("3 Today shows the empty state", async () => {
    const t = await act.text();
    if (!t.includes("A blank day")) throw new Error("empty state heading not shown");
    if (!t.includes("Quick add task")) throw new Error("quick-add form not shown");
    return "blank-day empty state present";
  });

  // =====================================================================
  // 4. Quick add task (lands in the inbox, never scheduled silently).
  // =====================================================================
  await step("4 quick add creates an inbox task", async () => {
    await act.field("quick-title", "Prepare the quarterly planning report");
    await act.submitFormContaining("quick-title");
    await main.page.waitFor(`document.body.innerText.includes('added to your inbox')`, { label: "quick-add confirmation" });
    return "task added to inbox";
  });

  // =====================================================================
  // 5. Estimate + due date via the Tasks edit form.
  // =====================================================================
  const h1tasks = await main.page.gotoHash("tasks");
  await step("5 set estimate and due date", async () => {
    if (h1tasks !== "Tasks") throw new Error(`expected Tasks view, got "${h1tasks}"`);
    await main.page.waitFor(`document.body.innerText.includes('quarterly planning report')`, { label: "task in list" });
    await act.clickBtn("Edit");
    await main.page.waitFor(`document.querySelector('h3') && document.body.innerText.includes('Edit')`, { label: "edit form open" });
    // Target the per-id EDIT form fields specifically (the create form's `task-estimate`
    // shares the DOM and would otherwise be picked first).
    const estId = await main.page.evaluate(`(Array.from(document.querySelectorAll('input[type=number]')).find(i => i.id.startsWith('edit-est-'))||{}).id||''`);
    if (!estId) throw new Error("edit-form estimate field not found");
    await act.field(estId, "90");
    const dueId = await main.page.evaluate(`(Array.from(document.querySelectorAll('input[type=datetime-local]')).find(i => i.id.startsWith('edit-due-'))||{}).id||''`);
    if (dueId) await act.field(dueId, dtl(3 * 1440));
    await act.clickBtn("Save changes");
    // Wait for the PERSISTED result (list re-render), not the transient status toast.
    await main.page.waitFor(`document.body.innerText.includes('1 h 30 min')`, { label: "estimate persisted in list" });
    const t = await act.text();
    if (!t.includes("1 h 30 min")) throw new Error("estimate 90 min not reflected as 1 h 30 min");
    if (!t.includes("Due")) throw new Error("due date not reflected");
    return "estimate=90m, due set";
  });

  // =====================================================================
  // 6. Create a goal.
  // =====================================================================
  const h1goals = await main.page.gotoHash("goals");
  await step("6 create a goal", async () => {
    if (h1goals !== "Goals") throw new Error(`expected Goals view, got "${h1goals}"`);
    await act.field("goal-title", "Ship the quarterly planner");
    await act.field("goal-target", "5");
    await act.submitFormContaining("goal-title");
    await main.page.waitFor(`document.querySelector('article[aria-label^="Goal:"]')`, { label: "goal card" });
    return "goal card rendered";
  });

  // Add a second, schedulable task so a plan has real work to place.
  await main.page.gotoHash("tasks");
  await step("6b add a second schedulable task", async () => {
    await act.field("task-title", "Buy groceries");
    const estId = await main.page.evaluate(`(document.getElementById('task-estimate')||{}).id||''`);
    if (estId) await act.field(estId, "20");
    await act.submitFormContaining("task-title");
    await main.page.waitFor(`document.body.innerText.includes('Buy groceries')`, { label: "second task in list" });
    return "second task added";
  });

  // =====================================================================
  // 7. Plan preview with 3 proposals.
  // =====================================================================
  const h1activity = await main.page.gotoHash("activity");
  await step("7 plan yields 3 proposals as previews", async () => {
    if (h1activity !== "Activity") throw new Error(`expected Activity view, got "${h1activity}"`);
    await act.clickBtn("Ask for a plan");
    await main.page.waitFor(`document.querySelectorAll('article.proposal').length >= 3`, { label: "3 proposal cards" });
    const n = await act.count("article.proposal");
    const t = await act.text();
    if (!t.includes("Nothing has been scheduled yet")) throw new Error("proposal preview disclaimer missing");
    if (!t.includes("Apply this plan")) throw new Error("Apply action missing");
    if (!t.includes("Dismiss")) throw new Error("Dismiss action missing");
    return `${n} proposals, previews only`;
  });

  // =====================================================================
  // 8. Infeasible shortfall with named reasons.
  // =====================================================================
  // Add a task that cannot fit before its near deadline, then re-plan.
  await main.page.gotoHash("tasks");
  await step("8 infeasible shortfall names the reason", async () => {
    await act.field("task-title", "Write the entire dissertation");
    const estId = await main.page.evaluate(`(document.getElementById('task-estimate')||{}).id||''`);
    if (estId) await act.field(estId, "3000");
    const dueId = await main.page.evaluate(`(document.getElementById('task-due')||{}).id||''`);
    if (dueId) await act.field(dueId, dtl(2 * 1440));
    await act.submitFormContaining("task-title");
    await main.page.waitFor(`document.body.innerText.includes('dissertation')`, { label: "infeasible task created" });

    await main.page.gotoHash("activity");
    await act.clickBtn("Ask for a plan");
    await main.page.waitFor(`document.body.innerText.includes('Not fully feasible')`, { label: "infeasibility reported" });
    const t = await act.text();
    if (!t.includes("short by")) throw new Error("shortfall magnitude not shown");
    if (!t.includes("unplaced —")) throw new Error("named per-task shortfall reasons not shown");
    return "shortfall + named reasons rendered";
  });

  // =====================================================================
  // 9. Commit (apply) a proposal.
  // =====================================================================
  await step("9 apply a proposal commits sessions", async () => {
    // Wait for an ENABLED Apply button first (guards the re-render race after flow 8's plan),
    // then commit the newest proposal (list is created_at DESC, so the first card is fresh).
    await main.page.waitFor(
      `Array.from(document.querySelectorAll('article.proposal button')).some(b => (b.textContent||'').trim() === 'Apply this plan' && !b.disabled)`,
      { label: "an enabled Apply this plan button" },
    );
    const clicked = await act.clickBtn("Apply this plan");
    if (!clicked) throw new Error("Apply this plan button disappeared before it could be clicked");
    // The "Plan applied" toast is transient (5 s) and races state.reload(); wait for the DURABLE
    // outcome instead — a schedule.commit timeline entry that persists across reloads. This is
    // also the entry flow 10 undoes, so the two flows stay consistent.
    await main.page.waitFor(
      `Array.from(document.querySelectorAll('li.timeline-item')).some(li => (li.textContent||'').includes('schedule commit'))`,
      { label: "durable schedule.commit timeline entry" },
    );
    return "sessions placed (schedule.commit timeline entry present)";
  });

  // =====================================================================
  // 10. Undo the commit from the timeline.
  // =====================================================================
  await step("10 undo restores the calendar", async () => {
    await main.page.waitFor(`document.querySelector('button') && Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').includes('Undo'))`, { label: "an undoable timeline entry" });
    await act.clickBtn("Undo");
    // Wait for the DURABLE post-reload timeline state (the "Action undone" toast is transient
    // and would race the reload that renders "— undone" on the entry).
    await main.page.waitFor(`document.body.innerText.includes('— undone')`, { label: "entry marked undone" });
    const t = await act.text();
    if (!t.includes("— undone")) throw new Error("entry not marked undone");
    return "action undone";
  });

  // =====================================================================
  // 11. Double-undo is rejected at the UI layer (control withdrawn).
  // =====================================================================
  await step("11 double undo is rejected (control withdrawn)", async () => {
    // After the undo, the timeline item that was undone no longer offers an Undo button;
    // the server would answer 409 already_undone. The UI's rejection is that it never
    // offers a second undo for an already-undone entry.
    const stillUndoable = await main.page.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('li.timeline-item'));
      const undone = items.find(li => (li.textContent||'').includes('— undone'));
      if (!undone) return 'no-undone-item';
      const hasUndo = Array.from(undone.querySelectorAll('button')).some(b => (b.textContent||'').includes('Undo'));
      return hasUndo ? 'still-undoable' : 'control-withdrawn';
    })()`);
    if (stillUndoable !== "control-withdrawn") throw new Error(`undone entry still offers Undo (${stillUndoable})`);
    return "undone entry offers no second Undo";
  });

  // =====================================================================
  // 12. Recovery proposals ("need more time").
  // =====================================================================
  const h1today = await main.page.gotoHash("today");
  await step("12 recovery returns proposals", async () => {
    if (h1today !== "Today") throw new Error(`expected Today view, got "${h1today}"`);
    // Pick the quarterly report task and ask for recovery.
    await main.page.evaluate(`(() => { const s = document.getElementById('recovery-task'); if (!s) return false; const opt = Array.from(s.options).find(o => (o.textContent||'').includes('quarterly planning report')); if (!opt) return false; __ui.setVal(s, opt.value); return true; })()`);
    await act.field("recovery-minutes", "30");
    await act.clickBtn("Ask for recovery proposals");
    await main.page.waitFor(`document.body.innerText.includes('recovery proposal') || document.querySelectorAll('article.proposal').length > 0 || document.body.innerText.includes('Feasibility')`, { label: "recovery response" });
    return "recovery proposals/feasibility rendered";
  });

  // =====================================================================
  // 13. Log a session (timer/manual surface) then complete the task.
  // =====================================================================
  await step("13 log work then complete the task", async () => {
    // Log work through the Today "Log work" form.
    await main.page.evaluate(`(() => { const s = document.getElementById('log-task'); if (!s) return false; const opt = Array.from(s.options).find(o => (o.textContent||'').includes('quarterly planning report')); if (!opt) return false; __ui.setVal(s, opt.value); return true; })()`);
    await act.field("log-minutes", "45");
    await act.clickBtn("Save work log");
    await main.page.waitFor(`document.body.innerText.includes('Work log recorded')`, { label: "work log recorded" });

    // Now complete it from the Tasks view.
    await main.page.gotoHash("tasks");
    await main.page.waitFor(`document.body.innerText.includes('quarterly planning report')`, { label: "task list" });
    // Locate the row for this task and click its Complete button.
    await main.page.evaluate(`(() => {
      const li = Array.from(document.querySelectorAll('li.item')).find(x => (x.textContent||'').includes('quarterly planning report'));
      const b = li && Array.from(li.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'Complete');
      if (b) b.click();
      return !!b;
    })()`);
    await main.page.waitFor(`!!document.querySelector('[role="dialog"]')`, { label: "complete dialog" });
    await act.clickBtn("Complete task");
    // Wait for the dialog to close AND the past-tense status label "Completed" to appear.
    // The dialog body's lowercase "marked completed" must NOT satisfy this (that was a race).
    await main.page.waitFor(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Completed')`, { label: "task completed" });
    const t = await act.text();
    if (!t.includes("Completed")) throw new Error("task not marked Completed");
    return "logged 45m + completed";
  });

  // =====================================================================
  // 14. Stale-edit (two-tab) surfaces role="alert".
  // =====================================================================
  await step("14 stale edit in a second tab is refused with role=alert", async () => {
    // Tab A (main): open the edit form for the second task and leave it open.
    await main.page.gotoHash("tasks");
    await main.page.waitFor(`document.body.innerText.includes('Buy groceries')`, { label: "task list" });
    await main.page.evaluate(`(() => {
      const li = Array.from(document.querySelectorAll('li.item')).find(x => (x.textContent||'').includes('Buy groceries'));
      const b = li && Array.from(li.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'Edit');
      if (b) b.click();
      return !!b;
    })()`);
    await main.page.waitFor(`document.body.innerText.includes('Edit') && Array.from(document.querySelectorAll('input[type=number]')).some(i => i.id.startsWith('edit-est-'))`, { label: "tab A edit form open" });

    // Tab B: same origin/profile -> already signed in. Edit the same task and save (bumps revision).
    const tabB = await newTarget();
    await bootSession(tabB.page, tabB.sessionId, TOKEN);
    await tabB.page.gotoHash("tasks");
    await tabB.page.waitFor(`document.body.innerText.includes('Buy groceries')`, { label: "tab B task list" });
    await tabB.page.evaluate(`(() => {
      const li = Array.from(document.querySelectorAll('li.item')).find(x => (x.textContent||'').includes('Buy groceries'));
      const b = li && Array.from(li.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'Edit');
      if (b) b.click();
      return !!b;
    })()`);
    await tabB.page.waitFor(`Array.from(document.querySelectorAll('input[type=number]')).some(i => i.id.startsWith('edit-est-'))`, { label: "tab B edit form open" });
    await tabB.page.evaluate(`(() => { const i = Array.from(document.querySelectorAll('input[type=number]')).find(x => x.id.startsWith('edit-est-')); if (i) __ui.setVal(i, "35"); return !!i; })()`);
    await tabB.page.evaluate(`Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').trim() === 'Save changes' ? (b.click(), true) : false)`);
    await tabB.page.waitFor(`document.body.innerText.includes('updated')`, { label: "tab B save succeeded" });

    // Back to Tab A: its edit form still holds the OLD revision -> Save must 409 and
    // surface role="alert" naming the conflict, then refresh.
    await main.page.evaluate(`(() => { const i = Array.from(document.querySelectorAll('input[type=number]')).find(x => x.id.startsWith('edit-est-')); if (i) __ui.setVal(i, "25"); return !!i; })()`);
    await main.page.evaluate(`Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').trim() === 'Save changes' ? (b.click(), true) : false)`);
    // Atomic detect+capture (the 409 handler also triggers a reload that briefly unmounts
    // the list, so a separate alerts() call could race the loading state).
    const staleAlert = await main.page.alertMatching("/refreshing the list|revision|changed/i", { label: "stale-edit alert" });
    if (!/refreshing the list|revision|changed/i.test(staleAlert)) throw new Error(`no stale-edit alert naming the conflict: ${staleAlert}`);
    await tabB.page.call("Page.close", { targetId: tabB.targetId }).catch(() => {});
    return "stale save refused with role=alert";
  });

  // =====================================================================
  // 15. E3 illegal transition surfaces role="alert".
  // =====================================================================
  await step("15 illegal status transition is refused with role=alert", async () => {
    await main.page.gotoHash("tasks");
    await main.page.waitFor(`document.body.innerText.includes('quarterly planning report')`, { label: "task list" });
    // The quarterly report task is Completed; try to move it back to Not started (illegal).
    await main.page.evaluate(`(() => {
      const li = Array.from(document.querySelectorAll('li.item')).find(x => (x.textContent||'').includes('quarterly planning report'));
      const b = li && Array.from(li.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'Edit');
      if (b) b.click();
      return !!b;
    })()`);
    await main.page.waitFor(`Array.from(document.querySelectorAll('select')).some(s => s.id.startsWith('edit-status-'))`, { label: "edit form open" });
    await main.page.evaluate(`(() => { const s = Array.from(document.querySelectorAll('select')).find(x => x.id.startsWith('edit-status-')); if (s) { __ui.setVal(s, "not_started"); return true; } return false; })()`);
    await main.page.evaluate(`Array.from(document.querySelectorAll('button')).some(b => (b.textContent||'').trim() === 'Save changes' ? (b.click(), true) : false)`);
    // Atomic detect+capture: the 409 handler triggers a reload that unmounts the list during
    // loading, so capture the alert text in the same evaluate that detects it (no race).
    const e3Alert = await main.page.alertMatching("/transition|not allowed|cannot|illegal|conflict/i", { label: "illegal-transition alert" });
    if (!/transition|not allowed|cannot|illegal|conflict/i.test(e3Alert)) {
      throw new Error(`no E3 alert: ${e3Alert}`);
    }
    return `E3 refusal surfaced: ${e3Alert.slice(0, 80)}`;
  });

  // =====================================================================
  // 16. Locked event + overlap 409 + two-step override + audit entry.
  // =====================================================================
  const h1cal = await main.page.gotoHash("calendar");
  await step("16 locked-event overlap needs a two-step override", async () => {
    if (h1cal !== "Calendar") throw new Error(`expected Calendar view, got "${h1cal}"`);
    // Create a fixed event ~2 days out, then lock it.
    const evStart = dtl(2 * 1440 + 120);
    const evEnd = dtl(2 * 1440 + 180);
    await act.field("event-title", "Locked planning offsite");
    await act.field("event-start", evStart);
    await act.field("event-end", evEnd);
    await act.clickBtn("Create event");
    await main.page.waitFor(`document.body.innerText.includes('Locked planning offsite')`, { label: "event created" });
    // Lock it (per-event Lock button in the Events list).
    await main.page.evaluate(`(() => {
      const li = Array.from(document.querySelectorAll('li.item')).find(x => (x.textContent||'').includes('Locked planning offsite'));
      const b = li && Array.from(li.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'Lock');
      if (b) b.click();
      return !!b;
    })()`);
    await main.page.waitFor(`document.body.innerText.includes('Locked')`, { label: "event locked" });

    // Place a block over the locked event.
    await main.page.evaluate(`(() => { const s = document.getElementById('block-task'); if (!s) return false; const opt = Array.from(s.options).find(o => (o.textContent||'').includes('Buy groceries')); if (!opt) return false; __ui.setVal(s, opt.value); return true; })()`);
    await act.field("block-start", evStart);
    await act.field("block-end", dtl(2 * 1440 + 150));
    await act.clickBtn("Place block");
    // Expect the two-step override panel (role=alert) naming the locked conflict.
    await main.page.waitFor(`Array.from(document.querySelectorAll('[role="alert"]')).some(e => (e.textContent||'').includes('Scheduling conflict'))`, { label: "conflict panel" });
    const alertText = (await act.alerts()).join(" ");
    if (!/locked|fixed/i.test(alertText)) throw new Error(`conflict does not name the locked/fixed event: ${alertText.slice(0,200)}`);
    // The override button must be disabled until the acknowledgement is ticked.
    const disabledBefore = await main.page.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('Place anyway')); return b ? b.disabled : null; })()`);
    if (disabledBefore !== true) throw new Error("override button not disabled before acknowledgement");
    // Acknowledge, then override.
    await act.check("block-override-ack", true);
    await act.clickBtn("Place anyway");
    await main.page.waitFor(`document.body.innerText.includes('override') || document.body.innerText.includes('activity log')`, { label: "override applied" });

    // The applied exception must be auditable in the Activity timeline.
    await main.page.gotoHash("activity");
    await main.page.waitFor(`document.body.innerText.toLowerCase().includes('exception')`, { label: "audit exception entry" });
    const t = await act.text().then(x => x.toLowerCase());
    if (!t.includes("exception")) throw new Error("no schedule.exception audit entry");
    return "409 -> ack -> override -> audited";
  });

  // =====================================================================
  // 17. Habit 0 -> 1 -> 2 of 3.
  // =====================================================================
  const h1habits = await main.page.gotoHash("habits");
  await step("17 habit check-ins advance 0 -> 1 -> 2 of 3", async () => {
    if (h1habits !== "Habits") throw new Error(`expected Habits view, got "${h1habits}"`);
    await act.field("habit-title", "Drink water after waking up");
    const cad = await main.page.evaluate(`(document.getElementById('habit-cadence')||{}).id||''`);
    if (cad) await act.field(cad, "daily");
    await act.field("habit-target", "3");
    await act.submitFormContaining("habit-title");
    await main.page.waitFor(`document.querySelector('article[aria-label^="Habit:"]')`, { label: "habit card" });
    await act.clickBtn("Check in now");
    await main.page.waitFor(`document.body.innerText.includes('1 of 3 this period')`, { label: "first check-in" });
    await act.clickBtn("Check in now");
    await main.page.waitFor(`document.body.innerText.includes('2 of 3 this period')`, { label: "second check-in" });
    return "0 -> 1 -> 2 of 3";
  });

  // =====================================================================
  // 18. Offline behaviour: an honest error + retry, then recovery. Plus a
  //     single-origin check (no external resources are fetched).
  // =====================================================================
  await step("18 offline surfaces an honest error with retry", async () => {
    // Single-origin proof: every resource the page loaded is same-origin.
    const crossOrigin = await main.page.evaluate(`(() => {
      const own = location.origin;
      return performance.getEntriesByType("resource").map(e => e.name).filter(n => { try { return new URL(n, location.href).origin !== own; } catch { return false; } });
    })()`);
    if (crossOrigin.length > 0) throw new Error(`cross-origin resources fetched: ${JSON.stringify(crossOrigin.slice(0,5))}`);

    // Go offline at the network layer, then trigger a data refetch via hash navigation.
    await main.page.call("Network.enable");
    await main.page.call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await main.page.evaluate("location.hash = '#/tasks'");
    await main.page.waitFor(`Array.from(document.querySelectorAll('[role="alert"]')).some(e => (e.textContent||'').includes('Could not load'))`, { label: "offline error state", timeout: 15000 });

    // Back online; retry must recover.
    await main.page.call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await main.page.evaluate(`(() => { const b = Array.from(document.querySelectorAll('[role="alert"] button')).find(x => (x.textContent||'').includes('Retry')); if (b) { b.click(); return true; } return false; })()`);
    await main.page.waitFor(`!Array.from(document.querySelectorAll('[role="alert"]')).some(e => (e.textContent||'').includes('Could not load'))`, { label: "recovered after retry" });
    return "error+retry honest; single-origin confirmed";
  });

  await main.page.call("Page.close", { targetId: main.targetId }).catch(() => {});
} catch (error) {
  // A step already recorded the FAIL; note the abort.
  console.error(`\nABORTED: ${error.message}`);
} finally {
  ws.close();
  chrome.kill();
}

writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, username: USERNAME, flows }, null, 2));
const passCount = flows.filter((f) => f.pass).length;
console.log(`\nSUMMARY: ${passCount}/${flows.length} UI journey flows PASS`);
console.log(`results: ${join(OUT, "results.json")}`);
process.exit(passCount === flows.length && flows.length > 0 ? 0 : 1);

// APE-BATCH-003 (REV-R301): real 320 px responsive check via headless Chrome DevTools Protocol.
// Committed into the repository so the "320 px VERIFIED" claim in
// docs/PRODUCT_DESCRIPTION_USER_VI.md has an evidence chain that anyone can rerun.
//
// Emulates 320x640 (deviceScaleFactor 2, mobile) via Emulation.setDeviceMetricsOverride, loads
// each of the 6 views on the built client served by the real server, and records:
//   - document scrollWidth vs 320 (the pass condition: scrollWidth <= 320)
//   - elements whose box crosses the viewport edge (overflowing)
//   - leaf elements with hidden/ellipsis overflow whose content is wider than the box (clipped text)
//   - interactive elements smaller than 24x24 CSS px (tap-target watchlist)
// plus one full-page screenshot per view.
//
// Prereq: a built client + running server (npm run build && node dist/server.mjs) with a temp DB.
// Env:    APE_BASE    (default http://127.0.0.1:8788)
//         APE_CHROME  (path to chrome.exe; autodetected from the usual install locations)
//         APE_320_OUT (output dir for screenshots/results.json; default <os tmp>/ape-viewport320)
//         APE_CDP_PORT (Chrome remote-debugging port; default 9333)
// Exit:   0 only when all 6 views render the expected h1 AND have scrollWidth <= 320.
//
// Note on the navigation invariant: the cache-buster must go BEFORE the hash. `/#/calendar?p=1`
// makes the parsed view id "calendar?p=1" (unknown -> the app silently falls back to Today, which
// is exactly how an earlier run of this script measured the Today view six times). The EXPECT_H1
// guard below turns that silent fallback into a hard failure.

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
const PORT = Number(process.env.APE_CDP_PORT ?? 9333);
const OUT = process.env.APE_320_OUT ?? join(tmpdir(), "ape-viewport320");
const VIEWS = ["today", "calendar", "tasks", "goals", "habits", "activity"];

rmSync(join(OUT, "user-data"), { recursive: true, force: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- throwaway user + seeded content so the views are populated (overflow shows on data, not empty states) ---
const stamp = Date.now().toString(36);
const username = `px320${stamp}`;
const password = "Batch003-throwaway-Pass1!";
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password, timezone: "UTC" }),
});
if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
const { token } = await reg.json();
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const post = (path, body) => fetch(`${BASE}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) }).then((r) => r.json());

// Long-ish realistic content to stress horizontal space at 320 px.
const task = await post("/api/tasks", { title: "Prepare the quarterly planning report for the whole team including budget review", estimatedMinutes: 90 });
await post("/api/tasks", { title: "Buy groceries", estimatedMinutes: 20 });
const goal = await post("/api/goals", { title: "Read twelve technical books this year and write notes for each one", unit: "books", targetValue: 12 });
if (goal?.id) await post(`/api/goals/${goal.id}/milestones`, { title: "Finish the first four books and summarise them", targetValue: 4 });
const habit = await post("/api/habits", { title: "Drink water after waking up and stretch for five minutes", cadence: "daily", targetCount: 3 });
if (habit?.id) await post(`/api/habits/${habit.id}/checkins`, { at: Date.now() });
if (task?.id) await post("/api/worklogs", { taskId: task.id, minutes: 45, note: "Drafted the first two sections with the budget table" }).catch(() => {});
// Calendar: two events so the calendar row layout is exercised.
const day = 86400000;
const base0 = Date.now() + day;
await post("/api/calendar/events", { title: "Dentist appointment with the hygienist", startAt: base0 + 9 * 3600000, endAt: base0 + 10 * 3600000 }).catch(() => {});
await post("/api/calendar/events", { title: "Team retrospective", startAt: base0 + 14 * 3600000, endAt: base0 + 15 * 3600000 }).catch(() => {});
console.log(`seeded user ${username}`);

// --- headless Chrome ---
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(OUT, "user-data")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--window-size=320,640",
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
const events = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
  } else if (msg.method && events.has(msg.method)) {
    for (const cb of events.get(msg.method)) cb(msg.params);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
const once = (method, sessionId, timeoutMs = 15000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${method}`)), timeoutMs);
    const cb = (params) => { clearTimeout(t); res(params); };
    const arr = events.get(method) ?? [];
    arr.push(cb);
    events.set(method, arr);
    // sessionId filter is best-effort; single page in this run.
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 2, mobile: true, screenWidth: 320, screenHeight: 640 }, sessionId);

// Inject the token before the app boots so the auth gate opens on this origin.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("ape.token", ${JSON.stringify(token)});` }, sessionId);

const MEASURE = `(() => {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const sw = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const overflowing = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1)) {
      overflowing.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 60), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
    }
  }
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0) continue;
    const st = getComputedStyle(el);
    if ((st.overflow === "hidden" || st.textOverflow === "ellipsis" || st.overflowX === "hidden") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
      clipped.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 48), scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
  }
  const small = [];
  for (const el of document.querySelectorAll("a, button, input, select, textarea, [role=button], [role=tab], [role=link], [role=switch]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.height < 24 || r.width < 24) small.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return JSON.stringify({ vw, sw, overflowing, clipped, small, title: document.title, h1: (document.querySelector("h1") || {}).textContent || "" });
})()`;

const EXPECT_H1 = { today: "Today", calendar: "Calendar", tasks: "Tasks", goals: "Goals", habits: "Habits", activity: "Activity" };
const results = [];
for (const view of VIEWS) {
  const loaded = once("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url: `${BASE}/?p=${Date.now()}#/${view}` }, sessionId);
  await loaded.catch(() => {});
  await sleep(1200); // let React render + data fetches settle at the emulated size
  const raw = await send("Runtime.evaluate", { expression: MEASURE, returnByValue: true }, sessionId);
  const m = JSON.parse(raw.result.value);
  // Guard: never report a view we did not actually render.
  const expected = EXPECT_H1[view];
  if (m.h1.trim() !== expected) throw new Error(`navigation guard: asked for ${view} but rendered h1="${m.h1}" - results would be invalid`);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
  writeFileSync(join(OUT, "shots", `${view}-320.png`), Buffer.from(shot.data, "base64"));
  results.push({ view, ...m, shot: join(OUT, "shots", `${view}-320.png`) });
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

let pass = 0;
let clippedTotal = 0;
let smallTotal = 0;
for (const r of results) {
  const okScroll = r.sw <= 320;
  if (okScroll) pass++;
  clippedTotal += r.clipped.length;
  smallTotal += r.small.length;
  console.log(`\n=== ${r.view.toUpperCase()} @320x640 ===`);
  console.log(`  scrollWidth=${r.sw} viewport=${r.vw} -> ${okScroll ? "PASS (no horizontal scroll)" : "FAIL (horizontal scroll)"}`);
  console.log(`  overflowing elements: ${r.overflowing.length}`);
  for (const o of r.overflowing.slice(0, 8)) console.log(`    <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.w}`);
  console.log(`  clipped text (hidden/ellipsis, content wider than box): ${r.clipped.length}`);
  for (const c of r.clipped.slice(0, 8)) console.log(`    <${c.tag}> "${c.text}" ${c.scrollW}>${c.clientW}`);
  console.log(`  tap targets < 24px: ${r.small.length}`);
  for (const s of r.small.slice(0, 8)) console.log(`    <${s.tag}> "${s.text}" ${s.w}x${s.h}`);
  console.log(`  screenshot: ${r.shot}`);
}
console.log(`\nSUMMARY: ${pass}/${results.length} views have scrollWidth <= 320; clipped text total=${clippedTotal}; tap targets <24px total=${smallTotal}`);

ws.close();
chrome.kill();
process.exit(pass === results.length ? 0 : 1);

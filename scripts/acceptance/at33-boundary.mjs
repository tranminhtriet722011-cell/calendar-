// AT33 boundary probe — deterministic, reads the actual pause window from the SQLite file:
//   at = startedAt - 1  -> counted  (occurrence before the pause opened)
//   at = startedAt      -> excluded (inclusive start)
//   at = endedAt - 1    -> excluded (inside the closed window)
//   at = endedAt        -> counted  (half-open end — the AT33 flake fix)
//   open window, at=now -> excluded (pause active)
// Usage: node scripts/acceptance/at33-boundary.mjs   (see README.md)
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const base = process.env.APE_BASE ?? "http://127.0.0.1:8788";
const dbFile = process.env.APE_DB_FILE ?? path.join(os.tmpdir(), "ape-accept002-new.db");
const results = [];
const ok = (name, pass, detail) => results.push({ name, status: pass ? "PASS" : "FAIL", detail });

async function req(method, p, { token, body } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data };
}
const pauseRow = (habitId) => {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const row = db
    .prepare("SELECT started_at, ended_at, policy FROM habit_pauses WHERE habit_id = ? ORDER BY started_at DESC LIMIT 1")
    .get(habitId);
  db.close();
  return row;
};

const username = `bnd${Date.now()}`;
const reg = await req("POST", "/api/auth/register", { body: { username, password: "Probe-Pass-1!" } });
const token = reg.data?.token;
if (!token) { console.log("register failed", reg); process.exit(1); }

const c = await req("POST", "/api/habits", { token, body: { title: "Boundary habit", cadence: "weekly", targetCount: 9 } });
const h = c.data.habit;

const p1 = await req("PATCH", `/api/habits/${h.id}`, { token, body: { paused: true, revision: h.revision } });
ok("pause -> 200 + paused flag", p1.status === 200 && p1.data?.habit?.paused === true, `status=${p1.status} paused=${p1.data?.habit?.paused}`);
const startedAt = pauseRow(h.id)?.started_at;
ok("pause row readable with started_at", Number.isFinite(startedAt), `started_at=${startedAt}`);
if (!Number.isFinite(startedAt)) { console.log(results); process.exit(1); }

// 1 ms before the window: an occurrence that predates the pause counts.
let r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: startedAt - 1 } });
ok("at = startedAt - 1 -> counted (done 1)", r.data?.period?.done === 1, `done=${r.data?.period?.done}`);

// Exactly at the open instant: excluded (inclusive start).
r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: startedAt } });
ok("at = startedAt -> excluded (done stays 1)", r.data?.period?.done === 1, `done=${r.data?.period?.done}`);

// Inside the open window, stamped at server now: excluded.
r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: Date.now() } });
ok("open window, at = now -> excluded (done stays 1)", r.data?.period?.done === 1, `done=${r.data?.period?.done}`);

// Resume, then probe the closed window's edges with the real ended_at.
const p2 = await req("PATCH", `/api/habits/${h.id}`, { token, body: { paused: false, revision: p1.data.habit.revision } });
ok("resume -> 200", p2.status === 200, `status=${p2.status}`);
const endedAt = pauseRow(h.id)?.ended_at;
ok("pause row closed with ended_at", Number.isFinite(endedAt), `ended_at=${endedAt}`);
if (!Number.isFinite(endedAt)) { console.log(results); process.exit(1); }

// 1 ms inside the closed window: excluded.
r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: endedAt - 1 } });
ok("at = endedAt - 1 -> excluded (done stays 1)", r.data?.period?.done === 1, `done=${r.data?.period?.done}`);

// Exactly the resume instant: counted — half-open [startedAt, endedAt) — the flake fix.
r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: endedAt } });
ok("at = endedAt -> counted (done 2) [HALF-OPEN FIX]", r.data?.period?.done === 2, `done=${r.data?.period?.done}`);

// Well after resume: counted.
r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: endedAt + 1 } });
ok("at = endedAt + 1 -> counted (done 3)", r.data?.period?.done === 3, `done=${r.data?.period?.done}`);

const fails = results.filter((x) => x.status === "FAIL");
for (const x of results) console.log(`${x.status}  ${x.name}  [${x.detail}]`);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);

// APE-ACCEPT-002 persistence check on the built artifact.
//   phase=snapshot : log in, fetch every fact family, save JSON + the session token.
//   phase=compare  : (server restarted on the same DB) re-fetch with a FRESH login and with the
//                    OLD token; assert facts are identical and the old session still works.
// Volatile, request-time-derived envelopes (calendar range + windows clipped to it, today's `now`)
// are normalized out — they are computed per request from Date.now(), not stored facts.
// Usage: node scripts/acceptance/persistence.mjs snapshot|compare   (see README.md)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.env.APE_BASE ?? "http://127.0.0.1:8788";
const dbFile = process.env.APE_DB_FILE ?? path.join(os.tmpdir(), "ape-accept002-new.db");
const file = process.env.APE_PERSIST_FILE ?? path.join(os.tmpdir(), "accept002-persist.json");
const phase = process.argv[2];

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

// Any registered test user works; the same credentials must be used for both phases.
const USER = process.env.APE_PROBE_USER ?? "probe1793019438370";
const PASS = process.env.APE_PROBE_PASS ?? "Probe-Pass-1!";

async function fetchAll(token) {
  const out = {};
  out.tasks = (await req("GET", "/api/tasks", { token })).data;
  out.goals = (await req("GET", "/api/goals", { token })).data;
  out.habits = (await req("GET", "/api/habits", { token })).data;
  out.calendar = (await req("GET", `/api/calendar?from=${Date.now() - 7 * 86400000}&to=${Date.now() + 7 * 86400000}`, { token })).data;
  out.activity = (await req("GET", "/api/activity?limit=200", { token })).data;
  out.today = (await req("GET", "/api/calendar/today", { token })).data;
  // B3-09 (APE-BATCH-003): work sessions and user settings are stored facts too. Neither was in
  // any stop/restart probe, so a restart that lost effort logs or reverted the user's working
  // hours would have come back "byte-identical". Sessions are read per task, so the task ids from
  // the list above drive the read; settings ride on /api/auth/me.
  out.settings = (await req("GET", "/api/auth/me", { token })).data;
  const taskIds = Array.isArray(out.tasks?.tasks) ? out.tasks.tasks.map((t) => t.id) : [];
  const sessions = {};
  for (const id of taskIds) {
    sessions[id] = (await req("GET", `/api/tasks/${id}/sessions`, { token })).data;
  }
  out.workSessions = sessions;
  return out;
}

if (phase === "snapshot") {
  const login = await req("POST", "/api/auth/login", { body: { username: USER, password: PASS } });
  if (login.status !== 200) { console.log("login failed", login.status, JSON.stringify(login.data)); process.exit(1); }
  const token = login.data.token;
  const facts = await fetchAll(token);
  const counts = Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v ?? {}).length]));
  fs.writeFileSync(file, JSON.stringify({ token, facts, counts }, null, 1));
  console.log("SNAPSHOT OK", JSON.stringify(counts), "->", file);
  process.exit(0);
}

if (phase === "compare") {
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  // 1. the OLD session token must still authenticate after restart
  const oldMe = await req("GET", "/api/auth/me", { token: saved.token });
  console.log(`old session after restart: status=${oldMe.status} user=${oldMe.data?.user?.username ?? "?"}`);
  // 2. a fresh login + full re-fetch must be byte-identical
  const login = await req("POST", "/api/auth/login", { body: { username: USER, password: PASS } });
  if (login.status !== 200) { console.log("fresh login failed", login.status); process.exit(1); }
  const now = await fetchAll(login.data.token);

  const norm = (f) => {
    const c = { ...f };
    if (c.calendar) {
      const { range, ...rest } = c.calendar;
      // The first free/working window is clipped to the query window (range.from, computed from
      // Date.now() per request); the last can be clipped to range.to. Normalize both to sentinels.
      const rf = range.from;
      const rt = range.to;
      for (const key of ["free", "workingWindows"]) {
        if (Array.isArray(rest[key]) && rest[key][0] && rf != null && rest[key][0].start === rf) {
          rest[key] = [{ ...rest[key][0], start: "CLIPPED" }, ...rest[key].slice(1)];
        }
        const arr = rest[key];
        if (Array.isArray(arr) && arr.length > 0 && rt != null && arr[arr.length - 1].end === rt) {
          const last = arr[arr.length - 1];
          rest[key] = [...arr.slice(0, -1), { ...last, end: "CLIPPED" }];
        }
      }
      c.calendar = rest;
    }
    if (c.today) {
      const { now, ...rest } = c.today;
      c.today = rest;
    }
    return c;
  };

  const a = JSON.stringify(norm(saved.facts));
  const b = JSON.stringify(norm(now));
  if (a === b) {
    console.log(`PERSISTENCE PASS: all ${Object.keys(saved.facts).length} fact families byte-identical after restart`);
    console.log("counts:", JSON.stringify(saved.counts));
    process.exit(oldMe.status === 200 ? 0 : 2);
  } else {
    console.log("PERSISTENCE FAIL: facts differ (normalized)");
    const na = norm(saved.facts);
    const nb = norm(now);
    for (const k of Object.keys(na)) {
      const x = na[k];
      const y = nb[k];
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      if (x && y && typeof x === "object" && !Array.isArray(x)) {
        for (const sk of Object.keys(x)) {
          const xs = JSON.stringify(x[sk]);
          const ys = JSON.stringify(y[sk]);
          if (xs !== ys) console.log(`  DIFF in ${k}.${sk}:\n    before=${xs.slice(0, 500)}\n    after =${ys.slice(0, 500)}`);
        }
      } else {
        console.log(`  DIFF in ${k}:\n    before=${JSON.stringify(x).slice(0, 500)}\n    after =${JSON.stringify(y).slice(0, 500)}`);
      }
    }
    process.exit(1);
  }
}
console.log("usage: node scripts/acceptance/persistence.mjs snapshot|compare");
process.exit(64);

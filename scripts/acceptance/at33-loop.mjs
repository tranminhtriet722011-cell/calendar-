// AT33 reproduction loop: pause -> checkin on the LIVE dist; on any unexpected done value,
// dump the raw habit_pauses / habit_checkins rows from the SQLite file for root-cause.
// Usage: node scripts/acceptance/at33-loop.mjs   (see README.md)
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const base = process.env.APE_BASE ?? "http://127.0.0.1:8788";
const dbFile = process.env.APE_DB_FILE ?? path.join(os.tmpdir(), "ape-accept002-new.db");

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

const username = `loop${Date.now()}`;
const reg = await req("POST", "/api/auth/register", { body: { username, password: "Probe-Pass-1!" } });
const token = reg.data?.token;
if (!token) { console.log("register failed", reg); process.exit(1); }

let anomalies = 0;
const ITERS = 40;
for (let i = 1; i <= ITERS; i++) {
  const c = await req("POST", "/api/habits", { token, body: { title: `AT33 loop ${i}`, cadence: "weekly", targetCount: 4 } });
  const h = c.data.habit;
  const t0 = Date.now();
  const p1 = await req("PATCH", `/api/habits/${h.id}`, { token, body: { paused: true, revision: h.revision } });
  const pausedAt = p1.data?.habit?.paused;
  const t1 = Date.now();
  const ck = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: Date.now() } });
  const t2 = Date.now();
  const done = ck.data?.period?.done;
  const occurredAt = ck.data?.checkin?.occurredAt;

  if (pausedAt !== true || done !== 0) {
    anomalies++;
    console.log(`ANOMALY iter=${i} pausedFlag=${pausedAt} done=${done} status(ck)=${ck.status}`);
    console.log(`  pauseRes=${JSON.stringify(p1.data)?.slice(0, 300)}`);
    console.log(`  checkinRes=${JSON.stringify(ck.data)?.slice(0, 300)}`);
    console.log(`  timings: t0(create)=${t0} t1(afterPause)=${t1} t2(afterCheckin)=${t2} occurredAt=${occurredAt}`);

    // Raw rows straight from the DB file (readonly; SQLite allows a second connection).
    try {
      const db = new DatabaseSync(dbFile, { readOnly: true });
      const pauses = db.prepare("SELECT id, started_at, ended_at, policy, created_at, updated_at FROM habit_pauses WHERE habit_id = ?").all(h.id);
      const checks = db.prepare("SELECT id, occurred_at, minutes, created_at FROM habit_checkins WHERE habit_id = ?").all(h.id);
      const habitRow = db.prepare("SELECT id, paused, pause_policy, revision FROM habit_definitions WHERE id = ?").get(h.id);
      console.log(`  habitRow=${JSON.stringify(habitRow)}`);
      console.log(`  pauses=${JSON.stringify(pauses)}`);
      console.log(`  checkins=${JSON.stringify(checks)}`);
      console.log(`  delta: occurredAt - started_at = ${pauses[0] && occurredAt != null ? occurredAt - pauses[0].started_at : "n/a"} ms`);
      db.close();
    } catch (e) {
      console.log(`  DB dump failed: ${e.message}`);
    }
  } else {
    process.stdout.write(`ok${i} `);
  }

  // leave the window open — each iteration uses a fresh habit
}
console.log(`\n${ITERS - anomalies}/${ITERS} iterations behaved (done=0 during open pause)`);
process.exit(anomalies ? 1 : 0);

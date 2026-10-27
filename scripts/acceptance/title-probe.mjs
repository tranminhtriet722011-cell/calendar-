// ACC-01 + AT33 probe against the RUNNING BUILT ARTIFACT.
// Expected behavior (server/http.ts optionalTitle): PATCH {title:""|"   "} -> 400 "title is
// required" with the stored title intact; absent title -> 200 name kept; valid rename -> 200.
// AT33: pause excludes occurrences while open; after resume the flow counts again.
// Usage: node scripts/acceptance/title-probe.mjs   (see README.md)
const base = process.env.APE_BASE ?? "http://127.0.0.1:8788";
const results = [];
const ok = (name, pass, detail) => results.push({ name, status: pass ? "PASS" : "FAIL", detail });

async function req(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 204 etc. */ }
  return { status: res.status, data };
}
// Wrapped ({goal|task|habit|event|milestone: ...}) or flat views both resolve.
const pick = (d, key) => (d && typeof d === "object" && d[key] ? d[key] : d);
const msg = (d) => d?.error?.message ?? "";

const stamp = Date.now();
const username = `probe${stamp}`;
const reg = await req("POST", "/api/auth/register", { body: { username, password: "Probe-Pass-1!" } });
ok("register (201 + token)", reg.status === 201 && !!reg.data?.token, `status=${reg.status}`);
const token = reg.data?.token;
if (!token) { console.log(JSON.stringify(results, null, 2)); process.exit(1); }

async function acc01(label, create, patchPath, readTitle) {
  const c = await create();
  if (!c?.id) { ok(`${label}: create`, false, `body=${JSON.stringify(c)}`); return; }
  const original = c.title;
  const path = patchPath(c);

  let r = await req("PATCH", path, { token, body: { title: "" } });
  ok(`${label}: PATCH title:'' -> 400 "title is required"`,
     r.status === 400 && /title is required/i.test(msg(r.data)), `status=${r.status} msg=${JSON.stringify(msg(r.data))}`);

  r = await req("PATCH", path, { token, body: { title: "   " } });
  ok(`${label}: PATCH title:'   ' -> 400`, r.status === 400, `status=${r.status}`);

  const kept = await readTitle();
  ok(`${label}: stored title intact after rejections`, kept === original, `title=${JSON.stringify(kept)} (want ${JSON.stringify(original)})`);

  r = await req("PATCH", path, { token, body: { title: `Renamed ${label}` } });
  ok(`${label}: valid rename -> 200`, r.status === 200, `status=${r.status}`);

  const absentBody = label === "task" ? { priority: 2 } : {};
  r = await req("PATCH", path, { token, body: absentBody });
  ok(`${label}: absent title -> 200`, r.status === 200, `status=${r.status}`);

  const after = await readTitle();
  ok(`${label}: rename persisted, absent-title kept the name`, after === `Renamed ${label}`, `title=${JSON.stringify(after)}`);
}

// 1. task
{
  let c = await req("POST", "/api/tasks", { token, body: { title: "A named task" } });
  const t = pick(c.data, "task");
  await acc01("task", async () => t, (e) => `/api/tasks/${e.id}`,
    async () => pick((await req("GET", `/api/tasks/${t.id}`, { token })).data, "task")?.title);
}
// 2. goal (PATCH returns a flat goalView)
{
  let c = await req("POST", "/api/goals", { token, body: { title: "A named goal" } });
  const g = pick(c.data, "goal");
  await acc01("goal", async () => g, (e) => `/api/goals/${e.id}`,
    async () => pick((await req("GET", `/api/goals/${g.id}`, { token })).data, "goal")?.title);
}
// 3. milestone (verified through the parent goal's list)
{
  let c = await req("POST", "/api/goals", { token, body: { title: "Parent goal" } });
  const g = pick(c.data, "goal");
  let m = await req("POST", `/api/goals/${g.id}/milestones`, { token, body: { title: "A named milestone" } });
  const ms = pick(m.data, "milestone");
  await acc01("milestone", async () => ({ ...ms, goalId: g.id }),
    (e) => `/api/goals/${e.goalId}/milestones/${e.id}`,
    async () => {
      const view = (await req("GET", `/api/goals/${g.id}`, { token })).data;
      const list = view?.milestones ?? view?.goal?.milestones;
      return list?.find((x) => x.id === ms.id)?.title;
    });
}
// 4. habit (verified through the list endpoint, like the test)
{
  let c = await req("POST", "/api/habits", { token, body: { title: "A named habit", cadence: "daily", targetCount: 1 } });
  const h = pick(c.data, "habit");
  await acc01("habit", async () => h, (e) => `/api/habits/${e.id}`,
    async () => {
      const list = await req("GET", "/api/habits", { token });
      return list.data?.habits?.find((x) => x.habit.id === h.id)?.habit?.title;
    });
}
// 5. calendar event (route is /api/calendar/events)
{
  const start = stamp + 6 * 3600000;
  let c = await req("POST", "/api/calendar/events", { token, body: { title: "A named event", startAt: start, endAt: start + 3600000 } });
  const ev = pick(c.data, "event");
  await acc01("event", async () => ev, (e) => `/api/calendar/events/${e.id}`,
    async () => {
      const cal = await req("GET", `/api/calendar?from=${Date.now() - 86400000}&to=${Date.now() + 86400000}`, { token });
      return cal.data?.events?.find((x) => x.id === ev.id)?.title;
    });
}

// --- AT33 on the built artifact ---
// Timestamp source: pause.started_at / ended_at are stamped with the SERVER process clock, and
// on this host the server clock reads 1-4 ms AHEAD of any other Node process (measured: the
// server's /api/health echo is already in the client's future in 37/40 round trips). A check-in
// stamped with the client's Date.now() immediately after pausing could therefore land a few ms
// BEFORE started_at and be counted - which is precisely the rule at33-boundary pins
// (at = startedAt - 1 -> counted), not a suppression bug. To make this probe's INPUT
// deterministic the check-ins are stamped with the server's own clock (the same clock that
// opened and closed the window); the assertions below are unchanged.
const serverNow = async () => (await req("GET", "/api/health")).data?.time ?? Date.now();
{
  let r = await req("POST", "/api/habits", { token, body: { title: "AT33 live habit", cadence: "weekly", targetCount: 4 } });
  const h = pick(r.data, "habit");
  const p1 = await req("PATCH", `/api/habits/${h.id}`, { token, body: { paused: true, revision: h.revision } });
  ok("AT33 pause -> 200", p1.status === 200, `status=${p1.status}`);
  const atDuring = await serverNow();
  r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: atDuring } });
  ok("AT33 during pause -> done 0", r.data?.period?.done === 0, `done=${r.data?.period?.done}`);
  const res2 = await req("PATCH", `/api/habits/${h.id}`, { token, body: { paused: false, revision: pick(p1.data, "habit")?.revision } });
  ok("AT33 resume -> 200", res2.status === 200, `status=${res2.status}`);
  // +1 keeps the second occurrence distinct from the first so AT34 dedup cannot merge them.
  const atAfter = Math.max(await serverNow(), atDuring + 1);
  r = await req("POST", `/api/habits/${h.id}/checkins`, { token, body: { minutes: 5, at: atAfter } });
  ok("AT33 after resume -> done 1", r.data?.period?.done === 1, `done=${r.data?.period?.done}`);
}

const fails = results.filter((x) => x.status === "FAIL");
for (const x of results) console.log(`${x.status}  ${x.name}  [${x.detail}]`);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
console.log(`PROBE_USER=${username}`);
process.exit(fails.length ? 1 : 0);

// APE-ACCEPT-FOLLOWUP-001: security spot-probes on the built artifact — unauthenticated 401,
// foreign-object 404 with an identical oracle for unknown vs foreign ids, foreign PATCH refused
// with no cross-owner write, and export credential-freeness. Promoted from a temporary ad-hoc
// script so the check is reproducible from the repository.
//
//   APE_BASE=http://127.0.0.1:8788 node scripts/acceptance/security-probe.mjs
const base = process.env.APE_BASE ?? "http://127.0.0.1:8788";
const results = [];
const ok = (name, pass, detail) => results.push({ name, status: pass ? "PASS" : "FAIL", detail });

async function req(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data, text: JSON.stringify(data) };
}

const stamp = Date.now();
const a = (await req("POST", "/api/auth/register", { body: { username: `secA${stamp}`, password: "Probe-Pass-1!" } })).data.token;
const b = (await req("POST", "/api/auth/register", { body: { username: `secB${stamp}`, password: "Probe-Pass-1!" } })).data.token;

// 1. unauthenticated reads are 401
let r = await req("GET", "/api/tasks");
ok("unauth GET /api/tasks -> 401", r.status === 401, `status=${r.status}`);
r = await req("GET", "/api/goals");
ok("unauth GET /api/goals -> 401", r.status === 401, `status=${r.status}`);

// 2. foreign object access answers 404, and the oracle is identical for unknown vs foreign ids
const bTask = (await req("POST", "/api/tasks", { token: b, body: { title: "B task alpha" } })).data.task;
r = await req("GET", `/api/tasks/${bTask.id}`, { token: a });
const foreign = { status: r.status, msg: r.data?.error?.message ?? "" };
r = await req("GET", "/api/tasks/tsk_doesnotexist0000000000000000", { token: a });
const unknown = { status: r.status, msg: r.data?.error?.message ?? "" };
ok("foreign GET -> 404", foreign.status === 404, `status=${foreign.status}`);
ok("unknown GET -> 404", unknown.status === 404, `status=${unknown.status}`);
ok("oracle identical (foreign == unknown)", JSON.stringify(foreign) === JSON.stringify(unknown),
   `foreign=${JSON.stringify(foreign)} unknown=${JSON.stringify(unknown)}`);

// 3. foreign PATCH also refuses (no write across owners)
r = await req("PATCH", `/api/tasks/${bTask.id}`, { token: a, body: { title: "hijacked" } });
ok("foreign PATCH -> 404, no write", r.status === 404, `status=${r.status}`);
const still = (await req("GET", `/api/tasks/${bTask.id}`, { token: b })).data.task;
ok("victim title unchanged", still?.title === "B task alpha", `title=${JSON.stringify(still?.title)}`);

// 4. export carries no credential material
r = await req("GET", "/api/export", { token: b });
const expText = r.text;
const leaks = ["password", "passwordHash", "token", "Bearer", "secret"].filter((k) => expText.toLowerCase().includes(k.toLowerCase()));
ok("export (if present) has no credential material", r.status === 200 ? leaks.length === 0 : r.status === 404,
   `status=${r.status} leaks=${JSON.stringify(leaks)}`);

const fails = results.filter((x) => x.status === "FAIL");
for (const x of results) console.log(`${x.status}  ${x.name}  [${x.detail}]`);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);

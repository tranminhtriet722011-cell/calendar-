// APE-ACCEPT-FOLLOWUP-001: REV-001 close-out probe — PATCH /api/auth/settings must reject every
// invalid clock shape with 400, name the offending field, and leave the stored settings
// byte-identical (no partial write). Replaces the ad-hoc probe that previously lived only in a
// temp file, so the check is reproducible from the repository.
//
// APE-BATCH-003 (D-039/D-040) adds: strict graceMinutes (non-number/out-of-range are 400s,
// null/absent keeps) and the window-ordering rule (start < end for workingHours and softRest,
// equal and inverted windows refused, validated on the merged pair).
//
//   APE_BASE=http://127.0.0.1:8788 node scripts/acceptance/settings-clock-probe.mjs
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
  return { status: res.status, data };
}

const stamp = Date.now();
const { data: auth } = await req("POST", "/api/auth/register", { body: { username: `clk${stamp}`, password: "Probe-Pass-1!" } });
const token = auth.token;
const me = async () => (await req("GET", "/api/auth/me", { token })).data.user.settings;
const before = await me();

const fields = [
  ["workingHours.start", (v) => ({ workingHours: { start: v } })],
  ["workingHours.end", (v) => ({ workingHours: { end: v } })],
  ["softRest.start", (v) => ({ softRest: { start: v } })],
  ["softRest.end", (v) => ({ softRest: { end: v } })],
];

const invalid = ["", " ", "99:99", "24:00", "23:60", "8:00", "0800", "08:00:00", "aa:bb", " 08:00 ", 8, true, ["08:00"]];
let rejected = 0;
let named = 0;
for (const [path, patch] of fields) {
  for (const value of invalid) {
    const r = await req("PATCH", "/api/auth/settings", { token, body: { settings: patch(value) } });
    if (r.status === 400) rejected++;
    const msg = r.data?.error?.message ?? "";
    if (msg.includes(path)) named++;
  }
}
ok("all invalid clocks -> 400", rejected === fields.length * invalid.length, `${rejected}/${fields.length * invalid.length}`);
ok("every 400 names its field", named === fields.length * invalid.length, `${named}/${fields.length * invalid.length}`);
ok("stored settings unchanged after rejects", JSON.stringify(await me()) === JSON.stringify(before), JSON.stringify(await me()));

// Wrong-shaped containers must not silently no-op past their own field validation.
const shapes = [
  ["workingHours string", { workingHours: "08:00" }],
  ["workingHours null", { workingHours: null }],
  ["workingHours array", { workingHours: ["08:00"] }],
  ["softRest string", { softRest: "12:00" }],
  ["settings array", ["08:00"]],
  ["settings string", "08:00"],
];
let shapeRejected = 0;
for (const [label, value] of shapes) {
  const r = await req("PATCH", "/api/auth/settings", { token, body: { settings: value } });
  if (r.status === 400) shapeRejected++;
  else console.log(`  note: ${label} -> status=${r.status}`);
}
ok("wrong-shaped settings/sections -> 400", shapeRejected === shapes.length, `${shapeRejected}/${shapes.length}`);
ok("still unchanged after shape rejects", JSON.stringify(await me()) === JSON.stringify(before), JSON.stringify(await me()));

// Valid writes still work, and null keeps the stored value (documented "not sent" contract).
const good = await req("PATCH", "/api/auth/settings", { token, body: { settings: { workingHours: { start: "09:15", end: "17:45" }, softRest: { start: "12:15", end: "13:15" } } } });
ok("valid clocks accepted", good.status === 200, `status=${good.status}`);
const after = await me();
ok("valid clocks stored verbatim", after.workingHours.start === "09:15" && after.workingHours.end === "17:45" && after.softRest.start === "12:15" && after.softRest.end === "13:15", JSON.stringify(after));
const nulled = await req("PATCH", "/api/auth/settings", { token, body: { settings: { workingHours: { start: null, end: null } } } });
ok("null keeps the stored value", nulled.status === 200 && (await me()).workingHours.start === "09:15", `status=${nulled.status} start=${(await me()).workingHours.start}`);
// Edge values round-trip exactly (no coercion of 00:00 / 23:59).
const edge = await req("PATCH", "/api/auth/settings", { token, body: { settings: { workingHours: { start: "00:00", end: "23:59" } } } });
ok("00:00 and 23:59 accepted", edge.status === 200 && (await me()).workingHours.start === "00:00" && (await me()).workingHours.end === "23:59", `status=${edge.status}`);

// --- APE-BATCH-003: strict graceMinutes (D-040) ---
const graceBad = ["", " ", "25", true, false, [], [25], {}, -1, 121, 999];
let graceRejected = 0;
let graceNamed = 0;
for (const value of graceBad) {
  const r = await req("PATCH", "/api/auth/settings", { token, body: { settings: { graceMinutes: value } } });
  if (r.status === 400) graceRejected++;
  if ((r.data?.error?.message ?? "").includes("settings.graceMinutes")) graceNamed++;
}
ok("all invalid graceMinutes -> 400", graceRejected === graceBad.length, `${graceRejected}/${graceBad.length}`);
ok("every graceMinutes 400 names the field", graceNamed === graceBad.length, `${graceNamed}/${graceBad.length}`);
const graceBefore = JSON.stringify(await me());
ok("stored settings unchanged after grace rejects", JSON.stringify(await me()) === graceBefore, graceBefore.slice(0, 120));
const graceBounds = [
  [0, 0], [120, 120], [25.6, 26],
];
let graceAccepted = 0;
for (const [value, stored] of graceBounds) {
  const r = await req("PATCH", "/api/auth/settings", { token, body: { settings: { graceMinutes: value } } });
  if (r.status === 200 && (await me()).graceMinutes === stored) graceAccepted++;
}
ok("graceMinutes bounds 0/120 + rounding accepted", graceAccepted === graceBounds.length, `${graceAccepted}/${graceBounds.length}`);
const graceNulled = await req("PATCH", "/api/auth/settings", { token, body: { settings: { graceMinutes: null } } });
ok("graceMinutes null keeps stored value", graceNulled.status === 200 && (await me()).graceMinutes === 26, `status=${graceNulled.status} grace=${(await me()).graceMinutes}`);

// --- APE-BATCH-003: window ordering (D-039) ---
// Reset a known baseline first: the partial-patch cases ("start-only inverts stored end") are
// only invalid relative to the STORED partner, and the edge test above left end=23:59.
const baseline = await req("PATCH", "/api/auth/settings", { token, body: { settings: { workingHours: { start: "08:00", end: "22:00" } } } });
if (baseline.status !== 200) console.log(`  note: baseline reset -> status=${baseline.status}`);
const orderBad = [
  ["workingHours inverted", { workingHours: { start: "22:00", end: "08:00" } }],
  ["workingHours equal", { workingHours: { start: "08:00", end: "08:00" } }],
  ["softRest inverted", { softRest: { start: "13:00", end: "12:00" } }],
  ["softRest equal", { softRest: { start: "12:00", end: "12:00" } }],
  ["start-only inverts stored end", { workingHours: { start: "23:30" } }],
  ["end-only before stored start", { workingHours: { end: "07:00" } }],
];
let orderRejected = 0;
let orderNamed = 0;
for (const [label, patch] of orderBad) {
  const r = await req("PATCH", "/api/auth/settings", { token, body: { settings: patch } });
  if (r.status === 400) orderRejected++;
  const msg = r.data?.error?.message ?? "";
  if (msg.includes("settings.workingHours.end") || msg.includes("settings.softRest.end")) orderNamed++;
  if (r.status !== 400) console.log(`  note: ${label} -> status=${r.status}`);
}
ok("inverted/equal windows -> 400", orderRejected === orderBad.length, `${orderRejected}/${orderBad.length}`);
ok("every ordering 400 names the end field", orderNamed === orderBad.length, `${orderNamed}/${orderBad.length}`);
const orderSnapshot = JSON.stringify(await me());
const orderRejectAgain = await req("PATCH", "/api/auth/settings", { token, body: { settings: { workingHours: { start: "22:00", end: "08:00" } } } });
ok("re-reject leaves settings byte-identical", orderRejectAgain.status === 400 && JSON.stringify(await me()) === orderSnapshot, JSON.stringify(await me()).slice(0, 120));
// A valid ordered pair still works after all the rejects.
const ordered = await req("PATCH", "/api/auth/settings", { token, body: { settings: { workingHours: { start: "09:00", end: "17:00" } } } });
ok("valid ordered window still accepted", ordered.status === 200 && (await me()).workingHours.start === "09:00" && (await me()).workingHours.end === "17:00", `status=${ordered.status}`);

const fails = results.filter((x) => x.status === "FAIL");
for (const x of results) console.log(`${x.status}  ${x.name}  [${x.detail}]`);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);

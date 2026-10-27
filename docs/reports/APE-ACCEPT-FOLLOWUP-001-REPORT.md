# APE-ACCEPT-FOLLOWUP-001 — Follow-up Acceptance Verification (REV-001 + full re-drive)

- **Task:** APE-ACCEPT-FOLLOWUP-001 (close REV-001 settings-clock validation; re-drive the full browser journey on the exact final build; accessibility + 320 px checks; rerun all gates and probes; independent review; update decision log and traceability)
- **Date:** 2026-10-27
- **Environment:** Windows (PowerShell), Node 24.22.0, npm 11.19.1, Chromium via harness browser tooling, OpenCode
- **Repository state:** branch `main` — pushed baseline `162e959` → `ebadcec` → `5d5f7a2` → `a08846b` → **`031e8f4`** (this task's code) → this report's commit. **Nothing pushed since `162e959`** (push gate = fresh PO approval).
- **Build artifact under test:** `dist/server.mjs` + `dist/client/`, rebuilt **2026-10-27 13:01:36** from HEAD `a08846b` + the delta committed as `031e8f4`. Client asset hashes `index-3KTc5oFt.css` / `index-Bb2QX7pF.js` were byte-identical across every rebuild of this task (client source never changed).
- **Final status:** **PASS WITH LIMITATIONS** — every core area has executed-command evidence; two bounded items are **NOT VERIFIED** by tooling limitation (320 px viewport, Settings *screen*), never upgraded to PASS (§H).

---

## A. Overview

### Completed
- **REV-001 fixed and regression-pinned.** `PATCH /api/auth/settings` now rejects every invalid clock shape on all four `HH:mm` fields with a `400` naming the field, refuses wrong-shaped settings sections, and — the core of the original defect — leaves the stored settings **byte-identical** when a request is rejected (validation happens while `merged` is built, before `updateSettings`, so no partial write is possible).
- **Test baseline 108 → 116** with **8 new FUP tests** (FUP-01…FUP-08), the test diff purely additive (452 insertions / 15 deletions across the commit, no existing assertion touched).
- **`npm run check` green on the final source** (typecheck + 116/116 tests + vite + esbuild, exit 0), re-run after every change including the last one.
- **Full browser journey re-driven on the final build** from a brand-new user on a fresh temp DB — 18 product flows, each with an observed response (§C).
- **Accessibility run:** Lighthouse (axe-based) on Today / Calendar / Tasks / Goals / Habits / Activity → **score 1.0 on all six views, 0 a11y failures**; Today and Tasks re-measured on the exact final artifact.
- **All acceptance probes green on the exact final build:** settings-clock **9/9**, security **8/8**, title **35/35**, AT33 boundary **10/10**, AT33 loop **40/40**, persistence **6/6**, single-origin **1 origin / 0 external**.
- **Independent `ape-reviewer` pass:** **APPROVE WITH COMMENTS** (0 Critical / 0 High / 1 Medium / 4 Low / 3 Info); two safe findings fixed and re-verified, all eight dispositioned in D-038 (§E).
- **DECISION_LOG D-038** and a dated **traceability evidence log** appended, covering the strictness change, the deliberate no-ordering-rule reading, backward-compatibility audit, and every review disposition.
- **One acceptance-probe anomaly root-caused with hard measurements** rather than re-run away: the AT33 during-pause check flaked 3× in 21 runs because this host's **server process clock reads 1–4 ms ahead of any other Node process** (proved with 40 round trips). The probe's *input* was made deterministic (server-stamped check-in times); its assertions and the pinned boundary semantics are unchanged (§E.4).

### NOT VERIFIED (bounded, §H)
- **320 px viewport pass** — no viewport/device-emulation tool exists, Lighthouse does not emulate a device, and the harness blocks same-origin iframe emulation. Manual/static evidence only.
- **Settings *screen* invalid-clock input with an accessible error** — no settings screen exists in the product (implementation spec §11.1: "Settings are API-only"). Evidence is API-level (9/9) plus the accessible-error convention verified live elsewhere in the journey.

---

## B. Deliverables

| Deliverable | State |
|---|---|
| REV-001: strict clock validation on `PATCH /api/auth/settings` | **Done** — §E.1, probe 9/9, 8 regression tests |
| Regression tests incl. "rejected request leaves settings unchanged" | **Done** — FUP-04, suite 116/116 |
| Full journey re-driven on the exact final build, per-flow evidence | **Done** — §C rows 3–20 |
| Settings UI invalid-clock input → accessible error | **Not applicable / NOT VERIFIED** — no settings screen exists (§H.2); API-level evidence only |
| Accessibility (axe/Lighthouse) on 7 views | **Done** — 6 views exist, all score 1.0 (§C row 22) |
| 320 px check | **NOT VERIFIED** — tooling limitation, manual/static evidence recorded (§H.1) |
| `npm run check`, probes, persistence, security, single-origin rerun | **Done** — §C rows 2, 21–25 |
| Independent review of the delta + disposition of REV-003/004 | **Done** — APPROVE WITH COMMENTS, all findings dispositioned (§E.3) |
| DECISION_LOG + TRACEABILITY updated with non-colliding IDs | **Done** — D-038; FUP-01…FUP-08 and REV-FUP-01…08 ID spaces |
| Consolidated final report | **Done** — this file |

---

## C. Gate & acceptance table

Legend: PASS = executed command or observed response in this effort. NOT VERIFIED = not executed; never upgraded to PASS.

### Acceptance criteria

| AC | Criterion | Status | Evidence |
|---|---|---|---|
| AC01 | REV-001 fixed with regression evidence | **PASS** | `settings-clock-probe` **9/9** on the built artifact (52/52 invalid clocks → 400, every 400 names its field, stored settings byte-identical after rejects); FUP-01…FUP-07 tests in `npm test` **116/116** |
| AC02 | Gate green on the final source | **PASS** | `npm run check` → **exit 0** (tsc clean, 116/116, vite + esbuild) — final run after the last change |
| AC03 | Full journey re-driven per-flow on the final build | **PASS** | Browser rows 3–20 below, fresh user `fupuser01`, fresh temp DB, final artifact |
| AC04 | Accessibility **and** 320 px each PASS/FAIL/NOT VERIFIED | **PASS (criterion met)** — a11y **PASS**, 320 px **NOT VERIFIED** | a11y: Lighthouse **1.0 on all 6 views**, 0 failures; 320 px: NOT VERIFIED with recorded manual/static evidence (§H.1) |
| AC05 | Persistence + security + single-origin pass | **PASS** | persistence **6/6** after stop/restart on the same DB with old session → 200; security **8/8**; single-origin **1 origin, 0 external** |
| AC06 | Review complete, every finding dispositioned | **PASS** | `ape-reviewer` **APPROVE WITH COMMENTS**; REV-FUP-01…08 all dispositioned in D-038 (2 fixed, 6 accepted with rationale) |
| AC07 | Report separates executed evidence / inference / limitations | **PASS** | This report: §D executed commands, §E findings with origin, §H limitations, VERIFIED labels throughout |
| AC08 | No push / deploy / real-DB mutation | **PASS** | `git status`/`git log` show only local commits; `data/ape.db` absent and never opened — all runs on `%TEMP%\ape-followup001.db` |

### Journey flows (all on the final build, fresh DB, user `fupuser01`)

| # | Flow | Status | Evidence |
|---|---|---|---|
| 3 | Register / sign-in, honest empty states | PASS | Browser: registration form → `Signed in as fupuser01`; Today "A blank day" empty state |
| 4 | Quick add → inbox, nothing auto-scheduled | PASS | "Draft quarterly report" created; Today shows *Next action* / "Not on the calendar yet" |
| 5 | Goal creation with counted progress | PASS | "Launch the newsletter" created, `active`, **0/3** |
| 6 | Three tasks with estimates/priority | PASS | 90 min P1, 60 min P2, 45 min P2 all present with correct estimates |
| 7 | Plan preview: 3 proposals + honest feasibility | PASS | **Minimal changes / Deadline first / Balanced**; `Feasible — required 3 h 15 min of 98 h free time.` |
| 8 | Commit → sessions placed + audit | PASS | 3 planned blocks (08:00 / 08:00 / 13:00) + `schedule.commit` audit entry; response `applied` = 3 ids |
| 9 | Undo → blocks released + audit | PASS | Blocks `[]` after Undo; audit `schedule.commit.undo` + 3× `block.released` |
| 10 | Double-undo rejected honestly | PASS | Second undo → **409 `not_undoable`** "This action cannot be undone." |
| 11 | Session start → In progress | PASS | Start on "Write newsletter draft" → status `in_progress`, revision 2 |
| 12 | Work log with accessible announcement | PASS | "Logged 45 min in 1 session(s)"; live region `role="status"`: *Work log recorded for "Write newsletter draft".* |
| 13 | Complete → future sessions released | PASS | `complete` → 200, `releasedBlocks: [blk_131884195ae84bc388c30815]`, status `completed` |
| 14 | Recovery proposals after missed work | PASS | 3 proposals with trigger `need-more-time on Design newsletter template` + `agent.recovery.proposal` audit |
| 15 | Stale-edit two-tab conflict (revision) | PASS | Tab1 saves (rev 2); tab2's stale save refused — server title unchanged — and UI shows `role="alert"` *"⚠ Error: Task changed since you loaded it. Refresh to see the current version."* |
| 16 | E3 state-machine guard | PASS | `in_progress → not_started` → **409** "Task cannot move from in_progress to not_started."; status unchanged |
| 17 | Locked calendar + overlap 409 | PASS | Locked "Locked standup" event; overlapping block → **409** naming the event, `locked: true`, `canOverride: true` |
| 18 | Two-step override with audited exception | PASS | Without confirmation → **409** "requires an explicit confirmation"; with `confirm: true` → **201** + `schedule.exception` audit |
| 19 | Habits 0 → 1 → 2 of 3 | PASS | API `done: 0 → 1 → 2`; UI *"weekly 2 of 3 this period (67% attainment)"*, "Recent check-ins (2)" |
| 20 | Offline behaviour + recovery | PASS | Server stopped: already-loaded SPA surfaces `role="alert"` *"⚠ Error: Request failed with status 502."* and **preserves form input** (no crash/data loss); cold reload → clean browser error page; after restart **no phantom write** (offline-created task absent) and the app recovers with the session intact |

### Checks, probes and non-journey areas

| # | Area | Status | Evidence |
|---|---|---|---|
| 2 | Full automated gate (final) | PASS | `npm run check` → **exit 0**; `npm test` → **116/116** (4 files: domain 27, api 23, api-flow 23, regression 43); `tsc --noEmit` clean; `vite build` (44 modules) + `esbuild` OK |
| 21 | Settings clock validation (REV-001) | PASS | `settings-clock-probe.mjs` **9/9** (new, committed) |
| 22 | Accessibility — Lighthouse (axe) on Today/Calendar/Tasks/Goals/Habits/Activity | PASS | **Score 1.0 on all six views, 0 a11y failures** (only non-a11y SEO findings: meta description, robots.txt). Today + Tasks re-measured on the final artifact → 1.0 / 1.0 |
| 23 | 320 px viewport | **NOT VERIFIED** | No viewport/device-emulation tool; Lighthouse does not emulate a device; harness blocks same-origin iframe emulation (`chrome-error://chromewebdata/`). Manual/static evidence: `width=device-width, initial-scale=1.0` meta; explicit `(max-width: 30rem)` = 480 px breakpoint commented *"Small screens (down to 320px)"* collapsing grids and stacking rows; no fixed-px widths (all fluid, only a safe `max-width: 992px`); `overflow-x: auto` on the one scroll region. See §H.1 |
| 24 | Settings screen invalid-clock input + accessible error | **NOT VERIFIED** | No settings screen exists (implementation spec §11.1 "Settings are API-only"; nav shows Today/Calendar/Tasks/Goals/Habits/Activity only — verified in the browser). API-level evidence 9/9; the accessible-error convention is verified live in rows 15 and 20. See §H.2 |
| 25 | API security probes | PASS | `security-probe.mjs` **8/8** (new, committed): unauth 401, foreign/unknown 404 with byte-identical oracle, foreign PATCH → 404 with victim unchanged, export credential-free |
| 26 | Title blanking (ACC-01, regression) | PASS | `title-probe.mjs` **35/35** on the final artifact (and 20/20 consecutive runs — §E.4) |
| 27 | AT33 pause boundary / loop | PASS | `at33-boundary.mjs` **10/10** (incl. `at = endedAt → counted`); `at33-loop.mjs` **40/40** |
| 28 | Persistence across restart | PASS | `persistence.mjs snapshot` → stop → restart same DB → `compare`: **6/6 fact families byte-identical**, old session token → **200** |
| 29 | Single origin / no external AI | PASS | `performance` entries: **1 origin** (`http://127.0.0.1:8788`), **0 external**, all scripts self-hosted (re-checked on the final build) |
| 30 | Independent review of the delta | PASS | `ape-reviewer` → **APPROVE WITH COMMENTS**; reviewer independently executed `npm test` → 116/116; findings dispositioned in §E.3 |
| 31 | Backward compatibility of the stricter validation | PASS | Read-only audit of **3 temp DBs / 20 user rows / 0 invalid stored clocks**; `data/ape.db` absent; all 108 pre-existing tests unchanged and green; no in-repo settings caller exists |

---

## D. Commands actually run (this effort)

| Command | Result |
|---|---|
| `npm test` / `npx vitest run` | **116/116 passed** (4 files) — baseline **108** + **8** new FUP tests; repeated after every test change |
| `npm run check` (typecheck + tests + vite + esbuild) | **PASSED (exit 0)** — run at baseline, after each fix, and after the final change |
| `node scripts/acceptance/settings-clock-probe.mjs` (new) | **9/9 PASS** on the built artifact |
| `node scripts/acceptance/security-probe.mjs` (new) | **8/8 PASS** |
| `node scripts/acceptance/title-probe.mjs` | **35/35 PASS** on the final artifact; **20/20** consecutive green runs after the input-determinism fix (3 failures in 21 runs before it, root-caused §E.4) |
| `node scripts/acceptance/at33-boundary.mjs` | **10/10 PASS** |
| `node scripts/acceptance/at33-loop.mjs` | **40/40 PASS** |
| `node scripts/acceptance/persistence.mjs snapshot` → stop server → restart same DB → `compare` | **PERSISTENCE PASS 6/6**, old session → **200** (run on the final artifact) |
| Browser harness (navigate / snapshot / evaluate / lighthouse) | Full journey (rows 3–20), a11y on 6 views, single-origin scan, offline test |
| Clock-skew measurement (40 × `GET /api/health` round trips) | Server time **> client-after-response in 37/40** rounds; `min(serverTime − clientBeforeRequest) = 2 ms` — server process clock ahead by 1–4 ms |
| Reproduction loops for the AT33 flake | 15 runs → 2 failures; 60-run mimic → 6 failures, raw rows show `occurred_at = started_at − 1…−4 ms`; **20/20 clean after the fix** |
| `ape-reviewer` subagent | **APPROVE WITH COMMENTS** — findings REV-FUP-01…08 |
| Git | `031e8f4` (code, local) + this report's commit; **no push** |

---

## E. Defects & findings

### E.1 Fixed in this task

1. **REV-001 (PRE-EXISTING, Medium → FIXED): `PATCH /api/auth/settings` silently coerced invalid clocks.** Root cause: clock fields were parsed with a permissive ≤8-char string helper, so `{"workingHours":{"start":""}}` answered **200**, stored `""`, and `buildScheduleContext → parseClock` later read it as `00:00` — a silent coercion on a hard-constraint input (working-window / protected-time arithmetic). Fix: `optionalClock` (`server/http.ts`) accepts only `^([0-9]{2}):([0-9]{2})$` with hour ≤ 23 and minute ≤ 59 — the range check is separate because **the shape regex alone lets `99:99` through** — and the route (`server/routes/auth.ts`) validates the top-level `settings`, both nested sections, and all four clock fields while building `merged`, **before** `updateSettings`, so a `400` anywhere leaves the stored settings byte-identical. Empty/whitespace/padded/malformed/non-string/out-of-range → `400 "<field> must be a time in HH:mm format (00:00-23:59)."`; `null`/absent = keep; valid values round-trip byte-identical (no trimming, padding or normalisation). Proof: **8 regression tests** + **probe 9/9 on the built artifact**.
2. **Secondary hole closed (same change): wrong-shaped sections no-op'd past validation.** `settings: []` and `workingHours: "08:00"` are `typeof "object"` and previously slipped past the top-level check and dodged every field check. `optionalObject` now refuses them (`400 "… must be an object"`), keeping the original message string byte-identical while adding `details.field`.
3. **REV-003 / REV-004 (Info, PRE-EXISTING → CLOSED with the missing tests).** Rather than accepting them on paper, FUP-08 pins the actual behaviour: a non-string title → `400 "must be text"`; a whitespace-padded rename is stored **trimmed**; and the length cap is evaluated on the **raw** string, matching the long-standing `asString` convention (301 spaces → 400; 300 chars + padding → 400). All three assertions green in 116/116.
4. **AT33 during-pause probe flake (PRE-EXISTING, root-caused with measurements → probe input made deterministic).** Observed 3 failures in 21 runs (`done=1` during an open pause). Raw rows showed the check-in stamped **1–4 ms *before*** the pause's `started_at` even though it was sent after the pause response; 40 health round trips then proved the **server process clock reads 1–4 ms ahead of the client process** on this host (`serverTime > clientAfterResponse` in 37/40). This is **not a product defect**: the suppression rule `startedAt <= instant` is behaving exactly as `at33-boundary` pins it (`at = startedAt − 1 → counted`), and no product-side tolerance is possible without breaking that pinned boundary. Fix (probe-side only): the two AT33 check-ins are now stamped with the **server's own clock** (`GET /api/health`) — the same clock that opened and closed the window — with a `+1 ms` guard so AT34 dedup cannot merge them. **Assertions unchanged**; 20/20 consecutive green runs afterwards. This also supersedes ACCEPT-002's partial explanation of the same anomaly by supplying the missing *why*.

### E.2 Remaining (disclosed, not hidden)

- **`graceMinutes` still coerces silently** (`""`/`null` → 0), unlike its now-strict clock siblings (review **REV-FUP-04**). Accepted for this increment: it is a clamped soft-tolerance input, not a clock field, and was outside the task's clock scope. Routed to a future increment.
- **No start/end ordering rule** (deliberate). Both specs define working/rest windows as wall-clock ranges but specify **no** ordering requirement, so `22:00 → 08:00` is not rejected; `buildScheduleContext` produces an inverted window exactly as it did before this change. Adding one would be a spec decision, not an implementation detail (D-038).
- **Legacy invalid stored clocks are not repaired on read** (`parseClock` stays lenient) and **no migration was added** (**REV-FUP-06**). Accepted: the audit found **0** such rows in any local DB, `data/ape.db` does not exist, and the write path is now closed.
- **`workingHours.days` still silently filters invalid entries** (**REV-FUP-08**) — accepted, out of clock scope.
- **320 px and the Settings screen remain NOT VERIFIED** (§H).

### E.3 Independent review dispositions (`ape-reviewer` — APPROVE WITH COMMENTS; 0 Critical / 0 High / 1 Medium / 4 Low / 3 Info)

| Finding | Severity / Origin | Disposition |
|---|---|---|
| REV-FUP-01 — strictness change and the no-ordering-rule reading had no repo documentation | Medium / NEW | **Fixed** — D-038 + the 2026-10-27 traceability evidence log |
| REV-FUP-02 — FUP-06 advertised four round-trip edge values but asserted only `edges[0]` | Low / NEW | **Fixed** — now loops every edge on every field (4 × 4 assertions) |
| REV-FUP-03 — `settings: []` now 400s and the 400 carries `details.field` | Low / NEW | **Accepted** — zero blast radius (no in-repo caller), recorded in D-038 |
| REV-FUP-04 — `graceMinutes` still coerces | Low / PRE-EXISTING | **Accepted for this increment**, routed to a future increment (§E.2) |
| REV-FUP-05 — describe/title ranges said "FUP-01 … FUP-07" while containing FUP-08 | Low / NEW | **Fixed** — header and describe title now say FUP-01 … FUP-08 |
| REV-FUP-06 — legacy invalid clocks not repaired on read | Info / PRE-EXISTING | **Accepted**, disclosed (§E.2); audit found 0 such rows |
| REV-FUP-07 — confirm the no-ordering-rule reading is correct, not a missed requirement | Info / PRE-EXISTING | **Confirmed and recorded** in D-038 |
| REV-FUP-08 — `workingHours.days` still silently filters | Info / PRE-EXISTING | **Accepted**, out of clock scope (§E.2) |

The reviewer independently executed `npm test` → **116/116** and confirmed the test diff is purely additive (nothing weakened).

### E.4 Test-strength statement
No assertion was weakened, deleted, or relaxed to obtain a green result. The only test-side edits were **additive** (8 new FUP tests), **strengthening** (FUP-06 now exercises all four edge values on all four fields), **cosmetic** (FUP-05 range labels), and one **input-determinism** fix on an acceptance probe whose assertions are unchanged (§E.1.4).

---

## F. Security review

- **Owner scoping:** foreign GET/PATCH → **404** with an oracle **byte-identical** to unknown-id 404; victim title unchanged after the foreign write attempt (`security-probe` 8/8 on the final artifact).
- **Authentication:** unauthenticated reads → **401**; auth was not weakened anywhere in this delta (the settings route still runs behind `requireUser`).
- **Secrets:** no `.env`/key material read, committed or echoed; the session secret used for the temp server was a throwaway non-production value; `data/ape.db` never opened.
- **Error hygiene:** the new 400 messages carry only the field path and the format hint — no value echo, no existence leak, no stack/detail leakage; rejected requests leak nothing beyond what a valid request reveals.
- **AI boundary / network:** app fully usable with no external AI; final build loads **0 external origins**.
- **No control weakened:** revision/stale-edit (row 15), E3 state machine (row 16), locked-calendar two-step override (rows 17–18), audit (`schedule.commit`, `schedule.commit.undo`, `schedule.exception`, `agent.recovery.proposal`, `habit.checkin`), and protected-time arithmetic were all re-verified live on the final build.

---

## G. Files changed by this task (commit `031e8f4`, plus this report)

| File | Change |
|---|---|
| `server/http.ts` | **NEW** `optionalClock` (strict `HH:mm` + range) and `optionalObject` (nested-section shape) helpers |
| `server/routes/auth.ts` | `PATCH /api/auth/settings` restructured — all validation while building `merged`, before `updateSettings` (no partial write) |
| `tests/regression.test.ts` | **+8 tests** FUP-01…FUP-08 (empty/whitespace, `99:99`/out-of-range, malformed/non-string, no-partial-write, wrong-shaped sections, valid round-trip + null/absent-keeps, end-to-end scheduler honouring, REV-003/004 close-out) |
| `scripts/acceptance/settings-clock-probe.mjs` | **NEW** — reproducible live probe for REV-001 (9 checks) |
| `scripts/acceptance/security-probe.mjs` | **NEW** — promoted from a temporary ad-hoc script so the security check is reproducible (8 checks) |
| `scripts/acceptance/title-probe.mjs` | AT33 check-ins now server-stamped (input determinism only; assertions unchanged) — §E.1.4 |
| `docs/DECISION_LOG.md` | **D-038** — strict clocks, array rejection, null-means-keep, no-ordering-rule decision, backward-compat audit, all REV-FUP-01…08 dispositions |
| `docs/spec/APE_V1_1_TRACEABILITY.md` | 2026-10-27 evidence log (commands + results incl. 116/116, probe counts, a11y 1.0, 320 px NOT VERIFIED, offline, review verdict) |
| `docs/reports/APE-ACCEPT-FOLLOWUP-001-REPORT.md` | **NEW** — this report |

---

## H. Environment limitations affecting the result

1. **320 px viewport — NOT VERIFIED.** The harness exposes no viewport/device-emulation tool; Lighthouse explicitly does not emulate a device; and injecting a same-origin 320 px iframe was blocked by the harness (frame failed to load, `chrome-error://chromewebdata/`). Only manual/static evidence is claimed: correct `width=device-width, initial-scale=1.0` meta; an explicit `(max-width: 30rem)` (= 480 px) breakpoint labelled *"Small screens (down to 320px)"* that collapses `.form-grid` to one column and stacks `.item-head`; a DOM/CSS scan found **no fixed-px widths** (every measured width is fluid; the only fixed value is a safe `max-width: 992px`) and `overflow-x: auto` on the single scroll region. **This is not a pass** — a real device/emulated-viewport run is still required to upgrade it.
2. **Settings screen — NOT VERIFIED.** The product has no settings screen (implementation spec §11.1 "Settings are API-only"; browser nav shows only Today/Calendar/Tasks/Goals/Habits/Activity). Therefore "Settings UI invalid clock input → accessible error" cannot be driven. Substituted evidence: API-level validation **9/9** on the built artifact, plus the accessible-error convention (`role="alert"` / `role="status"`) verified live on the stale-edit and offline flows (rows 15, 20). If a settings screen is ever built, this must be re-verified.
3. **Journey vs. rebuild provenance.** The journey was driven against the artifact built at **12:31**; two later rebuilds (12:44, 13:01) changed **only** `tests/`, `scripts/` and `docs/` — no `server/` or `client/` source changed afterwards, output sizes stayed identical (`server.mjs` 150235 B, `index.html` 455 B, CSS 7873 B, JS 301646 B) and the client asset hashes never changed. All probes, persistence, single-origin and the a11y spot-checks were **re-run on the 13:01 artifact**.
4. **Probe iteration.** Three probe-side issues were found and corrected during this effort (the AT33 clock-skew input above; `at33-boundary`/`persistence` defaulting to the previous task's DB file, requiring `APE_DB_FILE`; and one wrong endpoint path in a draft test). None was a product defect; the committed versions are the corrected ones.
5. **Browser gotchas handled** (documented in the `acceptance-verification` skill): focus the tab before clicking; `browser.snapshot` `depth` max 20, so deep sections (Timeline) need a native DOM click via `browser.evaluate`; React inputs need the native value setter + `input`/`change` events; select option values are `"1"`–`"5"`, not labels; same-URL navigation is same-document (a cache-buster forces a real reload).

---

## I. Run instructions (reproduce the evidence)

```powershell
# 1. Gate — expect exit 0, 116/116 tests
npm run check

# 2. Built artifact on a throwaway database (NEVER data/ape.db)
$env:APE_PORT = 8788
$env:APE_DB_FILE = "$env:TEMP\ape-followup001.db"    # delete for a fresh first-run
$env:APE_SESSION_SECRET = "followup-dev-secret-not-a-real-key-0123456789"
node dist/server.mjs

# 3. Probes (server must be listening; see scripts/acceptance/README.md)
$env:APE_BASE = "http://127.0.0.1:8788"
node scripts/acceptance/settings-clock-probe.mjs   # expect 9/9   (REV-001)
node scripts/acceptance/security-probe.mjs         # expect 8/8
node scripts/acceptance/title-probe.mjs            # expect 35/35 (repeat it: 20/20 observed)
node scripts/acceptance/at33-boundary.mjs          # expect 10/10 (needs $env:APE_DB_FILE set)
node scripts/acceptance/at33-loop.mjs              # expect 40/40
node scripts/acceptance/persistence.mjs snapshot
#   -> stop the server, restart it on the same APE_DB_FILE:
node scripts/acceptance/persistence.mjs compare    # expect PERSISTENCE PASS + old session 200

# 4. UI: http://127.0.0.1:8788/ — register, quick-add, create a goal and 3 tasks,
#    Activity -> "Ask for a plan (next 7 days)" -> Apply -> Undo; two-tab edit conflict;
#    habit check-ins; then stop the server and confirm an already-loaded tab announces
#    "Error: Request failed with status 502." via role="alert" with input preserved.

# 5. Review gate: npm test  ->  expect 116/116
```

---

## J. Approvals required next

1. **Push** of the local commits (`ebadcec`, `5d5f7a2`, `a08846b`, `031e8f4`, this report commit) — gated `ask` per D-030; **not attempted**.
2. **320 px verification** on a real device or an emulated-viewport tool — the only way to upgrade §C row 23 from NOT VERIFIED.
3. **Decision on `graceMinutes` coercion** (REV-FUP-04) and on whether a start/end **ordering rule** should be added to the spec (D-038) — both are product/spec choices, deliberately not made unilaterally.
4. Optional: if a Settings screen is ever added (spec §11.1 currently forbids one), re-verify invalid-clock input and its accessible error in the UI (§C row 24).

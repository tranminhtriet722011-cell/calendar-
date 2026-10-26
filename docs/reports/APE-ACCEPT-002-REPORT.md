# APE-ACCEPT-002 — Final Product Acceptance Audit

- **Task:** APE-ACCEPT-002 (end-to-end acceptance verification of the APE product; defects fixed within safe scope)
- **Date:** 2026-10-26
- **Environment:** Windows (PowerShell), Node 24, Chromium via harness browser tooling, OpenCode v2.1.4
- **Repository state:** branch `main` — `162e959` (pushed baseline) → `ebadcec` (ACCEPT-002 WIP checkpoint) → `5d5f7a2` (separate SETUP-001 tooling task) → this report's commit. **Nothing pushed since `162e959`** (push gate = ask, PO approval required).
- **Final status:** **PASS** — every core acceptance area has executed-command evidence. Three named limitations in §H bound the claim; one pre-existing backlog defect (REV-001) is disclosed, not hidden.

---

## A. Overview

### Completed
- **Discovery & baseline** — repo/scripts/deps/config/run-docs inspected; `npm run check` green at baseline; git baseline captured before any change.
- **Automated checks rerun** — full gate executed repeatedly across the effort; final run: **108/108 tests, typecheck clean, client + server build OK (exit 0)**.
- **Browser end-to-end on a fresh database** — registration → first-run empty states → quick add → goals → plan preview (3 proposals, feasibility honest incl. infeasible shortfall with named reasons) → commit (sessions placed, undo offered, double-undo blocked with honest message) → execute (start → work log → complete) → recovery proposals → stale-edit two-tab conflict → E3 state-machine guard → infeasible-plan honesty → habits 0→1→2 of 3 → calendar lock/overlap-409/two-step override with audited exception → offline (85 requests, single local origin).
- **Two acceptance defects found, root-caused, fixed, regression-pinned, and re-verified on the built artifact** (§E).
- **Persistence verified twice** — original journey and again on the final build: stop → restart on the same DB → 6/6 fact families byte-identical (request-time envelopes normalized), API session survives (200), browser session survives a full page load.
- **Security probes** — unauthenticated 401, foreign-object 404 with an oracle identical to unknown-id 404, foreign PATCH refuses with no write, export carries no credential material, duplicate check-ins deduplicated; re-run 8/8 on the final build; single-origin re-confirmed (4/4 resources, zero external).
- **Independent review** — `ape-reviewer` pass over the full ACCEPT-002 delta: **APPROVE** (0 Critical/High; findings dispositioned in §E).
- **Evidence tooling committed** — `scripts/acceptance/` (4 probes + README) so every live claim is reproducible.

### Not completed / NOT VERIFIED (bounded, §H)
- The full browser journey was **not re-driven on the final build**; it was driven on the pre-fix build, and every code path touched since is re-verified by the current test suite plus targeted live probes. The delta analysis is stated per-flow in §C.
- Automated accessibility tooling (axe/Lighthouse) and a 320 px viewport pass were not run in this task; only manual keyboard/focus/error-state checks apply.
- One probe anomaly (AT33 during-pause `done=1`, once in ~62 executions) was investigated to a spec-consistent explanation and pinned by the deterministic boundary probe (§E.2); it is disclosed rather than waved away.

---

## B. Deliverables

| Deliverable | State |
|---|---|
| Acceptance verification of core flows (fresh DB, journeys, errors, constraints, undo/audit, offline) | **Done** — evidence in §C |
| Persistence across restart | **Done** — PASS on the final build |
| API security review | **Done** — PASS, 8/8 probes re-run |
| Requirement-to-evidence mapping | **Done** — §C + `docs/spec/APE_V1_1_TRACEABILITY.md` (AT33 row + 2026-10-26 evidence log) |
| Defect fixes in safe scope (ACC-01, AT33 flake, REV-002) | **Done** — each with a regression test |
| Independent review | **Done** — APPROVE with dispositions |
| Decision log entry for the behavioral choices | **Done** — D-037 |
| Reproducible acceptance probes | **Done** — `scripts/acceptance/` |
| Full a11y tooling run / mobile viewport pass | **Not done** — §H (out of this task's executed scope) |

---

## C. Gate & acceptance table

Legend: PASS = executed command/observed response in this effort. "Prior build" = driven during the earlier phases of this task before the three fixes; the delta since is covered by the "Final build" rows.

| # | Area / flow | Status | Evidence |
|---|---|---|---|
| 1 | Repo, scripts, deps, config, run docs valid | PASS | `git log/status`, `opencode debug config`, `npm run check` (multiple runs) |
| 2 | Full automated gate (final) | PASS | `npm run check` → **exit 0**; `npm test` → **108/108** (4 files); `tsc --noEmit` clean; `vite build` + `esbuild` bundle OK |
| 3 | First-run on fresh DB (register, sign-in, honest empty states) | PASS | Browser, fresh `dist` + fresh temp DB, user `uib20261026`; "A blank day — a good place to start" observed |
| 4 | Quick add → inbox, nothing auto-scheduled | PASS | Prior build (browser) — path untouched since; covered by `api-flow`/`api` suites |
| 5 | Goals → plan preview: 3 proposals, feasibility honest, infeasible shortfall with named reasons | PASS | Prior build (browser) — scheduler code untouched by this task's delta; `npm test` green |
| 6 | Commit → sessions placed; undo works; double-undo blocked with honest message | PASS | Prior build (browser + audit entries) — untouched since |
| 7 | Execute: start → work log → complete | PASS | Prior build (browser) — untouched since |
| 8 | Calendar: locked event honored, overlap → 409 with named conflict, two-step override → audited `schedule.exception` | PASS | Prior build (browser + API); override audit reason correctness fixed earlier per D-036 |
| 9 | Recovery proposals after missed work | PASS | Prior build (browser) — untouched since |
| 10 | Stale-edit two-tab conflict (revision 409) | PASS | Prior build (browser) |
| 11 | E3 state-machine guard on illegal transition | PASS | Prior build (browser) + `regression.test` REV-001 (still green: 108/108) |
| 12 | Infeasible plan stated honestly (no silent constraint violation) | PASS | Prior build (browser) |
| 13 | Habits: 0 → 1 → 2 of 3 period attainment | PASS | Prior build (browser) |
| 14 | **Habit pause policy AT33 (final build)** | PASS | `npx vitest run tests/api-flow.test.ts -t "AT33"` ×**20/20**; `scripts/acceptance/at33-loop.mjs` **40/40**; `scripts/acceptance/at33-boundary.mjs` **10/10** incl. `at = endedAt → counted`; new deterministic `regression.test` boundary test |
| 15 | **Empty/whitespace title cannot blank any entity (ACC-01, final build)** | PASS | `scripts/acceptance/title-probe.mjs` **35/35** on all 5 PATCH routes against `dist/server.mjs`; 10 ACC-01 regression tests |
| 16 | **UI title rename end-to-end (final build)** | PASS | Browser: create "UI rename probe" → edit → save → row shows "Renamed via UI", old title gone |
| 17 | **UI empty-title rejection (final build)** | PASS | Browser: clear title → save → `⚠ Error: Title is required.` announced via `role="alert"`; row keeps "Renamed via UI"; field now `required` with "Title *" label (REV-002 fix verified: `input.required === true`, `aria-describedby` → hint) |
| 18 | **Persistence across restart (final build)** | PASS | `persistence.mjs snapshot` → kill server → restart same DB → `compare`: **6/6 fact families byte-identical** (range/`now` envelopes normalized), old session token → **200**; browser full reload → still signed in, renamed task present, fresh form state |
| 19 | Offline / no external AI (final build) | PASS | Browser `performance` entries: **4/4 resources from `http://127.0.0.1:8788`, zero external origins** (prior journey: 85 requests, same single origin); no fonts/CDN/analytics/AI endpoints |
| 20 | API security: unauth 401 | PASS | Final build: `GET /api/tasks`, `GET /api/goals` without token → **401** |
| 21 | API security: foreign vs unknown oracle identical | PASS | Final build: both → **404 `Task not found.`**, byte-identical bodies; foreign PATCH → 404 and victim title unchanged |
| 22 | API security: export credential-free | PASS | Final build: `GET /api/export` → 200, no `password`/`token`/`Bearer`/`secret` material |
| 23 | Duplicate submission dedup | PASS | AT34 suite (in 108/108) + prior live probe; check-in dedup path re-exercised by boundary probe |
| 24 | Independent review of the change set | PASS | `ape-reviewer` verdict **APPROVE**; `npm test` rerun by reviewer → 108/108 |
| 25 | Automated a11y tooling (axe/Lighthouse), 320 px pass | NOT VERIFIED | Not executed in this task; manual keyboard/focus/error-state checks only. Next: run axe on Tasks/Calendar views. |

**Prior-build note for rows 4–13:** those flows were driven end-to-end in the browser during this task's earlier phases (fresh DB, real UI). Since then the only product changes are: `optionalTitle` on 5 PATCH routes (rows 15–17 re-verified live), the TasksView edit form (rows 16–17), and the `habitPeriod` closed-window bound (row 14 re-verified live). No other server path was modified; the full suite (108/108) covers the untouched routes.

---

## D. Commands actually run (this effort)

| Command | Result |
|---|---|
| `npm run check` | PASS (exit 0) — typecheck + tests + client build + server bundle; run at baseline, after each fix, and final |
| `npm test` / `npx vitest run` | **108/108** (4 files); baseline was 107/107 pre-task, +1 for the AT33 boundary test |
| `npx vitest run tests/regression.test.ts` | 35/35 (incl. 10 ACC-01 + boundary test) |
| `npx vitest run tests/api-flow.test.ts -t "AT33"` ×20 | 20/20 |
| `node scripts/acceptance/title-probe.mjs` | 35/35 PASS (built artifact, port 8788, fresh temp DB) |
| `node scripts/acceptance/at33-boundary.mjs` | 10/10 PASS |
| `node scripts/acceptance/at33-loop.mjs` | 40/40 PASS |
| `node scripts/acceptance/persistence.mjs snapshot` → restart → `compare` | PERSISTENCE PASS (6/6 families, session 200) |
| Security probe (temp `accept002-security.mjs`) | 8/8 PASS |
| Browser harness (navigate/evaluate, separate calls) | Registration, task create/rename/empty-title error, required-attr check, session-after-reload, single-origin scan |
| `ape-reviewer` subagent | APPROVE — findings REV-001..004 |
| Git | `ebadcec` (WIP checkpoint), `5d5f7a2` (SETUP-001), this report commit — all local |

---

## E. Defects

### Fixed in this task
1. **ACC-01 (FAIL → fixed): `PATCH {title: ""}` returned 200 and blanked the record.** Root cause: permissive title parsing on update paths while creation always required a non-empty title. Fix: `optionalTitle` (`server/http.ts`) applied at all 5 title-bearing PATCH sites (tasks, goals, milestones, habits, events) — empty/whitespace → **400 `title is required.`**, absent/null keeps the stored name; client edit form gained the Title field with `required`, hint, and the server error surfaced via `role="alert"` (D-037). Proof: 10 regression tests + **35/35 live on the built artifact** + browser rename/empty-title flows.
2. **AT33 flake (root-caused → fixed): a same-millisecond post-resume check-in was excluded.** Root cause: inclusive closed-window bound `instant <= endedAt` at `server/store.ts` suppressed an occurrence stamped exactly at the resume instant. Fix: closed windows are half-open `[startedAt, endedAt)`; open windows stay inclusive of `nowMs` (D-037). Proof: new deterministic boundary test (fixed timestamps, no `Date.now()`), **20/20 stress runs**, **10/10 boundary probe with real `started_at`/`ended_at` read from SQLite**, **40/40 loop**. The one historical anomaly (`done=1` during an open pause, once in ~62 executions) is explained by the boundary probe's first case: an occurrence stamped before `started_at` is spec-correctly counted; no product path was found where a genuine in-window occurrence counts (reviewer independently confirmed `mapPause` emits `null` and this is the only suppression computation).
3. **REV-002 (NEW, Low → fixed):** edit-form Title lacked `required` vs the create form. Fixed, rebuilt, re-verified in-browser (`input.required === true`, label `Title *`, hint wired via `aria-describedby`).

### Remaining (disclosed)
- **REV-001 (Medium, PRE-EXISTING, backlog):** `PATCH /api/auth/settings` accepts `workingHours.start: ""`, stored as `""` and silently parsed as 00:00 by the scheduler — the same blanking *class* as ACC-01 on a different field, outside this task's ACC-01 scope. Recommended fix: validate clock strings (`^\d{2}:\d{2}$`) in the settings PATCH with a regression test. **Not fixed here** (scope discipline); routed to the next `/implement` increment.
- **REV-003/004 (Info):** `optionalTitle` treats `null` as absent and checks length pre-trim (both consistent with `asString`); optional edge tests (`title: 42 → 400`, trim-on-rename) not added.

---

## F. Security review

- **Owner scoping:** foreign GET/PATCH → 404 with an oracle identical to unknown ids; victim data unchanged after the foreign write attempt (§C rows 20–22, executed on the final build).
- **Authentication:** unauthenticated reads → 401; login answers identically for unknown user/wrong password (no account enumeration — code-verified, exercised in flows).
- **Secrets:** no `.env`/key material read, committed, or echoed; `opencode.json` deny gates on `*.env`/`*.pem`/`*.key`/`secrets/*` intact and verified effective; export contains no credential material.
- **AI boundary:** app fully usable with no external AI; final bundle loads zero external origins (row 19).
- **Error hygiene:** new 400 messages carry only field names; no existence leak (identical foreign/unknown responses).
- **Reviewer security pass:** no findings beyond REV-001 (above); E2/H-invariants unchanged — renames still bump revision + audit; the AT33 change is read-side only.

---

## G. Files changed by this task (since `162e959`, excluding the separate SETUP-001 tooling task)

| File | Change |
|---|---|
| `server/http.ts` | `optionalTitle` helper (ACC-01) |
| `server/routes/tasks.ts`, `server/routes/calendar.ts`, `server/routes/planning.ts` | 5 PATCH call sites switched to `optionalTitle` |
| `client/views/TasksView.tsx` | Edit-form Title field (required + hint + server error), REV-002 `required` |
| `server/store.ts` | `habitPeriod` pause suppression: half-open closed windows (AT33 fix) |
| `tests/regression.test.ts` | ACC-01 block (10 tests) + AT33 boundary test (+116 lines) |
| `scripts/acceptance/{README.md,title-probe.mjs,at33-boundary.mjs,at33-loop.mjs,persistence.mjs}` | NEW — reproducible acceptance probes |
| `docs/DECISION_LOG.md` | D-037 |
| `docs/spec/APE_V1_1_TRACEABILITY.md` | AT33 evidence cell + 2026-10-26 evidence log |
| `docs/reports/APE-ACCEPT-002-REPORT.md` | NEW — this report |

Commits: `ebadcec` (WIP checkpoint: fixes 1 + tests), `5d5f7a2` (SETUP-001, separate task), plus this report's commit. **No push performed.**

---

## H. Environment limitations affecting the result

1. **Full journey not re-driven on the final build** (rows 4–13): the browser journey ran on the pre-fix build; the three deltas since are re-verified live (rows 14–19) and by the 108/108 suite. A complete re-drive is the safe next step if the PO wants journey-level evidence on the exact final bytes.
2. **A11y tooling:** axe/Lighthouse and a 320 px viewport pass were not executed; only manual keyboard/focus/error-state observations are claimed (row 25 = NOT VERIFIED).
3. **Browser gotchas handled** (documented in the `acceptance-verification` skill): navigate-then-evaluate separately; React inputs need the native value setter + `input`/`change` events; same-URL navigations are same-document (a cache-buster forces a real reload).
4. **Probe iteration:** three probe-side expectation/shape bugs (wrong event route path, wrapped-vs-flat response shapes, a self-referential substring match) were found and corrected in the probes — none was a product defect; the corrected probes are the committed versions.

---

## I. Run instructions (reproduce the evidence)

```powershell
# 1. Gate
npm run check            # typecheck + 108/108 tests + client/server build

# 2. Built artifact on a throwaway database (never data/ape.db)
$env:APE_PORT = 8788
$env:APE_DB_FILE = "$env:TEMP\ape-accept002-new.db"   # delete for a fresh first-run
node dist/server.mjs      # or: npm start after npm run build

# 3. Probes (server must be listening; see scripts/acceptance/README.md)
node scripts/acceptance/title-probe.mjs        # expect 35/35
node scripts/acceptance/at33-boundary.mjs      # expect 10/10
node scripts/acceptance/at33-loop.mjs          # expect 40/40
node scripts/acceptance/persistence.mjs snapshot
#   → stop the server (Ctrl+C / Stop-Process), restart it on the same APE_DB_FILE:
node scripts/acceptance/persistence.mjs compare # expect PERSISTENCE PASS + old session 200

# 4. UI: open http://127.0.0.1:8788/ — register, create a task, Edit → rename;
#    clearing the Title must show "Error: Title is required." and keep the name.
```

## J. Approvals required next

1. **Push** of the local commits (`ebadcec`, `5d5f7a2`, this report commit) — gated `ask` per D-030; not attempted.
2. **Backlog scheduling** of REV-001 (settings clock validation) as a bounded `/implement` increment with a regression test.
3. Optional: full browser journey re-drive on the exact final build + axe/320 px pass to upgrade rows 4–13/25 from carried-over to re-verified (§H.1–2).

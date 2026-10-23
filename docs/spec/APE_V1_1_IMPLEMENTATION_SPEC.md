# APE V1.1 — Implementation-Ready Specification

- **Version:** V1.1 (implementation baseline)
- **Date:** 2026-10-22
- **Status:** IMPLEMENTED (this document describes what the repository actually contains; every claim is backed by the traceability matrix or is marked PROPOSED)
- **Relationship to the master spec:** this is the *implementation-ready version* required by contract §4.4. It reconciles `docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md` (V1.0, unchanged and preserved as source material) with the decisions in `docs/DECISION_LOG.md`. Where V1.0 is ambiguous or self-conflicting, the resolution recorded here is the one implemented, and the original wording is still honoured or explicitly logged as a deviation.
- **Traceability:** `docs/spec/APE_V1_1_TRACEABILITY.md` maps every acceptance criterion (AT01–AT55) to an executed test, a manual check, or an explicit deferral.

---

## 1. Scope of this increment

### 1.1 In scope (implemented)

| Capability | Notes |
|---|---|
| Local account registration, login, logout, settings (API-only in this increment — no settings screen; see §11.1) | username + password only; no email, no OAuth |
| Tasks: capture, estimate, due date, priority, parent/subtask, goal link, status transitions, ordering | quick add with a title alone leaves the task in Inbox |
| Calendar: fixed/rest events, manual work blocks, move/resize/lock/delete, free-time computation | conflicts are reported, never silently overwritten. The client edits/moves/resizes **work blocks**; events are locked/unlocked and deleted from the UI, and event move/resize is enforced server-side through the same conflict validator (`PATCH /calendar/events/:id`, review REV-013) but has no dedicated client control yet |
| Goals: count and milestone metrics, explicit progress logging, milestones, breakdown drafts → commit | progress never moves as a side effect |
| Habits: daily/weekly cadence, target count, check-ins, pause windows with policy, history scoped to the habit | no streak pressure; attainment is the primary measure |
| Deterministic scheduler: hard filter → soft rank, three strategies, infeasibility report with concrete options | suggest-only; nothing is written until approval |
| Recovery: "need more time" re-planning around fixed events and existing sessions, impact preview | moves are shown before they happen |
| Execution: manual/timer effort logs, remaining-work answers, late-start / overdue / overtime / at-risk flags, early completion | completing early releases only that task's own sessions |
| Audit timeline, undo (semantic, with conflict preview), data export | every schedule change is attributable |
| Accessible responsive web client | loading / empty / error states, keyboard support, reduced motion |

### 1.2 Out of scope for this increment (deferred, see D-006)

External calendar sync (Google/Apple/CalDAV), offline queue and multi-device merge, native Android
app, LLM-authored drafts, monthly/complex habit metrics and streaks, backup/restore drill, hosted
deployment, multi-user collaboration.

---

## 2. Technology baseline (Decision D-002)

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js ≥ 24 | built-in `node:sqlite`, no native build step |
| Language | TypeScript 5.9, `strict` | one language across server, client and tests |
| Server | Express 5, modular monolith | small surface, easy to test over real HTTP |
| Persistence | SQLite (`node:sqlite`), WAL off, temp DB for tests | zero-configuration local data |
| Client | React 19 + Vite 7, no router/UI/CSS dependency | dependency surface stays auditable |
| Tests | Vitest 3 (domain unit + real-HTTP integration) | evidence must come from executed code |
| Bundling | esbuild (server), Vite (client) | `npm run build` is fully local |

No runtime network dependency: no CDN, no web fonts, no telemetry, no paid service, no external
model. `npm run dev` and `npm start` both work offline once dependencies are installed.

### 2.1 Module boundaries

```
server/domain/   pure logic, no I/O: time.ts, scheduler.ts, taskState.ts
server/store.ts  persistence + invariants (revisions, audit, owner scoping)
server/db.ts     schema and numbered migrations
server/http.ts   auth middleware, param validation, error contract
server/routes/   HTTP adapters only; they compose store + domain
client/          presentation only; it talks exclusively to /api
```

Rule: domain code never imports Express or SQLite; routes never reimplement scheduling or state
rules; the client never computes authoritative state (it may only mirror for display).

---

## 3. Data model (SQLite)

All tables carry `user_id` where the row belongs to an owner, `revision` for optimistic concurrency,
and `created_at` / `updated_at` in epoch milliseconds.

| Table | Purpose | Notable columns |
|---|---|---|
| `users` | accounts and settings | `password_hash`, `salt` (scrypt), `timezone`, `settings_json` (working windows, rest, grace) |
| `sessions` | opaque bearer tokens | `token_hash`, `expires_at` (revoked on logout) |
| `goals` | outcomes | `metric_type` (`count`/`milestone`), `target`, `current`, `due_at`, `status` |
| `milestones` | goal steps | `status` (`todo`/`done`) |
| `tasks` | work items | `estimate`, `remaining`, `actual`, `due_at`, `priority`, `goal_id`, `parent_id`, `position`, `status` |
| `events` | calendar events | `kind` (`fixed`/`rest_soft`/`rest_protected`), `locked` |
| `blocks` | planned work sessions | `start_at`, `end_at`, `status` (`planned`/`completed`/`released`/`cancelled`), `locked`, `source` |
| `work_sessions` | measured effort | `started_at`, `minutes`, `source` (`timer`/`manual`), `remaining_after` |
| `habit_definitions` | habits | `cadence` (`daily`/`weekly`), `target_count`, `paused`, `pause_policy` (`exclude`/`count`) |
| `habit_checkins` | occurrences | `occurred_at`, `minutes` |
| `habit_pauses` | bounded pause windows (AT33) | `started_at`, `ended_at`, `policy` |
| `proposals` | AI/APE suggestions | `payload_json`, `base_revisions_json`, `status`, `expires_at`, `idempotency_key` |
| `audit_events` | append-only timeline | `actor` (`user`/`agent`/`system`), `before_json`, `after_json`, `proposal_id`, `undoable` |
| `idempotency_keys` | commit replay protection | `key` (unique per user), `response_json` |

### 3.1 Invariants enforced in code (master spec PHẦN E)

1. **Owner scoping.** Every read and write filters by `user_id`; a foreign ID yields `404`, which
   discloses nothing about existence (`AT42`).
2. **Revision safety.** Updates accept an expected `revision`; a mismatch returns `409` with the
   current revision (`AT45` server side, decision D-007).
3. **Remaining effort is authoritative.** `remaining = max(estimate_after_edit, remaining_after_last_log)`
   so an estimate edit can never erase recorded progress; `actual` is only ever changed by a work log
   (`AT03`, `AT04`).
4. **Measured effort is immutable.** Work sessions are never rewritten by schedule operations;
   completing a task releases only that task's future sessions (`AT25`).
5. **Progress is explicit.** Goal `current` changes only through `POST /goals/:id/progress`, habit
   attainment only through check-ins; moving, logging or completing work does not touch them
   (`AT06`, `AT36`).
6. **Append-only audit.** Schedule changes write `audit_events` with actor, before/after and the
   originating proposal ID; undo writes its own entry rather than deleting history (`AT40`).
7. **No silent infeasibility.** A request that cannot be satisfied returns an explicit shortfall with
   minutes, reasons and concrete `userOptions` (`AT26`).

---

## 4. Time semantics (master spec PHẦN D/H, decision D-008)

- Instants are stored and transported as **epoch milliseconds (UTC)**; no local-time strings.
- Every user has an IANA `timezone` (default `Asia/Ho_Chi_Minh`; test accounts use `UTC`). Calendar
  boundaries (day/week windows, habit periods) are computed in that zone.
- Working windows and rest windows are configured per user as local wall-clock ranges
  (default 08:00–22:00 daily; soft rest 12:00–13:00) and applied to the requested range.
- DST is handled by the platform `Intl` APIs: the 23-hour and 25-hour days are handled explicitly and
  covered by unit tests (`AT19`).
- Habits count **occurrences inside the period**, not wall-clock streaks (CR07): a weekly habit's
  period starts on Monday in the user's zone.

---

## 5. Scheduler and proposal contract (master spec PHẦN F/G)

### 5.1 Deterministic pipeline

```
input ──► hard filter (H1–H11) ──► soft rank ──► per-strategy packing ──► validate ──► proposals
                                                              └─ or ─► feasibility report
```

1. **Hard filter** removes any candidate window that would violate a locked/fixed event, protected
   rest, working hours, or a hard due date. Hard constraints are never traded for soft ones.
2. **Soft rank** orders remaining candidates by the strategy's objective and ties are broken by
   documented, stable keys (age, then id) so equal inputs produce equal output (`AT17`, `AT18`).
3. **Packing** places `planChunks(...)` sessions: chunks respect min/max block length, never split a
   non-splittable task, and always sum to the remaining effort (`AT15`).
4. **Validation** re-checks every placement against the world *as it will be after the proposal is
   applied* — sessions the proposal releases are excluded from the obstacle set (spec F8,
   decision D-015).
5. Session starts are aligned to **15-minute boundaries** when the window allows it, falling back to
   the raw earliest start for tight windows, so replanning a moment later does not drift (AT18).

### 5.2 Strategies

| Strategy | Objective | Tie-break |
|---|---|---|
| `minimal` | smallest number of moves, earliest feasible start | earliest start, then window end, then hard before soft |
| `deadline` | earliest deadline first | higher priority breaks equal deadlines |
| `balanced` | spread sessions to limit fragmentation | largest distance to the nearest placed session, then earlier start |

Up to three *distinct* proposals are returned; duplicates (identical signature) are collapsed.
Each proposal carries a stable `contentId` (FNV-1a over strategy + placements + releases) so an
unchanged plan is recognisably unchanged (`AT18`).

### 5.3 Proposal lifecycle (decision D-009)

- Generated with `baseRevisions` pinning every task/event/block it looked at and a TTL
  (`expiresAt`).
- `POST /api/schedule/commit` re-validates: proposal exists/pending/unexpired → base revisions
  unchanged (`409 stale_proposal`) → placements still satisfy hard constraints → applied in one SQL
  transaction → audit written → `idempotency_key` stored so an identical retry replays the same
  response (`AT29`, `AT41`).
- Dismissal changes nothing on the calendar (`AT28`).

### 5.4 Infeasibility

Never silently violated: the response reports `requiredMinutes`, `freeMinutes`, `shortfallMinutes`,
per-task `shortfalls` with the reason (including non-split window limits), and `userOptions` such as
reducing scope, moving a deadline, adding availability, or overriding with an explicit confirmation
(`AT26`).

---

## 6. Recovery (master spec PHẦN F6–F8, acceptance K3)

`POST /api/schedule/need-more` re-plans a single task with the extra or corrected remaining effort:

1. Loads the task's future sessions as **releaseable** (they may move — the impact preview shows
   how many), keeps every other task and every fixed/locked event as an obstacle.
2. Returns proposals whose placements never overlap a fixed event or a protected rest, together with
   `impact` (`movedBlocks`, `addedBlocks`, `tasksTouched`, `atRiskTaskIds`) and `feasibility`
   (`AT24`, `AT27`).
3. The user approves or dismisses exactly as with a normal plan; the same commit guards apply.

**Undo** (`POST /api/activity/:id/undo`, decision D-010) is semantic, not a log rollback:

- restoring a deleted row fails with `undo_conflict` if the row has since changed;
- reversing a commit releases the sessions it created and restores the ones it released — but only
  if those blocks still carry revision 1; any user edit since then produces a conflict preview
  listing entity, id and reason (`AT30`, `AT31`).

---

## 7. HTTP API surface

Base path `/api`. Auth: `Authorization: Bearer <token>`. Body must be JSON. Errors:

```json
{ "error": { "code": "conflict", "message": "human readable", "details": { } } }
```

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/settings` |
| Tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id` (DELETE archives, cascade to subtasks), `POST /tasks/:id/status`, `POST /tasks/:id/complete`, `POST /tasks/:id/log`, `GET /tasks/:id/sessions` |
| Calendar | `GET /calendar?from&to`, `GET /calendar/today`, `POST/PATCH/DELETE /calendar/events`, `POST/PATCH/DELETE /calendar/blocks` (both PATCH routes report `conflicts`, require `override` + `confirm` for hard conflicts; the block PATCH also reports `estimateChanged`) |
| Goals | `GET/POST /goals`, `GET/PATCH /goals/:id`, `POST /goals/:id/progress`, `POST /goals/:id/milestones`, `PATCH /goals/:id/milestones/:mid`, `POST /goals/:id/breakdown`, `POST /goals/:id/breakdown/commit` |
| Habits | `GET/POST /habits`, `PATCH /habits/:id`, `POST /habits/:id/checkins`, `DELETE /habits/:id/checkins/:cid`, `GET /habits/:id/history` |
| Schedule | `POST /schedule/plan`, `POST /schedule/need-more`, `GET /schedule/proposals` (list; includes each stored payload), `POST /schedule/proposals/:id/dismiss`, `POST /schedule/commit` |
| Activity | `GET /activity`, `GET /activity/:id`, `POST /activity/:id/undo` |
| Data | `GET /export` (attachment, no credential material), `GET /health` |

This table is the *actual* surface (verified against every `router.get/post/patch/delete`
registration in `server/routes/*.ts` on 2026-10-24). Two honest gaps a reader must know:

- **There is no goal or habit deletion endpoint.** Tasks are archived; goals and habits can be
  edited and paused, not removed. Recorded as a known gap (review REV-014) rather than papered over.
- **There is no `PATCH /tasks/:id/position` and no `GET /schedule/proposals/:id`.** Subtask
  ordering happens inside `PATCH /tasks/:id` (`position` field), and the proposal list already
  returns every stored proposal with its payload.

### 7.1 Validation and error contract

- Missing/invalid primitives → `400 bad_request` with the offending field in `details`.
- Optimistic concurrency mismatch → `409 conflict` with `currentRevision`.
- Stale proposal → `409` with `details.code = "stale_proposal"`.
- Undo conflict → `409` with the conflict list in the response body.
- Not found → `404 not_found` (entity routes, scoped to the owner). Reference *fields* a user can
  supply (`goalId`, `parentId`, `blockId`) answer `400 bad_request` with an identical message whether
  the id is unknown or owned by someone else — never a 500, never an existence oracle (AT42); empty
  or whitespace-only reference values are rejected as `400` before any write (REV-A-02).
- Bad JSON → `400 bad_json`. Unexpected errors → `500 internal` with no stack or SQL leaked.

---

## 8. Client contract

- Single page, view state in the URL hash; no router dependency.
- Every data-driven region implements three states: **loading**, **empty** (explains the next step),
  **error** (server message + retry).
- Proposals are rendered as a preview: strategy, why, exact sessions with times, what would move,
  impact, feasibility. Apply and Dismiss are explicit buttons; nothing is applied automatically.
- Accessibility target WCAG 2.2 AA: skip link, landmarks, ordered headings, labelled inputs with
  associated error text, visible `:focus-visible` outlines, `aria-live` for async results, dialogs
  trap and restore focus, status conveyed by text as well as colour, ≥ 4.5:1 contrast, 320 px
  layout, `prefers-reduced-motion` respected.
- A `401` anywhere returns the user to the sign-in screen without losing the current view state.

---

## 9. Acceptance mapping

The authoritative mapping (AT01–AT55 → executed test / manual check / deferral, with status and
evidence) lives in `docs/spec/APE_V1_1_TRACEABILITY.md`. Acceptance groups:

| Group | Subject | Coverage source |
|---|---|---|
| K1 | Task, goal and calendar basics (AT01–AT08) | `tests/api.test.ts` |
| K2 | Calendar conflicts, hard/soft constraints (AT09–AT20) | `tests/api.test.ts`, `tests/domain.test.ts` |
| K3 | Execution, recovery, undo (AT21–AT31) | `tests/api-flow.test.ts`, `tests/domain.test.ts` |
| K4 | Habits and goal integrity (AT32–AT36) | `tests/api-flow.test.ts` |
| K5 | AI authorization and data rights (AT37–AT44) | `tests/api-flow.test.ts`, `tests/api.test.ts` |
| K6 | Error, conflict, rollback UX (AT45) | API precondition tests + manual client check |
| K7 | Non-functional targets (AT49–AT55) | manual checks recorded in the matrix |

---

## 10. Explicit deviations and resolutions (contract §4.4)

| # | Master-spec wording | Resolution implemented | Authority |
|---|---|---|---|
| R-1 | V1.0 header says the document is not implementation authorization | Implementation proceeded under the explicit PO contract, which supersedes the header | D-001 |
| R-2 | Streak-first habit view (CR07 alternatives) | Period attainment is primary; no streak is ever shown as completion pressure | D-012, spec CR07 |
| R-3 | "AI" implies a language model | Deterministic in-process proposal engine, suggest-only, no external model | D-003 |
| R-4 | Drag-and-drop calendar is implied by K6 language | Blocks are moved with explicit start/end edits plus a conflict warning and confirm step; the AT09 behaviour (warning, no auto-overwrite) is preserved | D-006 |
| R-5 | Habit history wording | Habit history counts only sessions belonging to tasks linked to the habit's goal (spec H2) — never the user's total | spec H2 |
| R-6 | Plan scope for tasks that already have sessions | Existing future sessions of scoped tasks are releaseable by a new plan; they appear as `impact.movedBlocks` before approval | spec F6/F8, D-015 |
| R-7 | AT20, AT46, AT47, AT48, AT54 | Deferred with rationale in the traceability matrix (external sync, performance targets beyond local scale, J/K matrix cells) | D-006 |
| R-8 | Spec D8/I3 "undo never destroys" (E4 treats work sessions as immutable reality) | Undoing a manual `work.log` deletes that logged row itself, because the log *is* the mistaken act being reversed; every other undo only releases, restores or flags. Disclosed in the Activity message and in `server/undo.ts`'s header (review REV-019) | D-010, spec E4 |
| R-9 | K1/K4 imply goals and habits can be deleted | Not implemented in this increment: goals/habits are editable and pausable, tasks are archivable (with undo). Recorded as a known functional gap, not a hidden one (review REV-014) | D-006 |

---

## 11. Operational notes

- **Database migrations** are numbered steps in `server/db.ts`; opening an older database applies the
  missing steps in order. Fresh databases apply all of them.
- **Ports/env** are documented in `README.md` and `.env.example`; there are no secrets.
- **Release gate:** `npm run check` (typecheck + tests + build). Deployment/publishing is an explicit
  approval gate and has not been performed.

### 11.1 Known limitations (deliberate, disclosed — review REV-019/REV-025)

- **Bearer token in `localStorage`.** The client keeps its session token in `window.localStorage`
  (`client/api.ts`). An XSS payload could read it; the exposure surface is small (no third-party
  scripts, no CDN, no web fonts, `nosniff` header), but `sessionStorage` plus re-authentication
  would be the stricter choice for a future hardening pass.
- **No login rate limiting.** `POST /auth/login` has no throttle or backoff. The server binds
  `127.0.0.1` only, login failures are uniform ("Incorrect username or password."), and passwords
  are scrypt-hashed, so the exposure is a local brute-force attempt, not a remote one. A per-username
  backoff is the planned follow-up.
- **Undo of `work.log` deletes the logged row** (R-8 above). The Activity entry survives and names
  what was removed, but the measured-effort row itself is gone.
- **No goal/habit deletion** (R-9 above). Archive-only for tasks; goals and habits stay until a
  future increment adds removal.
- **Settings are API-only.** Working hours, grace period, soft-rest allowance and time zone are
  changed via `PATCH /api/auth/settings`; the client has no settings screen in this increment.
  Working hours therefore keep their registration default (08:00–22:00, all days) unless the API is
  used directly.
- **No event-override control in the client.** The server gate for creating/moving an event over a
  locked/fixed item requires `override` + `confirm` (AT10, REV-A-01); the client's block form
  collects that confirmation, but its event form does not, so an overlapping event creation from the
  UI surfaces the server's honest `409` instead. Overlapping *unlocked* events and soft rest remain
  clickable without friction.

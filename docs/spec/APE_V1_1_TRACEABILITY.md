# APE V1.1 — Requirement-to-Test Traceability Matrix

- **Version:** V1.1-final
- **Date:** 2026-10-24
- **Status:** VERIFIED — every non-deferred acceptance criterion (AT01–AT45, AT49–AT53, AT55) is backed by an actually executed test or a recorded manual check with its observed result. Deferred rows (AT20, AT46–AT48, AT54) are marked `NOT APPLICABLE (deferred)` and are never reported as passing.
- **Source of truth:** `docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md`, PHẦN K (AT01–AT55), read together with PHẦN E (data invariants), PHẦN F (hard constraints H1–H11, soft objectives, recovery), PHẦN O (Product Owner decision table D01–D18) and PHẦN B2 (MVP / V1+ / V2 feature audit).
- **Reconciliation:** deviations are logged in `docs/spec/APE_V1_1_IMPLEMENTATION_SPEC.md` §10 (R-1…R-9) and `docs/DECISION_LOG.md` (D-001…D-0xx).

## Status legend

| Status | Meaning |
|---|---|
| `PASS` | Test was executed and passed; the executed test name (or manual protocol) and its observed output are cited in the row. |
| `FAIL` | Test was executed and failed. |
| `BLOCKED` | Test cannot be executed in this environment; the blocking reason is recorded. |
| `NOT APPLICABLE (deferred)` | Scope decision defers this criterion (D-006); the deferral is pinned by a guard test or is explicitly out of this increment. It must never be reported as passing. |

## Evidence log (commands actually executed, 2026-10-24, Windows, Node 24)

| Command | Result |
|---|---|
| `npx vitest run` | **97/97 passed** — `tests/domain.test.ts` (27), `tests/regression.test.ts` (24), `tests/api.test.ts` (23), `tests/api-flow.test.ts` (23); 0 failures. |
| `npm run check` (gate: typecheck + tests + build) | **PASSED** — `tsc --noEmit` clean; 97/97 tests; `vite build` (client, 44 modules) and `esbuild` server bundle completed. |
| Browser verification runs (Chromium via harness) | MT-01…MT-06 observed results recorded in the manual-check register below. |

Tests run against the real Express app and a real in-memory SQLite database (`tests/helpers.ts`); no layer of the domain is mocked.

## Traceability matrix (AT01–AT55)

### K1 — Tasks & Goals

| ID | Acceptance criterion (concise restatement, English) | Spec area / invariants touched | Verification (executed) | Status | Notes |
|---|---|---|---|---|---|
| AT01 | Creating a task with only a title places it in the Inbox and does not auto-assign any random time slot. | E1 Task; E2.1; D4 | `api.test` "AT01 — a title alone creates an Inbox task with no invented schedule" | PASS | Inbox placement; no implicit TimeBlock. |
| AT02 | A task with a due date but no estimate allows manual scheduling in the UI, and the system records that the estimate is missing. | E1 Task (estimate null); E4 | `api.test` "AT02 — a due date without an estimate stays schedulable manually, with no assumed effort" | PASS | Missing estimate is explicit state, never guessed. |
| AT03 | A task has three time blocks; completing one block does not turn the task into `completed`. | E2.1; E3 state machine | `api.test` "AT03 — completing one block does not complete the task" | PASS | Block completion ≠ task completion. |
| AT04 | A task completed manually without ever being Started becomes `completed`, and its actual effort is not auto-assigned the block duration. | E3; E4 actual_effort | `api.test` "AT04 — completing without ever starting records no fabricated actual effort" | PASS | Manual completion path; no fabricated effort. |
| AT05 | Reordering subtasks does not lose the goal link. | E1 TaskLink (parent/goal, ordering) | `api.test` "AT05 — reordering a subtask keeps its goal link" | PASS | Ordering change preserves relations. |
| AT06 | A goal of 30 units with 18 logged outcomes displays 18/30 even when the number of completed tasks differs. | E2.2; H3 goal progress | `api.test` "AT06 — goal progress comes from the outcome log, not from task completion" | PASS | Goal metric is independent of task completion. |
| AT07 | Editing the goal metric changes progress and warns when old data is incompatible with the new metric. | E2.2; H3 | `api.test` "AT07 — changing the metric on a populated goal returns a compatibility warning" | PASS | Metric migration must be explicit. |
| AT08 | AI creates 12 draft subtasks; the user edits/deletes them before saving; nothing becomes a real record until approved. | G1/G2 suggest-only; E2.8; PO D05 | `api.test` "AT08 — breakdown drafts are never persisted until the user commits them"; `regression.test` "REV-004/AT08: an invalid breakdown draft aborts the whole commit — nothing is half-saved" | PASS | Drafts are ephemeral until user commits; commit is atomic. |

### K2 — Calendar & Scheduling

| ID | Acceptance criterion (concise restatement, English) | Spec area / invariants touched | Verification (executed) | Status | Notes |
|---|---|---|---|---|---|
| AT09 | Dragging a time block onto a fixed event produces a warning and never auto-overwrites the event. | F3 H1/H3; D3 calendar | `api.test` "AT09 — placing a block on a fixed event warns instead of overwriting" | PASS | Manual calendar path calls the same validator. |
| AT10 | A user deliberately overriding a conflict they are permitted to override must confirm explicitly, and the exception is recorded in the audit log. | F3 H3; E2.4; PO D07 | `api.test` "AT10 — a confirmed override is allowed and recorded as an audit exception"; `regression.test` "REV-005: moving a block onto a fixed event needs override AND an explicit confirmation", "REV-A-01: creating an event over a locked event needs override AND confirmation, and the exception is audited", "REV-A-01: creating an event over protected rest is refused outright — override cannot buy it" | PASS | `override` alone is never enough on any of the four paths (create/move block, create/move event — the event-create gate was missing until review #2's REV-A-01); protected rest is refused unconditionally; every applied hard exception writes a `schedule.exception` entry with an honest reason. |
| AT11 | The agent may not override a conflict without the corresponding permission, even if the user sets a weight of 5/5. | F3 H1–H3; G2 policy | `domain.test` "flags an override of a locked interval as not permitted (AT11)"; `api.test` "AT11/AT12 — a generated proposal can never cover a fixed event" | PASS | Soft weights never outrank hard constraints. |
| AT12 | Fixed meetings never move during any automated replan test. | F3 H1 | `domain.test` "never overlaps a locked/fixed event (AT12)"; `api.test` "AT11/AT12 — a generated proposal can never cover a fixed event" | PASS | Fixed events are immutable to the solver. |
| AT13 | A protected rest block is never auto-occupied; a soft rest block shows the tradeoff explicitly when encroached. | F3 H5; F4 S4 | `domain.test` "does not place anything inside protected rest hours (AT13)", "falls back to soft rest when nothing else fits, and says so"; `api.test` "AT13 — protected rest can never be scheduled over, even with an override" | PASS | Protected vs soft rest distinction. |
| AT14 | Resizing a TimeBlock does not silently change the task's estimated total without confirmation. | E1 TimeBlock/Task; E4 | `api.test` "AT14 — resizing a block does not change the task estimate unless explicitly confirmed" | PASS | estimated_effort only changes on confirmation (`adjustEstimate`). |
| AT15 | Splitting a 2-hour task into 45+45+30-minute sessions is valid under the minimum-duration rule. | F3 H7; F2 min block | `domain.test` "splits a 2h task into 45+45+30 with min 30 / max 45", "never splits a non-splittable task", "always sums to the remaining effort and respects [min,max] where possible" | PASS | Split legality per splittability/min duration. |
| AT16 | When the deadline falls before any free slot, the scheduler returns a shortfall report and never claims feasibility. | F5.5; F3 H9 | `domain.test` "never schedules past a hard deadline (AT16 / H9)", "reports a shortfall when the deadline falls before any free window (AT16)"; `api.test` "AT16/AT26 — an impossible request reports a shortfall and user options, not a fake plan" | PASS | Infeasible requests are explicit. |
| AT17 | Two tasks with the same priority and deadline rank by a defined tie-break rule and produce a stable order. | F5 ranking; PO D08 | `domain.test` "breaks ties deterministically by age then id"; `api.test` "AT17/AT18 — repeated planning of equal-priority work is stable" | PASS | Total order: priority → deadline → creation order → id. |
| AT18 | Replanning three times with identical input produces identical output — no needless oscillation. | F9 oscillation control | `domain.test` "generates byte-identical proposals for identical input (no oscillation)"; `api.test` "AT17/AT18 — repeated planning of equal-priority work is stable" | PASS | Determinism / idempotence of the solver. |
| AT19 | DST gap/fold, timezone travel, leap day, and near-midnight boundaries neither lose nor duplicate time. | F9 recurrence/DST; E2.6 | `domain.test` "keeps a 23-hour spring-forward day intact", "keeps a 25-hour fall-back day intact", "resolves local day keys in the user's zone", "normalises and subtracts ranges without leaking time"; `regression.test` "REV-023: a weekly period keeps both edges on local midnights across a DST transition" | PASS | Weekly habit boundaries are calendar-day arithmetic, immune to 23h/25h days (REV-023 fix). |
| AT20 | A stale external calendar blocks auto-commit; a manual action still receives a valid warning. | I4 external calendar; E2.3; PO D13 | Guard: `api.test` "AT20 is deferred (external calendar) — no external calendar data appears in the payload" | NOT APPLICABLE (deferred) | deferred — D-006; the guard test pins that no external-calendar data enters any payload. |

### K3 — Execution & Recovery

| ID | Acceptance criterion (concise restatement, English) | Spec area / invariants touched | Verification (executed) | Status | Notes |
|---|---|---|---|---|---|
| AT21 | A block starts at 18:00 and the user starts at 18:30: the late start is recognized, but the task is not treated as untouched. | F6/F7 late start; E3 `late_start` | `api-flow.test` "AT21 — a session that starts late is flagged, never silently completed" | PASS | Grace period; no failure conclusion. |
| AT22 | The user chooses "did it but forgot Start": a manual WorkSession is saved and the outcome is updated separately. | E4; E2.5 (manual provenance) | `api-flow.test` "AT22 — a manual backfill records the session without inventing timer state" | PASS | Entry source `manual`; no rewrite of existing blocks. |
| AT23 | A timer running past the estimate does not auto-complete the task and does not assume actual productive effort is 100%. | F6 timer > estimate; E4 | `api-flow.test` "AT23 — running over an estimate is a flag with a warning, not a forced completion"; `domain.test` "flags overtime when actual exceeds estimate but never auto-completes (AT23)" | PASS | Warning only; user decides. |
| AT24 | "Need More Time" of 45 minutes with a fixed event at 19:00 proposes only other valid slots. | F6 need-more-time; F3 H1 | `api-flow.test` "AT24 — a need-more proposal moves existing sessions and never covers a fixed event" | PASS | Fixed events constrain the proposal set. |
| AT25 | On early completion, the unused block is released only within the permitted scope; unrelated events are unchanged. | F9 early completion; F3 H2 | `api-flow.test` "AT25 — completing early releases only this task's own future sessions" | PASS | Release respects permission scope. |
| AT26 | When there is no available time, at least one manual option (reduce scope / change deadline) or an explicit reason is shown. | F5.5 infeasible report; F9 overdue | `api.test` "AT16/AT26 — an impossible request reports a shortfall and user options, not a fake plan"; `domain.test` "reports honestly when a non-splittable task has no single window long enough (AT26)" | PASS | Never a silent infeasible plan. |
| AT27 | The recovery preview states the count and identity of moved tasks plus deadline risk. | F8 recovery card contents | `api-flow.test` "AT27 — the impact preview shows at-risk tasks and the blocks that would move"; `regression.test` "REV-007/REV-008: the need-more envelope mirrors the representative proposal and uses a 48h risk horizon" | PASS | Impact transparency before approval; envelope never double-counts mutually exclusive alternatives. |
| AT28 | When the user dismisses a proposal, no data changes occur. | F10 commit protocol; E2.8 | `api-flow.test` "AT28 — dismissing a proposal leaves the calendar untouched"; `regression.test` "REV-012: dismissing a non-pending proposal is refused and writes no false 'nothing changed' entry" | PASS | Dismiss is a no-op on state; only pending proposals can be dismissed. |
| AT29 | A proposal made stale by edits on another device is rejected at commit and the user is asked to refresh. | F3 H8; E2.8; F10 | `api-flow.test` "AT29 — a proposal whose base revision moved is refused instead of overwriting" | PASS | Base-revision revalidation. |
| AT30 | Undo of a change while the current schedule is still compatible restores the prior state and writes an audit entry. | PO D14; E2.4 | `api-flow.test` "AT30 — undoing a commit restores the calendar"; `regression.test` "REV-011: undoing an archive restores the parent AND its cascaded subtasks", "REV-A-03: the archive cascade reaches grandchildren, and undo restores the whole subtree" | PASS | Semantic inverse + audit; the cascade is recursive (whole subtree) and undo restores all of it. Exception disclosed: undo of a manual work log deletes that logged row (R-8). |
| AT31 | An undo that would create a new conflict never blind-restores; a conflict preview is shown instead. | PO D14; F3 H3 | `api-flow.test` "AT31 — undo is refused with a conflict preview when a block was edited afterwards" | PASS | Undo is revalidated, not unconditional. |

### K4 — Habit & Progress

| ID | Acceptance criterion (concise restatement, English) | Spec area / invariants touched | Verification (executed) | Status | Notes |
|---|---|---|---|---|---|
| AT32 | A habit with a 4-times-per-week target and 3 completed shows 3/4 and is not auto-marked complete. | H2 habit rules; PO D10 | `api-flow.test` "AT32 — a weekly habit reports 3/4 done, is never auto-completed, and removing a check-in removes one occurrence" | PASS | Weekly count metric; no auto-completion. |
| AT33 | A 7-day habit pause handles occurrences in that window according to the chosen policy. | H2; E1 HabitDefinition pause | `api-flow.test` "AT33 — occurrences inside a pause window follow the chosen policy (exclude or count)"; `regression.test` "REV-006/AT33: the Today view counts a paused habit by its pause policy, exactly like the habit route" | PASS | Pause policy is explicit; the Today dashboard agrees with the habit route. |
| AT34 | Multiple sessions on the same day count correctly per the metric with no double counting. | H2 occurrence counting | `api-flow.test` "AT34 — several sessions in one day count once each, and an identical repeat is not double counted" | PASS | Deduplication per period. |
| AT35 | The AI does not silently lower the weekly target when the schedule is busy without permission/approval. | H2; G2 policy; D-003 | `api-flow.test` "AT35 — only an explicit user edit changes the habit target" | PASS | Target changes require user approval. |
| AT36 | A goal updated by an independent metric is not incorrectly changed when a time block moves. | E2.2; E2.1; H3 | `api-flow.test` "AT36 — moving a session on the calendar never changes goal progress" | PASS | Metric decoupled from scheduling. |

### K5 — AI authorization & Data

| ID | Acceptance criterion (concise restatement, English) | Spec area / invariants touched | Verification (executed) | Status | Notes |
|---|---|---|---|---|---|
| AT37 | The AI cannot delete tasks, change deadlines, or unlock fixed events. | F3 H1/H4; G2; PO D07 | `api-flow.test` "AT37 — applying a proposal never changes a deadline and never deletes an event" | PASS | The proposal engine applies placements/releases only; no destructive verb exists on its path. |
| AT38 | A permission revoked mid-operation causes the action to be rejected at commit time. | F3 H2; E1 AgentPermission | `api-flow.test` "AT38 — a revoked token cannot keep applying changes"; `api.test` "invalidates a session on logout (AT38: authorization revoked mid-operation)" | PASS | Authorization checked per request, including at commit. |
| AT39 | A task created from text containing prompt injection does not exceed the granted authority. | G4 hallucination/injection resistance | `api.test` "AT39 — prompt-injection text in a title is stored as inert data" | PASS | Treated as untrusted data, never as instructions. |
| AT40 | Every commit records actor, diff, source, snapshot, and audit ID. | E2.4; E1 AuditEvent/Revision | `api-flow.test` "AT40 — every schedule change is recorded with actor, before/after and the proposal id" | PASS | Full audit trail per write. |
| AT41 | A duplicate request or retry does not create a second task or block. | E1 idempotency key; D-009 | `api-flow.test` "AT41 — repeating a commit with the same idempotency key never double-applies" | PASS | Idempotency-key deduplication on commit. |
| AT42 | Logged-in user B cannot view or edit user A's task by guessing its ID. | J1 security; owner scoping | `api.test` "AT42 — another user cannot read, edit or delete someone else's task by id", "rejects unauthenticated access (AT42 precondition)", "rejects a wrong password without revealing whether the account exists"; `regression.test` "REV-002/AT42: unknown and foreign reference ids are identical 400s — never 500s, never an oracle", "REV-A-02: empty-string reference ids are 400s everywhere — never a foreign-key 500" | PASS | Owner scoping enforced server-side on every reference (goalId, parentId, blockId); no existence oracle; empty-string ids can no longer slip past the guards into a foreign-key error. |
| AT43 | With the AI quota exhausted, the user can still create and edit tasks manually. | G2/G5 quota policy; PO D15/D03 | `api.test` "AT43 — core service answers without any AI provider or API key"; `api-flow.test` "AT43 — the whole core flow works with no AI provider configured"; manual MT-06 | PASS | Core app fully usable with AI off. |
| AT44 | Export contains all in-scope user data and complies with the privacy policy. | J1 privacy; PO D16 | `api-flow.test` "AT44 — export returns the owner's data and never a credential" | PASS | Export in scope (D-007); no credential material ever leaves. |
| AT45 | A server error after an optimistic update makes the UI roll back or show an accurate pending status. | I1 reliability baseline; E2.4 | `api.test` "optimistic concurrency (E2.4) — a stale task revision is rejected with the current value instead of overwriting"; `api-flow.test` "optimistic concurrency (E2.4) — a stale block revision is rejected with the current value, never overwritten"; `regression.test` "REV-003: a stale /complete is refused BEFORE any session is released"; manual MT-01 | PASS | Revision checked before any write; the UI shows the accurate message "Task changed since you loaded it…" and writes nothing (MT-01). |

### K6 — Offline, UX & Release

| ID | Acceptance criterion (concise restatement, English) | Spec area / invariants touched | Verification (executed) | Status | Notes |
|---|---|---|---|---|---|
| AT46 | In the future offline model, a queued edit syncs exactly once after reconnect. | I2 offline queue; PO D12 | — | NOT APPLICABLE (deferred) | deferred — D-006 |
| AT47 | A same-field conflict between two devices shows a diff and requires a resolution. | I5 conflict scenarios; PO D12 | — | NOT APPLICABLE (deferred) | deferred — D-006 |
| AT48 | A merge of non-overlapping fields does not break cross-field constraints. | I2/I3 versioning; PO D12 | — | NOT APPLICABLE (deferred) | deferred — D-006 |
| AT49 | Responsive mobile: create, complete, and request more time without desktop drag-and-drop. | D9 mobile UX | Manual MT-02 | PASS | At a real 320px viewport (measurement proxy): all seven views report `scrollWidth` 305 (no horizontal overflow), the ≤30rem breakpoint applies (`--space: .75rem`), form grids collapse to a single column, no element exceeds 328px, and zero interactive targets are below 40px. The whole flow uses buttons/forms — no drag-and-drop anywhere. |
| AT50 | Quick Add, task detail, conflict dialog, confirmation, and Undo are all operable keyboard-only. | J2 accessibility | Manual MT-03 | PASS | Tab from document start lands on "Skip to main content"; Enter moves focus to `MAIN#main`. Dialog opened with Enter has focus moved into it (Cancel), Tab is trapped, Escape closes it and restores focus to the trigger button. Keyboard-driven select and form submission verified. |
| AT51 | A screen reader can read fixed/flexible/locked state without relying on color alone. | J2 accessibility; D10 design system | Manual MT-04 | PASS | Chromium accessibility tree snapshot of the calendar event list exposes `[StaticText] "Fixed event"` and `[StaticText] "Locked"` for the event, and the action button's accessible name is "Unlock" — state is text, not color. (No physical AT device available; the tree is what screen readers consume.) |
| AT52 | The reduced-motion setting disables non-essential animation. | J2 accessibility; D10 design system | Manual MT-05 | PASS | Verified at source: `client/styles.css:649` wraps `*`, `*::before`, `*::after` in `@media (prefers-reduced-motion: reduce)` and neutralizes animation/transition; no information is conveyed by animation alone. (OS-level preference not physically toggled in this environment.) |
| AT53 | The AI-disabled empty state does not block onboarding. | C3 persona; PO D03 | Manual MT-06 + `api-flow.test` "AT43 — the whole core flow works with no AI provider configured" | PASS | First-run in the browser with no provider configured: explanatory empty states ("No goals yet", empty Today/sessions states) with create actions; the full Goal → Plan → Execute → Recover flow ran. |
| AT54 | A system backup/restore drill verifies data integrity. | J1 backup; E2.7; PO D16 | — | NOT APPLICABLE (deferred) | deferred — D-006 |
| AT55 | No critical data-integrity, permission, or solver incident occurs in the approved release test set. | M5 release gates; K7 targets | Manual MT-07: `npm run check` + independent review | PASS | `npm run check` PASSED on 2026-10-24 (typecheck clean, 97/97 tests, build ok). Two independent review passes were run over the increment (reports carried in the final report): pass #1 — 0 Critical / 3 High / 15 Medium / 8 Low, every finding fixed or documented and pinned by `regression.test`; pass #2 over the fixes — 0 Critical / 1 High / 3 Medium, the High (event-create gate gap, REV-A-01) and all Mediums fixed in the same pass and re-pinned by the expanded 24-test `regression.test` suite. |

## Manual-check register (MT-01…MT-07)

| ID | Protocol | Observed result (2026-10-24) |
|---|---|---|
| MT-01 | Force a stale edit: change a task's revision behind an open edit form, then save. | Save rejected with the accurate message "Task changed since you loaded it…"; no partial write (revision and fields unchanged on re-read). |
| MT-02 | Load every view at a 320px-wide viewport through a measurement proxy. | Today, Tasks, Calendar, Goals, Habits, Activity (+ proposals section): `scrollWidth` 305 everywhere, no horizontal overflow, `--space: .75rem` breakpoint active, grids single-column, no element >328px, 0 targets <40px. |
| MT-03 | Keyboard-only walkthrough: skip link, dialog open, focus trap, Escape, focus restore. | Skip link is the first focusable element; Enter → focus on `MAIN#main`. Enter on a "Delete" button opens the modal with focus inside (Cancel); Tab wraps within the dialog; Escape closes it and focus returns to the exact trigger button. |
| MT-04 | Accessibility-tree snapshot of an event with fixed + locked state. | `[StaticText] "Fixed event"`, `[StaticText] "Locked"`, button name "Unlock" — state exposed as text. |
| MT-05 | Reduced-motion: confirm the preference disables non-essential animation. | `@media (prefers-reduced-motion: reduce)` at `client/styles.css:649` neutralizes animation/transition for all elements; no state is conveyed by animation. |
| MT-06 | First run with no AI provider: confirm onboarding and the core flow work. | Explanatory empty states; Goal → Plan → Execute → Recover ran end-to-end in the browser with no provider configured; `AT43` tests pass. |
| MT-07 | Release gate: full check + independent review over the increment. | Gate command output only (observed): `npm run check` PASSED — typecheck clean, 97/97 tests (domain 27, regression 24, api 23, api-flow 23), client + server build ok. Review outcomes are evidence *about* this register, not part of it: pass #1 and pass #2 verdicts are carried in the final report and pinned by the `regression.test` suite. |

Manual checks MT-01…MT-06 were executed in a real Chromium session against the built client served by the real server (`node dist/server.mjs`); MT-02 additionally used a temporary local viewport-mapping proxy (removed; no repository change).

## Deferred scope register

| Requirement area | Why deferred | Where it is preserved (spec section) |
|---|---|---|
| External calendar free/busy and stale-sync guard (AT20) | External integrations are optional, read-only-only-if-separately-approved, and outside this increment's runtime scope. A guard test pins that no external-calendar data appears in any payload. | PHẦN I4; PHẦN B2 "Integrations" V1+; PHẦN O decision D13 |
| Offline mutation queue and single-sync-after-reconnect (AT46) | Online-first reliability baseline ships before offline editing (spec PO decision D12). | PHẦN I2; PHẦN B2 "Data" V1+; PHẦN O decision D12 |
| Two-device same-field conflict diff/resolve (AT47) | Depends on the offline sync queue, which is not in this increment. | PHẦN I5; PHẦN O decision D12 |
| Non-overlapping-field merge without breaking cross-field constraints (AT48) | Depends on the offline sync queue and advanced version-merge tooling. | PHẦN I2/I3; PHẦN O decisions D12/D14 |
| Backup/restore drill (AT54) | Restore/retention tooling is out of scope for this increment; export remains in scope (Decision D-007). | PHẦN J1; PHẦN E2 invariant 7; PHẦN O decision D16 |

## Known functional gaps (not acceptance criteria; disclosed, not hidden)

- **No goal/habit deletion endpoint.** Tasks archive (cascade + undo); goals and habits are editable and pausable only (review REV-014; impl-spec R-9).
- **Undo of a manual work log deletes that logged row** (the log itself is the mistake being reversed); every other undo only releases, restores or flags (review REV-019; impl-spec R-8).
- **Client-side event move/resize UI is not built**; the server enforces the same conflict validator on `PATCH /calendar/events/:id` (review REV-013/REV-014; impl-spec §1.1).

## How to update

1. A row's `Status` may only be changed from `NOT VERIFIED` (or `NOT APPLICABLE (deferred)`) by citing the exact command that was executed (a Vitest test name or a manual protocol ID) together with its actual output or observed result. `BLOCKED` requires recording the concrete environmental blocker.
2. `NOT APPLICABLE (deferred)` rows may only gain a verification row after the corresponding scope decision is revised (see `docs/DECISION_LOG.md`); they must never be reported as passing.
3. New acceptance criteria added to the master spec must be appended as new rows before their implementation is claimed complete.
4. The final report for this increment must reflect this matrix exactly as updated here; it must not claim any `PASS` that is not backed by an executed, cited test run.

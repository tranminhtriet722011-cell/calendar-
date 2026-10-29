# APE Decision Log

- **Date:** 2026-10-21
- **Author:** autonomous agent under APE-AUTO-001
- **Status:** proposed-to-Product-Owner unless noted per entry
- **Baseline:** `docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md` remains the requirements baseline. This log records engineering/implementation decisions for the increment defined by D-006; it does not replace the Product Owner's approval authority under PHẦN M1 / PHẦN O.

## Decision index

| ID | Title | Status | Source authority |
|---|---|---|---|
| D-001 | Implementation authority | applied, documented — not user-approved as a product decision | Product Owner contract §2/§6/§10 vs spec header + PHẦN Q |
| D-002 | Stack: TypeScript modular monolith | proposed-to-Product-Owner | Contract §6/§10; spec PHẦN M2/M3 (D17) |
| D-003 | AI posture: no external LLM | proposed-to-Product-Owner | AGENTS.md §4; spec CR02/G1, PHẦN O D03/D05 |
| D-004 | Identity and authorization | proposed-to-Product-Owner | Spec J1; AT42 |
| D-005 | Deterministic scheduler | proposed-to-Product-Owner | Spec F3–F5; PHẦN O D08 |
| D-006 | Increment scope and deferrals | proposed-to-Product-Owner | Spec B2/B3; PHẦN O D04/D12/D13 |
| D-007 | Persistence: local SQLite | proposed-to-Product-Owner | Spec I1/E2; PHẦN O D12/D14 |
| D-008 | Time model: UTC instants + IANA timezone | proposed-to-Product-Owner | Spec E2 invariant 6; F9 |
| D-009 | Proposal/commit protocol | proposed-to-Product-Owner | Spec E2 invariant 8; H8; F10 |
| D-010 | Undo semantics | proposed-to-Product-Owner | Spec PHẦN O D14; E2 invariant 4 |
| D-011 | Testing strategy | proposed-to-Product-Owner | Spec PHẦN K/K7; O D18 |
| D-012 | Habit scope: weekly count only | proposed-to-Product-Owner | Spec PHẦN O D10; CR07 |
| D-013 | Conflict override policy | proposed-to-Product-Owner | Spec F3 H1–H3; O D07 |
| D-014 | No telemetry, no third-party calls, no paid services | proposed-to-Product-Owner | AGENTS.md §4; O D03/D15 |

## D-001 — Implementation authority
- **Status:** applied, documented — not user-approved as a product decision.
- **Options considered:** (a) treat the master spec's "no product code" line as blocking all implementation; (b) treat the Product Owner contract as the explicit authority for this authorized increment while the spec stays the requirements baseline; (c) freeze all work until the spec is re-issued.
- **Chosen path:** (b). The master spec header and PHẦN Q state it does not authorize writing product code, but the Product Owner contract `APE-UNIFIED-AUTONOMOUS-OPENCODE-AND-PRODUCT-CONTRACT.md` §6/§10 explicitly authorizes specification reconciliation and APE implementation; per the conflict-order rule in contract §2, the explicit Product Owner requirement outranks the spec's status line. The spec remains the requirements baseline, and its PHẦN M1 pre-code approval gates are recorded as release gates rather than blockers to this increment.
- **Rationale:** the contract is the later, explicit PO instruction; freezing (option a/c) would block work the PO has authorized while the spec's own gates are about release, not about this increment's authorized development.
- **Trade-offs:** the spec and contract remain textually in tension until the spec is re-issued or annotated by the PO; the PHẦN M1 gates still have to be satisfied before any release claim.
- **Reversal path:** the PO can reassert spec primacy by superseding the contract or re-issuing the spec; implementation then pauses at the next increment boundary with all work preserved in git checkpoints.
- **Source authority:** contract §2 (conflict order), §6/§10 (implementation authorization); spec header "Không cho phép" line and PHẦN Q; PHẦN M1/M5 gates.

## D-002 — Stack: TypeScript modular monolith
- **Status:** proposed-to-Product-Owner.
- **Options considered:** Next.js full-stack; pure client-side PWA without a server; Python/FastAPI backend with a separate web client.
- **Chosen path:** TypeScript modular monolith — Node 24 with built-in `node:sqlite` for persistence, an HTTP API layer, a React + Vite responsive web client, Vitest for tests, local-only runtime (no paid services, no cloud dependencies).
- **Rationale:** one language for domain, API, and UI gives shared types that keep the traceability matrix honest; `node:sqlite` keeps the runtime dependency-free; a server is required by the spec's server-authoritative baseline.
- **Trade-offs:** Next.js gives more ecosystem conventions but adds build/deploy surface with no deployment target in scope; the PWA-only option violates spec I1 and makes AT42 (authorization) untestable server-side; Python/FastAPI splits the language across domain logic and UI and weakens shared-type traceability.
- **Reversal path:** replace the persistence adapter or split the monolith behind the existing module boundaries; no data migration is needed beyond export/import because the runtime is local-only.
- **Source authority:** contract §6/§10; spec PHẦN M2 (logical architecture), PHẦN O D17 (stack via ADR before code), I1 (server-authoritative baseline).

## D-003 — AI posture: no external LLM provider
- **Status:** proposed-to-Product-Owner.
- **Options considered:** wire a hosted LLM for proposal generation; allow an opt-in local model; deterministic in-process proposal engine.
- **Chosen path:** no external LLM provider. The Agent Orchestrator's proposal generation is implemented by an in-process deterministic proposal engine with suggest-only as the default; every proposal is validated by the scheduler before display and requires explicit user approval to commit.
- **Rationale:** external AI providers and paid services must remain disabled (AGENTS.md §4); the spec's policy model (G1) and PO decision D05 make the agent suggest-only by default, and D03 requires the core app to work with AI off.
- **Trade-offs:** no natural-language drafting quality in this increment; the "AI" surface is limited to deterministic drafts and explanations, which is less impressive but fully testable and privacy-preserving.
- **Reversal path:** a later increment can add an LLM behind the same proposal interface behind an explicit, permissioned, offline-capable toggle, without changing the commit protocol (D-009).
- **Source authority:** AGENTS.md §4; spec CR02/G1 agent capability map; PHẦN O D03/D05.

## D-004 — Identity and authorization
- **Status:** proposed-to-Product-Owner.
- **Options considered:** third-party identity provider; platform-integrated auth; local username/password with app-managed sessions.
- **Chosen path:** local username + password with scrypt-hashed credentials and opaque bearer session tokens; every domain object is owner-scoped and the scoping is enforced at the API layer, not merely hidden in the UI. No third-party identity provider.
- **Rationale:** no external services or credentials are permitted; AT42 requires server-side enforcement against ID guessing; keeping identity in-process keeps the app fully usable offline/local-only.
- **Trade-offs:** no SSO, password reset, or multi-device session management ergonomics; session-token revocation must be implemented and tested in-app.
- **Reversal path:** the auth module can be replaced behind the same middleware boundary if an external provider is later authorized.
- **Source authority:** spec J1 privacy/security requirements; AT37–AT42 acceptance criteria; AGENTS.md §4.

## D-005 — Deterministic scheduler
- **Status:** proposed-to-Product-Owner.
- **Options considered:** constraint-solver library (e.g., CP-SAT style); heuristic/beam search with randomness; deterministic interval-based search.
- **Chosen path:** deterministic interval-based search. Hard constraints H1–H11 are filtered before any soft-objective ranking; ranking uses an explicit total-order tie-break (priority, then deadline, then idempotent creation order, then id) for stable ordering; at most three genuinely diverse proposals (Minimal Disruption / Deadline Priority / Balanced) are returned; infeasible requests return an explicit shortfall report instead of a schedule that violates a hard constraint; repeated identical inputs must yield identical outputs (no oscillation).
- **Rationale:** spec F1 makes the scheduler a deterministic constraint-and-proposal service; F5 ranks only after feasibility; AT17/AT18 require stable ranking and no oscillation; determinism makes acceptance testing reproducible.
- **Trade-offs:** less optimal schedules than a full solver on large instances; performance caps may limit horizon size, which the shortfall report must surface honestly rather than hide.
- **Reversal path:** the search can be swapped behind the same pseudo-contract (spec F10) once a solver is justified and benchmarked.
- **Source authority:** spec F3 (H1–H11), F4 (S1–S9), F5 ranking rules, F8 strategies, F9 oscillation control; PHẦN O D08.

## D-006 — Increment scope and deferrals
- **Status:** proposed-to-Product-Owner.
- **Options considered:** full MVP per spec B2 in one increment; Tasks+Calendar only; the scope below with explicit deferrals.
- **Chosen path:** Tasks + Calendar (day/week, fixed events, time blocks, conflict checks) + Goals (count/milestone metric independent of task completion) + Habits (basic weekly count, check-in, pause) + Execution (start/pause/done, late start, manual backfill, need-more-time) + Recovery proposals (preview/approve/dismiss) + Audit/undo + Authentication/authorization + responsive accessible UI. Deferred (preserved in the roadmap): external calendar sync, offline mutation queue and merge, native Android, LLM-generated drafts, monthly/complex habit cadence, group scheduling, billing.
- **Rationale:** matches spec B2 MVP columns and PO decisions D04/D11/D12/D13; deferrals follow the spec's own V1+/V2 staging rather than inventing new cuts.
- **Trade-offs:** the traceability matrix carries AT20, AT46–AT48, and AT54 as `NOT APPLICABLE (deferred)` for this increment; users wanting offline or external-calendar features must wait for a later, separately approved increment.
- **Reversal path:** the PO can promote any deferred area into an increment; the affected acceptance criteria then get real test IDs in `docs/spec/APE_V1_1_TRACEABILITY.md`.
- **Source authority:** spec B2 feature audit, B3 release milestones, B4 exclusions; PHẦN O D04/D11/D12/D13.

## D-007 — Persistence: local SQLite
- **Status:** proposed-to-Product-Owner.
- **Options considered:** file-based JSON store; client-side IndexedDB only; local SQLite file with migrations.
- **Chosen path:** a single local SQLite file under `data/` (gitignored), ordered versioned migrations, per-entity `revision` numbers for optimistic concurrency, and append-only audit events; no destructive reset operations exist in the product; restore/retention policy is out of scope for this increment while export is in scope.
- **Rationale:** spec E2 invariant 4 requires owner/revision/audit on every write; I1 requires a reliable online-first baseline; D-009's commit protocol depends on revisions; export (AT44) covers the data-portability need without building restore tooling now.
- **Trade-offs:** restore/retention remains unimplemented (AT54 deferred); a single file means backup is manual (copy the file); SQLite concurrency is single-process, which is acceptable for a local-only runtime.
- **Reversal path:** retention/restore can be added as a migration plus an export/import-compatible tool; the append-only audit log preserves the history needed to rebuild.
- **Source authority:** spec E2 invariants 4/7/8; I1; PHẦN O D12/D14; AT44/AT54.

## D-008 — Time model: UTC instants + IANA timezone
- **Status:** proposed-to-Product-Owner.
- **Options considered:** store local wall-clock times; store UTC with a fixed offset; store UTC instants plus the user's IANA timezone.
- **Chosen path:** store absolute UTC instants; keep the user's IANA timezone; compute day boundaries with the platform `Intl` timezone database; distinguish instants from local calendar dates explicitly.
- **Rationale:** spec E2 invariant 6 requires absolute instants with IANA timezone and warns that a date is not an instant; F9 requires recurrence/DST handling in the local timezone (AT19).
- **Trade-offs:** DST gap/fold behavior depends on the platform `Intl` data (tests must state the tzdata assumption); storing both representations adds modeling discipline at every boundary.
- **Reversal path:** none needed for this increment; a timezone-database pinning strategy can be added if platform drift becomes observable.
- **Source authority:** spec E2 invariant 6; E4; F9 recurrence/DST cases; AT19.

## D-009 — Proposal/commit protocol
- **Status:** proposed-to-Product-Owner.
- **Options considered:** commit against latest state without versioning; optimistic locking only; base-revision + expiry + idempotency keys.
- **Chosen path:** every proposal carries the base revision of the entities it touches plus an expiry; commit revalidates against current state and rejects stale proposals; retries use an idempotency key so a duplicate request cannot create a second object.
- **Rationale:** spec E2 invariant 8 forbids committing on a stale snapshot; H8 requires revision validation; AT29 and AT41 test exactly these behaviors; the idempotency key also protects manual retries after network errors.
- **Trade-offs:** users must refresh and re-approve after concurrent edits (friction in multi-tab use); expiry tuning needs a sensible default window.
- **Reversal path:** the protocol can be relaxed per-entity-type later without changing audit or revision storage.
- **Source authority:** spec E2 invariant 8; F3 H8; F10 pseudo-contract; AT29/AT41.

## D-010 — Undo semantics
- **Status:** proposed-to-Product-Owner.
- **Options considered:** snapshot restore of whole entities; inverse operations derived from audit events; no undo in this increment.
- **Chosen path:** semantic inverse operations derived from audit events; undo is applied only when revalidation shows no new conflict, otherwise the user gets a preview of the conflict instead of a blind restore.
- **Rationale:** PO decision D14 puts version log + semantic undo ahead of Git-like merges; AT30/AT31 define both the happy and conflict paths; deriving inverses from the audit log keeps undo consistent with the append-only history (D-007).
- **Trade-offs:** not every future operation will have a trivial inverse (each new write type must define one); conflict-preview UX is more work than a blind restore but avoids silent damage.
- **Reversal path:** entity-level snapshot restore can be layered on top for operations lacking safe inverses.
- **Source authority:** spec PHẦN O D14; E2 invariant 4; AT30/AT31.

## D-011 — Testing strategy
- **Status:** proposed-to-Product-Owner.
- **Options considered:** unit tests only; mocks-based integration; Vitest unit tests plus integration tests against a real HTTP server with a temp database.
- **Chosen path:** Vitest unit tests for domain/scheduler invariants and integration tests against a real HTTP server with a temporary database; acceptance status may be `PASS` only when the test actually ran, per the update rules in `docs/spec/APE_V1_1_TRACEABILITY.md`.
- **Rationale:** PO decision D18 forbids claiming completion without evidence; AT42-style authorization behavior cannot be proven against mocks; the traceability matrix enforces executed-evidence-only status changes.
- **Trade-offs:** real-server tests are slower and need careful temp-DB lifecycle handling; manual criteria (AT45, AT49–AT53, AT55) remain manual and cannot be automated away.
- **Reversal path:** add property/stress suites later for the K7 nonfunctional targets without changing this baseline.
- **Source authority:** spec PHẦN K intro, K7 targets, PHẦN O D18; AGENTS.md §7 (evidence rules).

## D-012 — Habit scope: weekly count only
- **Status:** proposed-to-Product-Owner.
- **Options considered:** full habit engine (streaks, flexible cadence, complex metrics) now; weekly count target with manual check-in only.
- **Chosen path:** weekly count target with manual check-in and pause for this increment; streak is a secondary display metric only and never the attainment default.
- **Rationale:** spec PHẦN O D10 puts weekly metrics first and complex streaks later; CR07-style behavior in AT32/AT35 requires that completion is never inferred from streaks or silently adjusted.
- **Trade-offs:** monthly/complex cadences and advanced metrics are deferred to a later increment; power users may find basic habits limited.
- **Reversal path:** new cadence types can be added as new metric definitions without breaking occurrence history.
- **Source authority:** spec H1/H2; PHẦN O D10; AT32–AT35.

## D-013 — Conflict override policy
- **Status:** proposed-to-Product-Owner.
- **Options considered:** no manual overrides ever; free manual overrides for everything; user-owned, unlocked objects only, with confirmation and audit.
- **Chosen path:** a user may deliberately place a block on a conflict only for objects they own and that are not locked/fixed, after explicit confirmation, and the exception is recorded in the audit log; agent-driven override of locked/fixed events is never permitted.
- **Rationale:** spec F3 H1/H3 allow manual override with a recorded exception while forbidding agent overrides; PO decision D07 protects fixed/locked, deadlines, deletion, and high priority; AT10/AT11 test both sides.
- **Trade-offs:** occasional legitimate emergencies still require the user to unlock/edit the event first (an extra step that is deliberately annoying); audit volume grows with deliberate overrides.
- **Reversal path:** an emergency "unlock with reason" flow can be added as an explicit, audited user action without touching agent permissions.
- **Source authority:** spec F3 H1–H3; PHẦN O D07; AT09–AT12.

## D-014 — No telemetry, no third-party calls, no paid services
- **Status:** proposed-to-Product-Owner.
- **Options considered:** anonymous usage telemetry; third-party error reporting; fully local operation.
- **Chosen path:** no telemetry, no third-party network calls, and no paid services in this increment; the application must be fully usable with AI disabled.
- **Rationale:** AGENTS.md §4 forbids external AI/paid services; spec PO decisions D03 (core app runs with AI off) and D15 (cost control) plus J1 privacy requirements point the same way; AT43/AT53 test the AI-off usability directly.
- **Trade-offs:** no production-style observability (crash reports, usage analytics); issues must be diagnosed from local logs and the audit trail.
- **Reversal path:** any telemetry would require explicit PO approval, a privacy review, and an opt-in design; nothing in this increment's code paths calls out to the network by default.
- **Source authority:** AGENTS.md §4; spec J1; PHẦN O D03/D15; AT43/AT53.

---

## D-015 - A plan may move the scoped tasks' existing sessions
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** treat already-booked sessions as immovable; release only sessions of the task being recovered; allow a new plan to move existing sessions of the tasks it is asked to plan.
- **Chosen path:** `POST /api/schedule/plan` treats future sessions of the *scoped* tasks as releaseable, and every place that validates a proposal (generation, recovery, commit) validates against the world *after* those releases.
- **Rationale:** spec F6/F8 describe impact previews with moved blocks and replanning that re-shelves existing sessions; without releaseable sessions `movedBlocks` is always 0 and the scheduler cannot rebalance. Releasing without validating against the post-release world (the bug found during implementation) produced a 500 on commit; the fix applies the same exclusion at generation, recovery and commit time.
- **Trade-offs:** approving a plan can replace a session with a different id at a different time (same task), so the preview must be readable before approving; sessions of tasks outside the scope are never touched.
- **Reversal path:** stop passing `releaseableBlockIds` in the `/plan` route (recovery keeps its own); no schema change is involved.
- **Source authority:** spec PHẦN F6/F8; AT24, AT27, AT29.

## D-016 - Stable proposal identity: record id vs content id
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** derive the stored proposal id from the plan content (collides for repeated identical plans); keep a fresh record id per generation and expose a content hash separately.
- **Chosen path:** each stored proposal keeps its own `id` (used for commit/dismiss/audit) and additionally reports `contentId`, an FNV-1a hash of strategy + placements + releases. AT18 stability is asserted on `contentId` and placements.
- **Rationale:** the acceptance criterion is "replanning with the same input must not oscillate", i.e. the *plan* is stable, not the storage record; a fresh row per request keeps history and expiry semantics intact while `contentId` makes stability observable.
- **Trade-offs:** clients must not use `id` as a de-duplication key; documented in the API section of the implementation spec.
- **Reversal path:** remove the `contentId` field; AT18 then has to be asserted on placements only.
- **Source authority:** spec PHẦN K AT18; PHẦN F5.

## D-017 - Session starts align to 15-minute boundaries
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** start exactly at "now" (second-level drift); round to the next 15 minutes when the window still fits; leave non-boundary starts when the window is tight.
- **Chosen path:** `alignedStart` rounds the earliest start up to the next 15-minute mark and falls back to the raw start when the rounded start would not fit the window or the deadline.
- **Rationale:** with `now` in milliseconds, two identical plan requests a moment apart produced different start seconds, hence different proposal signatures — a user-visible oscillation (AT18). Boundaries also read better in the UI.
- **Trade-offs:** up to 14 minutes of a free window can be left unused before a session starts; a window shorter than the chunk keeps its raw start (feasibility is never traded for tidiness).
- **Reversal path:** change `START_STEP_MS` (or set it to 1 minute) in `server/domain/scheduler.ts`.
- **Source authority:** spec PHẦN F (deterministic tie-breaks), AT18.

## D-018 - Habit pause windows are recorded with an explicit policy
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** boolean `paused` flag only (occurrences are simply ignored); record bounded pause windows (`habit_pauses`) with `exclude`/`count` policy.
- **Chosen path:** migration 5 adds `habit_pauses(start_at, ended_at, policy)`. Pausing opens a window (idempotent), resuming closes it; period attainment excludes occurrences inside an `exclude` window and keeps them for `count`.
- **Rationale:** AT33 requires occurrences inside a pause window to be handled *according to the chosen policy* — a bare flag cannot express "in this window, occurrences were excluded" after the pause ends, and silently dropping check-ins would violate the honest-attainment rule (CR07).
- **Trade-offs:** one extra table and a small migration; the policy of an open window is updated if the user changes it while paused.
- **Reversal path:** ignore `habit_pauses` in `habitPeriod` (the table can stay, it is only read there).
- **Source authority:** spec PHẦN H habit setup ("optional pause"), CR07, AT33.

## D-019 - Identical habit check-ins are idempotent
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** accept every check-in; reject a second identical check-in with an error; return the existing occurrence and mark the response `duplicate`.
- **Chosen path:** `findCheckin` looks up the same `(habit, occurred_at, minutes)` first; if present the existing check-in is returned with `200` and `duplicate: true`, and `period.done` is unchanged.
- **Rationale:** AT34 forbids double counting the same activity when timer and manual entry both record it, and a retried POST must not inflate attainment; returning the original occurrence is honest (the user sees it was already recorded) instead of a confusing error.
- **Trade-offs:** two *different* occurrences logged with the exact same timestamp and duration are indistinguishable by design; distinct times (the normal case) count separately, as AT34 requires.
- **Reversal path:** drop the lookup in the check-in route; `duplicate` field can remain for API stability.
- **Source authority:** spec PHẦN K AT34; PHẦN H (count per metric, no double counting).

## D-020 - PATCH obeys the task state machine
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** allow any status write and audit it; reject only backwards moves; validate every transition through the E3 machine.
- **Chosen path:** `PATCH /tasks/:id` funnels a `status` change through the same `canTransition` guard as `POST /tasks/:id/status`; an illegal move returns 409 with the current status and no partial write happens.
- **Rationale:** review REV-001 found PATCH could move `completed -> not_started`, silently violating E3. One rule on both endpoints also removes the "two ways to do one thing" maintenance trap.
- **Trade-offs:** none user-visible; legal transitions (`not_started -> in_progress` etc.) still work and are covered by a regression test.
- **Reversal path:** drop the transition check in the PATCH route (not recommended).
- **Source authority:** spec PHẦN E3; review REV-001.

## D-021 - Reference ids are owner-validated with no existence oracle
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** 500 on unknown ids (previous behaviour); 404 for unknown vs 403 for foreign; one uniform 400 for both.
- **Chosen path:** every cross-entity reference a user can supply (`goalId`, `parentId`, `blockId` on a work log, habit `goalId`) is checked against the owner's rows; unknown and foreign ids return the identical 400 "Unknown …" message, so responses reveal nothing about other users' data.
- **Rationale:** review REV-002 found a foreign `goalId` produced a raw SQLite FK error ("Unexpected server error", 500). Uniform 400s fix the crash and close the enumeration oracle in one rule (AT42).
- **Trade-offs:** a user cannot distinguish "deleted" from "never existed" for their own missing ids either; acceptable for this data model.
- **Reversal path:** revert the `requireOwned*` helpers to plain existence checks (loses the oracle protection).
- **Source authority:** spec PHẦN J1 owner scoping, AT42; review REV-002.

## D-022 - /complete revalidates before releasing anything
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** release sessions first, then fail on stale revision; validate revision inside the same transaction before any write.
- **Chosen path:** the complete route asserts the task revision before the first write, so a stale client gets 409 and the calendar is untouched.
- **Rationale:** review REV-003: the previous order could release future sessions and then abort, leaving the task open but its sessions gone.
- **Trade-offs:** none; the check costs one read inside the transaction.
- **Reversal path:** restore the previous ordering (not recommended).
- **Source authority:** spec PHẦN E2.4 optimistic concurrency, E4; review REV-003.

## D-023 - Goal breakdown commits are atomic
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** validate per draft and skip bad ones; validate everything up front and abort; wrap the write in BEGIN/COMMIT/ROLLBACK.
- **Chosen path:** all drafts are validated before any insert; the inserts then run inside an explicit transaction that rolls back on any failure — nothing is half-saved.
- **Rationale:** review REV-004: a single invalid draft could previously leave the earlier drafts persisted, which contradicts the suggest-only promise (AT08: nothing real until the user approves the whole set).
- **Trade-offs:** slightly longer lock time on the goal's task rows; irrelevant at local scale.
- **Reversal path:** remove the transaction wrapper (not recommended).
- **Source authority:** spec PHẦN E2.8 suggest-only, AT08; review REV-004.

## D-024 - Overriding a hard conflict always needs override + explicit confirmation, on every path
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** confirmation only on initial placement; confirmation on placement and move; confirmation on every mutation that can create a hard conflict (event create/move included).
- **Chosen path:** all four routes (create/move block, create/move event) compute hard conflicts with a self-exclusion and refuse with 409 unless `override === true && confirm === true`; every applied exception writes a `schedule.exception` audit entry.
- **Rationale:** review REV-005/REV-013 found the move paths trusted a bare `override` flag, and REV-026 found an event could report itself as its own conflict and that event creation wrote no exception audit. One predicate, four call sites.
- **Trade-offs:** clients must resend `confirm: true` on a move that still overlaps a fixed event; the UI already collects it once per action.
- **Reversal path:** relax the predicate to `override` only (weakens AT10).
- **Source authority:** spec PHẦN F3 H1/H3, AT09/AT10; review REV-005, REV-013, REV-026.
- **Amended 2026-10-24 (review pass #2):** when this entry was first appended, the event-*create* path was still ungated, so its "all four routes / implemented" claim was **false at the time**. Review pass #2 caught exactly that (REV-A-01) and the fourth call site landed in the same increment under D-036; the claim is accurate now, and the history is recorded here rather than edited away.

## D-025 - Dismissal applies only to pending proposals
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** idempotent dismiss (200 twice); 409 on non-pending; return the current state with 200.
- **Chosen path:** `POST /schedule/proposals/:id/dismiss` returns 409 unless the proposal is still pending, and the audit entry is written only when a state change actually happened.
- **Rationale:** review REV-012: the old handler recorded a `proposal.dismiss` audit row even when nothing changed — an audit trail that lies is worse than none.
- **Trade-offs:** a double-clicked dismiss surfaces a 409 instead of silence; the UI shows the message.
- **Reversal path:** make dismiss idempotent again but keep the audit conditional.
- **Source authority:** spec PHẦN F10 commit protocol, E2.4; review REV-012.

## D-026 - Undoing an archive restores the whole cascade
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** undo restores only the archived parent; undo restores parent and every child archived by the same cascade.
- **Chosen path:** the task.archive audit entry captures the cascaded child ids; undo clears `archived` on the parent and all of them in one transaction.
- **Rationale:** review REV-011: archiving cascades to subtasks, so a parent-only undo returned a task whose subtasks were silently still archived — data loss from the user's point of view.
- **Trade-offs:** the audit payload stores the child id list; undo of a very large cascade is still a single cheap UPDATE.
- **Reversal path:** capture fewer ids (loses completeness).
- **Source authority:** spec PHẦN E2.4, PO D14 undo semantics; review REV-011.

## D-027 - The Today view counts paused habits by their pause policy
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** the dashboard shows raw check-in counts; the dashboard reuses `habitPeriod` with the user's pauses (chosen).
- **Chosen path:** `/calendar/today` passes the habit's pause windows into `habitPeriod`, so `exclude`/`count` behave identically on the dashboard and the habit screen.
- **Rationale:** review REV-006: the dashboard previously ignored pauses and could report attainment the habit page contradicted — two different "truths" for AT33.
- **Trade-offs:** one extra pauses read per habit on the dashboard query; negligible locally.
- **Reversal path:** call `habitPeriod` without pauses (reintroduces the contradiction).
- **Source authority:** spec PHẦN H pause policy, AT33; review REV-006.

## D-028 - At-risk horizon is 48 hours; the impact envelope describes one representative proposal
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep the 48-day horizon; sum impact across all alternative proposals; report the first proposal's impact and label the envelope accordingly (chosen).
- **Chosen path:** `atRisk` flags tasks due within 48 hours; the need-more envelope's `movedBlocks`/`addedBlocks`/`tasksTouched` mirror the representative (first) proposal instead of summing mutually exclusive alternatives.
- **Rationale:** review REV-007/REV-008: a 48-day horizon flagged everything as at risk (meaningless), and summing alternatives claimed more moved blocks than any single apply would ever move — the preview lied about the magnitude of the change.
- **Trade-offs:** the envelope under-describes alternatives; the per-proposal payloads still carry their own accurate impact.
- **Reversal path:** restore the sum (misleading) or parameterise the horizon.
- **Source authority:** spec PHẦN F8 recovery card contents, AT27; review REV-007, REV-008.

## D-029 - Non-text contrast of the border token
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep `#8d99a6` (~2.9:1); darken to `#767f8c` (~4.0:1) (chosen).
- **Chosen path:** `--line` in `client/styles.css` is now `#767f8c`, comfortably above the 3:1 required by SC 1.4.11 for input borders and structural lines.
- **Rationale:** review REV-016 measured the old token just under the non-text contrast minimum on white.
- **Trade-offs:** slightly stronger grid lines; no other token changed.
- **Reversal path:** revert the one hex value.
- **Source authority:** WCAG 2.2 SC 1.4.11; review REV-016.

## D-030 - Project permission rules follow last-match-wins and cover reads of key material
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** reorder deny rules before the blanket allow (guessing first-match semantics); verify the documented semantics and keep broad-allows-first with specific denies after (chosen).
- **Chosen path:** verified from the OpenCode V2 permissions docs that "the last matching rule wins", so `opencode.json` keeps its blanket allow first and layers specific deny/ask rules after it. Added: read+edit deny for `*.pem`/`*.key`, `ask` for `webfetch`/`websearch`, and destructive PowerShell asks (`Remove-Item *-Force*`, `rd *`, `rmdir *`, `del *`).
- **Rationale:** review REV-017 flagged both a semantics uncertainty (resolved: last match wins) and real coverage gaps — private keys could be read, and network fetches were silently allowed although the contract requires asking.
- **Trade-offs:** `webfetch`/`websearch` now prompt once per call; acceptable for a local-first project.
- **Reversal path:** flip individual rules back to `allow`.
- **Source authority:** contract §4.2; OpenCode V2 permissions documentation; review REV-017.
- **Amended 2026-10-26:** the `git push *` rule was tightened from `ask` to `deny` during the increment. The Product Owner approved pushing the increment, so the rule now reads `ask` again — every push still requires a fresh interactive approval at execution time, and the change is recorded here rather than made silently.

## D-031 - The locked-event delete dialog is informational, not destructive
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep the destructive dialog and let the server 409; show an honest explanation with the default "Delete event" label; show the explanation with a plain "Close" action that changes nothing (chosen).
- **Chosen path:** when the event is locked the dialog body states it cannot be deleted yet, the confirm button reads "Close" (not danger-styled), and confirming closes the dialog without any request; the server-side 409 remains as the enforcement backstop.
- **Rationale:** review REV-021: the dialog promised a removal the server would refuse. Honest copy plus a no-op action beats a button that only fails after a round trip.
- **Trade-offs:** one extra branch in the dialog props; unlocked events keep the exact previous flow (verified end-to-end in the browser).
- **Reversal path:** restore the single destructive dialog.
- **Source authority:** spec PHẦN J2 honest states; review REV-021.

## D-032 - Habit period edges use calendar-day arithmetic
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** subtract fixed 7×24h milliseconds from a DST-aware midnight (old behaviour); shift the local day key by whole calendar days and resolve each edge in the user's zone (chosen).
- **Chosen path:** `shiftDayKey` (in `server/domain/time.ts`) does pure UTC-calendar date arithmetic; `habitPeriod` resolves both week edges with `dayKeyToInstant`, so each edge lands on the user's local midnight even across a 23h/25h day.
- **Rationale:** review REV-023: the fixed-millisecond path put a weekly boundary at 01:00 after a spring-forward, miscounting attainment for anyone in a DST zone (pinned by a regression test for the 2026-03-08 US transition).
- **Trade-offs:** none; the arithmetic is simpler than what it replaced.
- **Reversal path:** revert `habitPeriod` to millisecond offsets (reintroduces the bug).
- **Source authority:** spec PHẦN F9 DST rules, H2; review REV-023.

## D-033 - Review fixes are pinned by a dedicated regression suite
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** rely on the existing acceptance tests; add a per-finding regression file (chosen).
- **Chosen path:** `tests/regression.test.ts` pins each repaired invariant (REV-001/002/003/004/005/006/007/008/011/012/013/023/026) with 12 focused tests, real HTTP, no mocks.
- **Rationale:** review REV-018 asked for exactly this: defects fixed once tend to return silently; a named failing test is the cheapest alarm.
- **Trade-offs:** 12 more tests in the gate (adds ~1s).
- **Reversal path:** delete individual tests when the behaviour is intentionally changed (with the decision entry updated).
- **Source authority:** review REV-018; engineering standard "never weaken a test to get green".

## D-034 - Documentation tells the whole truth
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep the optimistic endpoint table and limitation list; correct the table to the registered routes and add the missing limitations (chosen).
- **Chosen path:** the implementation spec's API table now lists only routes that exist (removed `PATCH /tasks/:id/position`, `GET /schedule/proposals/:id`, `DELETE /goals/:id`, `DELETE /habits/:id`), §1.1 no longer claims an event move/resize UI, deviations R-8 (work-log undo deletes the logged row) and R-9 (no goal/habit deletion) are logged, §11.1 and README §8 disclose the localStorage token, the missing login rate limit and the archive-only task model.
- **Rationale:** reviews REV-014/REV-019/REV-025: a spec that documents phantom endpoints is worse than a short one — it sends readers hunting for APIs that do not exist and hides real trade-offs.
- **Trade-offs:** the spec looks less complete; it is now accurate.
- **Reversal path:** none needed; entries stay until the features actually ship.
- **Source authority:** contract §4.4 deviation register; reviews REV-014, REV-019, REV-025.

## D-035 - The traceability matrix is rewritten against executed evidence
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep DRAFT rows and mark them at report time; rewrite every row now with the executed test names and observed manual results (chosen).
- **Chosen path:** `docs/spec/APE_V1_1_TRACEABILITY.md` V1.1-final cites, per AT row, the exact Vitest test name(s) or MT protocol and its observed result; deferred rows stay `NOT APPLICABLE (deferred)`; an evidence log records the commands run (`npx vitest run` 85/85, `npm run check` PASSED, browser sessions).
- **Rationale:** review REV-015: a matrix full of "NOT VERIFIED" cannot support a release claim; contract §7 requires acceptance status to be backed by actually executed, cited runs.
- **Trade-offs:** the document is longer; every claim is now checkable in one hop.
- **Reversal path:** none; future rows follow the "How to update" rules in the file.
- **Source authority:** contract §7; review REV-015.

## D-036 - Review pass #2: the event-create gate, reference-id hygiene, recursive cascade, and honest dispositions
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** accept the review's option (b) and amend the documents to exempt event creation; implement the missing guard on the event-create path (chosen); defer the Mediums to a later increment.
- **Chosen path:** `POST /calendar/events` now computes overlaps *before* the insert and enforces the identical gate as the other three mutation paths — protected rest is a409 that no override can buy, a locked/fixed overlap requires `override === true && confirm === true`, and every applied hard exception writes a `schedule.exception` entry whose reason states what actually happened ("Manual conflict override confirmed by user" only when it was). Alongside it, in the same pass: empty/whitespace reference ids are rejected as400 before any write (they used to slip past truthy guards into a foreign-key500), explicit `null` references unlink (REV-A-10), the task archive cascade is recursive so grandchildren are archived and undone with the rest of the subtree, `PATCH /auth/settings` validates the time zone exactly like registration (an unknown zone used to turn every zone-dependent endpoint into a500 for that account), event creation rejects inverted ranges with400 like every other range endpoint, the commit idempotency row is written inside the transaction (a crash after COMMIT could previously leave a committed change with no dedupe row), and the event-move audit reason was corrected so a soft overlap no longer claims a confirmation the API never collected (REV-A-08).
- **Rationale:** review pass #2 (ape-reviewer) verdict FIX-FIRST —0 Critical /1 High /3 Medium /5 Low /3 Info. The High (REV-A-01) was that D-024's "all four routes" claim was false: event creation had no gate, so the documentation promised a protection the code did not enforce. Code and documents must agree; fixing the code was the honest option. Every finding of the pass is now either fixed and pinned by a named regression test, or explicitly disclosed (REV-A-05/07/11 doc corrections, REV-A-12).
- **Trade-offs:** creating an event over a locked/fixed item from the client now surfaces the server's409 (the client's event form has no override control yet — disclosed in §11.1 and README §8); `PATCH {goalId: null}` gains unlink semantics no client path uses today (latent capability only).
- **Reversal path:** relax the event-create predicate or revert individual helper changes; the D-024 documents would then have to be amended again to match.
- **Disposition of REV-010 (UNKNOWN):** the original review-pass-#1 text for REV-010 was not persisted outside the session transcript, so its content cannot be re-verified. Review pass #2 re-scanned the whole increment and found no outstanding issue attributable to that index; the claim "REV-001…REV-026 all addressed" is therefore **not** made for REV-010 — it is recorded as UNKNOWN rather than silently folded into the fixed list. Any future review that recovers the original finding should re-open this entry.
- **Source authority:** contract §4.4 (deviation register) and §7 (evidence); review pass #2 (2026-10-24), findings REV-A-01…REV-A-12.

---

## D-037 - APE-ACCEPT-002: titles can never be blanked through PATCH, and pause windows are half-open at the resume instant
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep the old 200-and-blank behavior for empty titles (rejected - silent data loss); silently keep the current title when an empty string arrives (hides the user's mistake); reject empty/whitespace titles with 400 while absent titles keep the current name (chosen). For AT33: keep the inclusive closed-window bound (keeps the flake); make open windows half-open too (wrong - an open pause is active AT `now`); closed windows half-open `[startedAt, endedAt)` with open windows inclusive of `nowMs` (chosen).
- **Chosen path:** `optionalTitle` in `server/http.ts` validates every title-bearing PATCH (5 call sites: tasks, goals, milestones, habits, events): empty/whitespace is `400 title is required`, absent/null keeps the stored name, non-text is 400, length checked pre-trim like `asString`; `client/views/TasksView.tsx` gained the edit-form Title field (required, hint, server error surfaced via `role="alert"`). `habitPeriod` in `server/store.ts` treats a CLOSED pause window as half-open `[startedAt, endedAt)` so an occurrence at the exact resume instant counts, while an OPEN window stays inclusive of the evaluation instant.
- **Rationale:** APE-ACCEPT-002 criterion ACC-01 found `PATCH {title: ""}` answering 200 and blanking records while creation always required a non-empty title; AT33 flaked when a same-millisecond post-resume check-in was excluded by the inclusive bound. One interval convention settles both: `[startedAt, endedAt)` for closed windows, inclusive of `now` while open.
- **Trade-offs:** clients that previously "cleared" a title with `""` now get a 400 they must handle (the UI edit form does); a check-in stamped exactly at `endedAt` now counts (it is after the pause).
- **Reversal path:** revert `optionalTitle` to permissive parsing and the inclusive bound in `habitPeriod`; the 10 ACC-01 tests and the AT33 boundary test would then fail, exposing the reversal.
- **Review dispositions:** ape-reviewer verdict APPROVE (108/108). REV-001 (Medium, PRE-EXISTING): `PATCH /auth/settings` can still store `""` working-hour clocks that parse as 00:00 - routed to backlog, not fixed here (outside ACC-01 scope). REV-002 (Low, NEW): the edit Title field lacked `required` - fixed and re-verified in the browser. REV-003/004 (Info): `optionalTitle` null/pre-trim semantics and two optional edge tests - documented, tests left optional.
- **Source authority:** APE-ACCEPT-002 acceptance criteria ACC-01 and AT33; independent review pass (2026-10-26) REV-001..REV-004.

---

## D-038 - APE-ACCEPT-FOLLOWUP-001: settings clocks are validated strictly (no silent coercion), and nested settings sections must be objects
- **Status:** implemented; proposed-to-Product-Owner.
- **Options considered:** keep the old lenient `optionalString(…, 8)` parsing that stored `""` verbatim and let `parseClock` silently read it as 00:00 (rejected — the exact REV-001 defect); coerce/normalise invalid clocks (e.g. trim, pad, clamp) into a "closest valid" value (rejected — no silent coercion was an explicit requirement); reject every invalid clock shape with 400 while absent/null keeps the stored value (chosen).
- **Chosen path:** `server/http.ts` gained two exported helpers. `optionalClock(value, field)` accepts only `HH:mm` matching `^([0-9]{2}):([0-9]{2})$` with hour ≤ 23 and minute ≤ 59 — the range check is separate because the shape regex alone would let `99:99` through; empty, whitespace-only, padded (`" 08:00 "`), short (`"8:00"`), non-string and out-of-range values are all `400 "<field> must be a time in HH:mm format (00:00-23:59)."`, and a valid value round-trips byte-identical with no trimming or normalisation. `optionalObject(value, field)` accepts only a plain object (rejects `null`, arrays, strings, numbers) with `undefined` alone meaning "section omitted". `PATCH /api/auth/settings` now validates the top-level `settings` and both nested containers (`workingHours`, `softRest`) plus all four clock fields (`workingHours.start/end`, `softRest.start/end`) while building the `merged` object, BEFORE `updateSettings` is called — so a 400 anywhere leaves the stored settings byte-identical (no partial write).
- **Rationale:** REV-001 (backlogged in APE-ACCEPT-002) was that `PATCH {workingHours: {start: ""}}` answered 200, stored `""`, and `buildScheduleContext`→`parseClock` then read it as 00:00 — a silent coercion on a hard-constraint input (H5 protected-time / working-window arithmetic). Replacing the containers with `optionalObject` also closes a second hole the old top-level check let through: `settings: []` (arrays are `typeof "object"`) used to no-op past every field check.
- **Trade-offs:** `null` inside a settings section now means "not sent" (keeps the current value), matching every other `optional*` helper and the route's own `timezone` field; the empty string is the value that gets rejected. The top-level `settings` check is stricter (arrays now 400 where they previously no-op'd) and its 400 now carries `details.field`; the message string is byte-identical to the old one. No client settings screen exists (implementation spec §11.1), so no in-repo caller is affected — verified by the unchanged 108 pre-existing tests.
- **No ordering rule was added (deliberate):** both specs configure working/rest windows as wall-clock ranges (implementation spec §4; master spec) but define NO start/end ordering requirement, so `start > end` is not rejected here. `buildScheduleContext` will emit an inverted `{start, end}` window for e.g. `22:00`→`08:00` and the range arithmetic then operates on that inverted range — identical behaviour before and after this change (any ≤8-char string was previously accepted too). If an ordering rule is ever wanted it is a spec decision, not an implementation detail.
- **Backward compatibility (assessed):** a read-only audit of every local temp DB (3 files, 20 user rows) found 0 stored rows with an empty/malformed/out-of-range clock, and `data/ape.db` does not exist — so no stored value needs repair and no legitimate caller is broken. Legacy already-poisoned rows (if any existed elsewhere) would still be read leniently by `parseClock`; the write path is now closed, but no migration/repair was added (documented as a limitation).
- **Reversal path:** revert `optionalClock`/`optionalObject` to permissive parsing and restore the inline top-level check; the 8 FUP regression tests and the live `settings-clock-probe` would then fail, exposing the reversal.
- **Review dispositions (ape-reviewer verdict APPROVE WITH COMMENTS, 0 Critical / 0 High / 1 Medium / 4 Low / 3 Info):** REV-FUP-01 (Medium, NEW): the strictness change and the deliberate no-ordering-rule reading had no repo documentation — fixed by this entry plus the traceability evidence log. REV-FUP-02 (Low, NEW): FUP-06 advertised four round-trip edge values but asserted only `edges[0]` — fixed (now loops every edge on every field). REV-FUP-03 (Low, NEW): `settings: []` now 400s and the 400 carries `details.field` — accepted, zero blast radius, recorded here. REV-FUP-04 (Low, PRE-EXISTING): `graceMinutes` still silently coerces (`""`/`null` → 0) unlike its strict siblings — accepted for this increment (grace is a clamped soft-tolerance input, not a clock field, and was outside the task's clock scope); routed to a future increment. REV-FUP-05 (Low, NEW): the test describe/title ranges said "FUP-01 … FUP-07" while containing FUP-08 — fixed. REV-FUP-06 (Info, PRE-EXISTING): legacy invalid stored clocks are not repaired on read (`parseClock` still lenient) — accepted, disclosed as a limitation (audit found 0 such rows). REV-FUP-07 (Info, PRE-EXISTING): confirmed the no-ordering-rule reading is correct, not a missed requirement — recorded above. REV-FUP-08 (Info, PRE-EXISTING): `workingHours.days` still silently filters invalid entries — accepted, out of clock scope.
- **Source authority:** APE-ACCEPT-FOLLOWUP-001 acceptance criteria AC01-AC08; independent review pass (2026-10-27) REV-FUP-01..REV-FUP-08; APE-ACCEPT-002 report REV-001 backlog entry.

---

## D-039 - APE-BATCH-003: inverted (start > end) and zero-width (start == end) working/rest windows are refused with 400
- **Status:** implemented; proposed-to-Product-Owner.
- **Context:** D-038 deliberately added no ordering rule because neither spec defines one. APE-BATCH-003 Phase 2b then characterized the behavior of an inverted window end to end instead of assuming it, per the task's decision rule ("overnight handled correctly" vs "reject"). Measured on the built artifact: `workingHours 22:00 -> 08:00` produced a **negative-width (-840 minute) working window** that free-slot arithmetic silently dropped, surfacing as an honest but wrong-feeling `Only 0 free minutes` infeasibility for a schedule entirely inside the user's intended overnight wake window; `08:00 -> 08:00` produced zero-width windows with the same silent-drop outcome. Overnight is therefore NOT handled correctly - the product silently pretends the user set no working time at all, and `softRest 13:00 -> 12:00` similarly drops the rest window from day math. Per the rule, the chosen path is rejection, not silent acceptance.
- **Options considered:** keep the silent drop (rejected - violates "handle infeasible schedules explicitly; never silently violate hard constraints" in spirit: the schedule is silently constrained to nothing); support true overnight windows by wrapping midnight in `buildScheduleContext` (rejected for this bounded increment - a scheduler-context semantic change with blast radius across planning, persistence, and the locked-calendar override flow, and no spec definition of overnight windows exists to implement against); reject inverted and equal windows with 400 naming the offending field (chosen - smallest change that removes the silent wrongness and is spec-neutral, since a range whose start is not before its end is not a valid wall-clock range under spec section 4 either).
- **Chosen path:** `server/routes/auth.ts` (`PATCH /api/auth/settings`) validates the **merged** section values - after `merged` is built from current + incoming, before `updateSettings` - so a partial patch (`{workingHours: {start: "23:30"}}` against a stored end of `22:00`) is refused exactly like a full inverted pair; a partial patch cannot smuggle an inversion past the rule. `merged.workingHours.start >= merged.workingHours.end` is `400` with a message naming `settings.workingHours.end` and `details.field = "settings.workingHours.end"`; the same for `merged.softRest` naming `settings.softRest.end`. Because validation runs before any write, a refused PATCH leaves stored settings byte-identical (no partial write). Equal windows (`start == end`, zero width) are refused by the same `>=` comparison: a zero-width window is as silent-drop-worthless as an inverted one, and the decision rule treats both identically.
- **Rationale:** the negative-width window was the clearest violation found in Phase 2 ("overnight NOT handled correctly"), and the rule directed a rejection with a 400 naming the field. Naming the END field (not the start) because under the ordered-pair invariant the end is the value that must move to restore validity in the common case.
- **Trade-offs / disclosure:** (1) **Overnight windows are now impossible to configure via the API** - a user whose real working window is 22:00 -> 08:00 gets a 400 instead of a working (if previously broken) schedule; they must express overnight work as two windows or a full-day window, neither of which this increment adds. This is a deliberate product limitation pending a spec definition of overnight support. (2) **FUP-06 was amended** (not weakened): its per-field edge loop used to write start edges (`00:00` .. `23:59`) and end edges against whatever was stored, which under the new rule leaves two extremes with no valid partner (start `23:59`, end `00:00`). The loop now pins each field's edges against a companion clock that keeps the pair valid (start edges with end `23:59`, end edges with start `00:00`); every still-valid value still round-trips byte-identical exactly as before, and the two formerly-valid-now-invalid extremes are pinned as 400s by the new B3-04 test. No assertion was deleted or relaxed. (3) `workingHours.days` still silently filters invalid entries (spec defines no valid values; REV-FUP-08 disposition stands) - **documented only, no code change**, per the task rule that unspecified behavior is reported, not invented. (4) **The `softRest` ordering check runs even while rest is disabled** (REV-R307): the scheduler only reads that window when `softRest.enabled` is true, so a disabled-but-inverted window would be harmless at runtime, but it is refused anyway - the deliberate choice is that stored configuration stays uniformly valid rather than carrying a value that would 400 the moment it is enabled. Blast radius: a user cannot *store* a disabled inverted rest window (nothing existing is broken by it). (5) **A window stored before D-039 makes every subsequent settings PATCH fail 400 until it is repaired** (REV-R310): validation runs on the merged pair, so a pre-existing inversion (e.g. written before this rule existed) blocks all settings writes loudly rather than silently - this is intended "fail loudly" behaviour, and the risk is negligible in practice: D-038's audit found no such rows and `data/ape.db` does not exist in this workspace.
- **Reversal path:** remove the two `>=` checks in `auth.ts` and restore the FUP-06 edge loop; the B3-04/B3-06 tests and the ordering block of `settings-clock-probe` would then fail, exposing the reversal.
- **Evidence:** `tests/regression.test.ts` B3-04 (inverted/equal/merged-pair/byte-identical re-reject), B3-05 (poisoned bodies leave settings byte-identical), B3-06 (end-to-end: scheduler windows all positive width + plan still computable); `scripts/acceptance/settings-clock-probe.mjs` ordering block (6/6 rejects name the end field; re-reject byte-identical; valid ordered window still accepted) on the built artifact.
- **Source authority:** APE-BATCH-003 Phase 2b decision rule (characterize then decide); implementation spec section 4 (wall-clock range semantics); master spec (hard-constraint honesty).

---

## D-040 - APE-BATCH-003: graceMinutes is validated strictly (no silent coercion, no silent clamp), range 0-120
- **Status:** implemented; proposed-to-Product-Owner.
- **Context:** REV-FUP-04 (Low, PRE-EXISTING) recorded that `graceMinutes` still silently coerced unlike its strict clock siblings added in D-038: `Number("") -> 0`, `Number(" ") -> 0`, `Number("25") -> 25`, `Number(true) -> 1`, `Number([]) -> 0`, and out-of-range values were silently clamped into 0-120 by `Math.min/Math.max`. The input had carried that 0-120 clamp since the first vertical slice (commit `465f38c`), i.e. since before any spec text existed to define a numeric range for it; neither spec defines a grace range, so the first-commit clamp is promoted from a silent behavior to the explicit validated range.
- **Options considered:** keep the lenient coercion (rejected - REV-FUP-04 was explicitly routed to a future increment and this is it); coerce non-numbers to a default (rejected - silent coercion was the exact defect class D-038 closed); accept only real numbers, round to the nearest whole minute, check the range on the ROUNDED value, and 400 anything else naming the field (chosen).
- **Chosen path:** `server/http.ts` gained `optionalIntStrict(value, field, min, max)` - the integer sibling of `optionalClock`: strict `typeof number` (so `""`, `" "`, `"25"`, `true`, `false`, `[]`, `[25]`, `{}`, `NaN`, `Infinity` are all `400` with `details.field`), `null`/absent means "keep the stored value" (matching every other `optional*` helper), the value is `Math.round`ed and the min/max range is checked **on the rounded value** (`-0.4 -> 0` accepted, `-0.6 -> -1` refused; `120.4 -> 120` accepted; `25.6 -> 26` stored as 26). `PATCH /api/auth/settings` uses `optionalIntStrict(incoming?.graceMinutes, "settings.graceMinutes", 0, 120)` - out-of-range is now a 400 instead of a silent clamp, so the user learns their value was refused rather than silently rewritten.
- **Rationale:** closes REV-FUP-04 with the same contract D-038 established for the clock fields; the rounding-then-range order is the least surprising to a user sending `25.6` (they mean ~26 minutes, not a rejection), while a value that is out of range even after rounding is unambiguously wrong. Range-checking the rounded value (not the raw one) is what makes `120.4` acceptable while `120.6` is refused.
- **Trade-offs:** a caller that previously sent a numeric string (`"25"`) or `true` and got silent coercion now gets a 400 they must handle; the only in-repo caller surface is the API (no settings screen exists, implementation spec section 11.1), and the pre-existing FUP-04 test bodies plus B3-01 cover the new contract, so blast radius is the API contract only. Values that used to be silently clamped (e.g. `999 -> 120`, `-5 -> 0`) are now refusals.
- **Reversal path:** restore the `Number(...)`/`Math.min`/`Math.max` expression; B3-01/B3-02/B3-03 and the probe's graceMinutes block would then fail, exposing the reversal.
- **Evidence:** `tests/regression.test.ts` B3-01 (8 invalid shapes -> 400 naming `settings.graceMinutes`, settings unchanged), B3-02 (out-of-range refused, rounding pins `-0.4->0`, `120.4->120`, `25.6->26`), B3-03 (null/absent keeps, `0`/`120` accepted); `scripts/acceptance/settings-clock-probe.mjs` graceMinutes block (11/11 invalid -> 400 all naming the field, bounds+rounding accepted, null keeps) on the built artifact.
- **Source authority:** REV-FUP-04 (APE-ACCEPT-FOLLOWUP-001 review, routed to a future increment); D-038 strictness contract; commit `465f38c` (origin of the 0-120 clamp).

---

*Entries are proposals to the Product Owner. No decision here is claimed as user-approved product direction; PO approval may accept, amend, or reject any entry (spec PHẦN O approval rule).*

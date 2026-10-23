---
name: fullstack-implementation
description: "Use when building or integrating APE application code — API endpoints, domain models, persistence, the deterministic scheduler, and UI wiring across the TypeScript modular monolith. Applies layer boundaries, invariants, and suggest-only AI rules to every change."
---

# Full-Stack Implementation & Integration

## Workflow

1. Re-read the target acceptance criteria and the relevant master-spec section
   (entities/invariants E1–E2, hard constraints H1–H11) before touching code.
2. Place each change in the correct layer: Presentation (responsive UI, no
   secrets) → Application API (authenticated CRUD, revision checks,
   transactions) → Domain Core (Task/Goal/Habit/TimeBlock/WorkSession models,
   invariants, recurrence) → Scheduling Service (free-interval computation,
   constraint validation, candidate generation, proposal store) → Persistence &
   Security (relational integrity, owner-level authorization).
3. Keep scheduling deterministic: explicit stable tie-break rules, hard
   constraints before soft objectives, and honest infeasibility output — never a
   plausible-looking schedule that violates H1–H11.
4. Every write carries owner, revision, and audit entry; validate the revision
   before applying (reject stale proposals, H8); check object-level permission
   on every action (H2); no session creation for archived/cancelled items (H10).
5. AI features stay suggest-only by default: proposal with snapshot and expiry,
   preview, explicit user commit, audit + undo — AI never writes the domain
   directly and permissioned-auto is opt-in per task.
6. Add or extend tests alongside the change: unit tests for domain logic,
   integration tests for API paths, edge cases for timezone, recurrence, DST,
   and concurrent update conflicts.
7. Run checks (targeted tests, suite, lint, typecheck, build); repair in-scope
   failures at the root cause; review the diff for unrelated edits and secrets.
8. Update requirement-to-test traceability with actual observed results, then
   report the final evidence report and continue to the next increment.

## Quality checks

- No code path can violate H1–H11 in happy or adversarial scenarios.
- Owner/revision/audit present on every write; no silent high-impact mutation.
- Deterministic outputs are reproducible run-to-run for identical inputs.
- No secrets client-side; no external AI or paid services added; app remains
  usable without AI.
- New UI surfaces ship with loading, empty, success, and error states.

## Expected evidence

- Files-changed list with one-line reasons.
- Test names added/run and their results; exact commands.
- Sample deterministic scheduler outputs (same input → same plan).
- Traceability rows updated with PASS/FAIL/BLOCKED/NOT VERIFIED.
- Diff review notes (unrelated edits, secrets, integration, UX states).

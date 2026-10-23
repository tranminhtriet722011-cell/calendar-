---
name: spec-architecture
description: "Use when reconciling conflicting APE requirements, turning the master spec into an implementation-ready version, or making an architecture/stack/ADR decision. Covers source-of-truth priority, conflict resolution, decision logs, and versioned specification artifacts."
---

# Spec Reconciliation & Architecture Design

## Workflow

1. Gather sources in the contract's priority order: (1) explicit Product Owner
   requirements and hard constraints, (2) latest approved spec and acceptance
   criteria, (3) existing repo decisions consistent with 1–2, (4) supplied
   reviews as evidence of issues (not automatic approval), (5) agent judgment
   and research.
2. Trace every conflicting requirement to its source; resolve by priority. If
   still ambiguous, prefer the option preserving core product outcomes, security,
   user data, simplicity, reversibility, accessibility, and flexibility.
3. Preserve originals: create a new version (e.g. V1_1) or tracked changes —
   never silently overwrite the only copy of the spec.
4. Maintain a decision log entry per consequential decision: assumption,
   options, chosen path, rationale, trade-offs, reversal path.
5. Verify coherence of the domain model against spec invariants: Task ≠
   TimeBlock ≠ WorkSession (0..n relationships), Goal progress independent of
   task completion, every write owner+revision+audit, AI proposals carry
   snapshot+expiry and are rejected when stale (H8).
6. Order all scheduling behavior: hard constraints H1–H11 enforced before soft
   objectives S1–S9; infeasibility communicated honestly, never silently
   violated.
7. Write architecture decisions as ADRs before code (framework/auth, schema and
   migrations, scheduling algorithm, AI provider vs local, calendar scopes,
   audit/undo, privacy). Prefer a modular monolith (TypeScript full-stack as the
   spec's reference option) over microservices for the MVP; choose maintainable,
   low-cost, free/local-first options without asking the Product Owner to pick
   routine alternatives.
8. Define measurable acceptance criteria and a requirement-to-test traceability
   row per requirement; stop polishing once the spec is consistent enough to
   implement safely.

## Quality checks

- No requirement silently dropped; every conflict resolution logged with source.
- Spec changes are versioned; the original file is untouched or tracked.
- Acceptance criteria are measurable and verifiable by a command or observation.
- No stack or framework assumed before repo inspection; no paid service chosen
  by default.
- Proposals clearly labeled PROPOSED — never described as approved.

## Expected evidence

- Conflict register: conflict → source → resolution → decision-log ID.
- Decision log entries with rationale and reversal path.
- Versioned spec path and traceability matrix rows.
- ADR list with status; acceptance criteria list.

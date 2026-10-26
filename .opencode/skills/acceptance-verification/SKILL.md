---
name: acceptance-verification
description: "Use when verifying that a built APE product actually works end to end — launching on a fresh database, driving the main journeys, probing persistence, error flows, calendar constraints, undo/audit, offline behaviour and API security, and collecting a requirement-to-evidence matrix. Produces PASS/FAIL/BLOCKED/NOT VERIFIED statuses backed by executed commands and observed responses, never by assertion."
---

# Acceptance Verification — Evidence-Driven Product Checking

## Workflow

1. Establish the artifact under test: confirm a clean or known-dirty tree, run
   the gate (`npm run check`), and launch the BUILT artifact (`node
   dist/server.mjs`) on a throwaway database (`APE_DB_FILE` in the OS temp
   directory) with a spare port (`APE_PORT`). Never test a stale `dist` and
   never point acceptance at the developer's real `data/ape.db`.
2. First-run acceptance: a fresh database must show sign-in/sign-up, no stored
   session, and honest first-run empty states.
3. Drive the core journey through the real UI (browser tooling when available;
   API-level probes otherwise, with the limitation stated explicitly): capture
   (quick add → inbox, nothing auto-scheduled) → goals → plan preview
   (multiple proposals, feasibility honest, including an infeasible shortfall
   with named reasons) → commit (sessions placed, undo offered) → execute
   (start → work log → complete with honest confirm copy) → recovery
   proposals → habit check-in with period attainment.
4. Verify calendar constraints: locked events honoured, overlap attempts
   refused with a named conflict and nothing placed, and the two-step override
   (explicit ack + confirm) producing an audited schedule exception.
5. Verify undo/audit: the commit entry offers a working undo, double-undo is
   blocked with an honest message, released blocks appear as audit entries,
   and exceptions are retained in the timeline.
6. Verify persistence: take an API snapshot of every fact → stop the server →
   restart from the same database (new process) → compare facts and confirm
   the session survives.
7. Verify error flows: invalid input, stale-revision conflict (e.g. two tabs),
   the task state-machine guard, and empty/whitespace title rejection on every
   title-bearing PATCH route.
8. Verify offline/no-external behaviour: browser resource entries must show a
   single local origin; no fonts, CDN, analytics, or external AI endpoints.
9. Run API security probes: foreign-object access answers 404 with an oracle
   that is identical for unknown vs foreign ids, unauthenticated reads answer
   401, exports contain no credential material, and duplicate submissions are
   deduplicated rather than double-applied.
10. Map requirement → evidence (test name / driven flow / probe → status).
    Acceptance fixes nothing by default: defects are reported with
    reproduction steps, fixed in a separate `/implement` increment with a
    regression test, then re-verified here.

## Browser automation gotchas (validated on this repository)

- Set React-controlled inputs through the native value setter, then dispatch
  `input` (and `change` for selects) — direct `.value =` is ignored.
- Never navigate and evaluate in one script call: navigate, wait for load,
  then evaluate separately or the evaluate context dies with the navigation.
- Target row-scoped ids (`edit-*-${taskId}`) rather than shared form ids so
  the edit form of the intended row is driven, not the create form.
- Treat dialogs, `[role=status]`, and `.error-panel` as the authoritative
  outcomes; a success toast with an unchanged row means "check the API".

## Quality checks

- Every PASS cites an executed command or an observed screen/API response from
  this run; nothing passes by documentation claim.
- The server under test is the freshly built artifact on a fresh database.
- Flows that could not be driven are NOT VERIFIED with a concrete manual step,
  never assumed green.

## Expected evidence

- Gate results; the exact launch command, database path, and port.
- Flow-by-flow table: flow/gate | PASS/FAIL/BLOCKED/NOT VERIFIED | evidence.
- Persistence before/after fact comparison; security probe results.
- Requirement-to-evidence matrix; defect list routed to `/implement`; residual
  risks and unverified items.

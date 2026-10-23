---
name: release-readiness
description: "Use when asked whether an APE increment or milestone is ready to hand off or release — builds an evidence-based gate assessment with statuses and an evidence table, while never deploying, publishing, pushing, or incurring cost."
---

# Release Readiness & Evidence-Based Handoff

## Workflow

1. Load the gate sources: the contract's definition of done, the spec's release
   gates (security/privacy approved, backups restored in test, no unauthorized
   writes or hard-constraint violations in the acceptance suite, timezone/
   recurrence correctness, mobile + accessibility smoke, model cost cap,
   incident/feedback path, owner sign-off), and the current milestone's scope.
2. For each gate, run or locate real evidence: tests, lint, typecheck, build,
   security/dependency checks, accessibility smoke, decision log, traceability
   matrix. A gate without evidence is NOT VERIFIED — never PASS by assertion.
3. Assign a status per gate: PASS / FAIL / BLOCKED / NOT VERIFIED, each with the
   exact command or artifact that produced it.
4. Cross-check traceability: every in-scope acceptance criterion has a status;
   claims of "complete" without a run are downgraded.
5. Compile blockers and required approvals; separate "ready for local handoff"
   (no external side effect) from "ready for public release" (requires explicit
   Product Owner authorization).
6. Keep forbidden actions forbidden: no deploy, no publish/release, no push to
   any Git remote, no paid services or billable infrastructure, no secret
   exposure, no destructive data operations. Hitting any of these → stop that
   action, report the boundary, request approval.
7. Produce ONE consolidated readiness report; recommend the next checkpoint if
   the product cannot be completed in a single run.

## Quality checks

- Every PASS cites a command or artifact actually produced this session.
- NOT VERIFIED never upgraded to PASS; BLOCKED items carry evidence of the
  blocker and the safe unblock path.
- No deploy/push/paid action performed or simulated.
- Known limitations, decision log state, and remaining scope stated honestly.

## Expected evidence

- Gate checklist table: gate | status | evidence.
- Acceptance-traceability summary (PASS/FAIL/BLOCKED/NOT VERIFIED counts).
- Blocker list with owners/next actions; approvals required from the Product
  Owner, stated precisely.
- Exact commands run with results; verdict: READY / NOT READY per target.

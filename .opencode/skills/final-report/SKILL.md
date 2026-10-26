---
name: final-report
description: "Use when wrapping up an APE task, increment or milestone that needs one consolidated final report — assembles scope, gate statuses, commands actually run, flows and probes checked, defects fixed and remaining, security review, files changed, run instructions and required approvals into docs/reports/<TASK-ID>-REPORT.md per AGENTS.md §7."
---

# Final Report Assembly

## Workflow

1. Collect only evidence produced in this effort: commands actually run with
   their results, checks and gates with statuses, flows and probes driven,
   defects found/fixed with regression proof, and review findings with their
   disposition (fixed / accepted / deferred).
2. Classify every gate and acceptance item as PASS / FAIL / BLOCKED /
   NOT VERIFIED. NOT VERIFIED is never upgraded to PASS; BLOCKED items carry
   the blocker evidence and the safe unblock path; FLAKY items state the
   observed intermittency and the reproduction window.
3. Classify claims VERIFIED / PROPOSED / UNKNOWN per AGENTS.md §7, and label
   failures PRE-EXISTING vs NEW relative to the pre-effort baseline.
4. Include, in this order: overview and final status; deliverables (done vs
   not done); gate/acceptance table with per-row evidence; commands run;
   defects fixed and remaining; security review outcome; files changed with
   one-line reasons; environment limitations; exact local run instructions;
   approvals still required from the Product Owner.
5. Write exactly ONE report file at `docs/reports/<TASK-ID>-REPORT.md`
   (creating the directory if needed) and finish with a short chat summary:
   report path, changed-file list, one-paragraph status. The report stays
   local — never push it as part of reporting.
6. When the effort changed requirements, decisions, or traceability, update
   those artifacts first and link them from the report instead of duplicating
   their content.

## Quality checks

- No claim without an executed command or an observed artifact behind it; no
  deployment, connectivity, or production-readiness claims unless verified.
- Implemented functionality is clearly separated from documentation,
  mockups, and proposals.
- The report distinguishes product code, tests, tooling, and documentation
  changes, and states what a reviewer should re-run to reproduce the evidence.
- One consolidated report per effort — no routine progress reports.

## Expected evidence

- The report file path.
- Gate table with a status and evidence per gate.
- Files-changed list; run instructions; approvals-required section.

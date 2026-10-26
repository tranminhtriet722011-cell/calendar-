---
description: "Assemble the single consolidated final report for a completed APE task into docs/reports/<TASK-ID>-REPORT.md — statuses, commands run, evidence, files changed, remaining issues and required approvals — without pushing or extending scope."
agent: ape-builder
---

## Purpose

Turn this effort's verified evidence into ONE consolidated final report per
AGENTS.md §7 and the `final-report` skill. The report contains only what was
actually executed or observed during the effort — no reconstructed results.

## Expected inputs

- `$ARGUMENTS` — the task/milestone id (e.g. `APE-OPENCODE-SETUP-001`),
  plus optional `--chat-only` to skip writing the file. Empty means infer the
  id from `tasks/` or the latest decision-log entry; ask only if it cannot be
  inferred.

## Allowed actions

- Read workspace files, read-only git, and the session's own recorded
  evidence (commands, check results, review findings).
- Write ONLY `docs/reports/<TASK-ID>-REPORT.md` (creating `docs/reports/` if
  needed), plus the traceability or decision-log updates the report depends
  on when those artifacts changed during the effort.

## Stop conditions

- Mandatory approval boundaries: no push, no deploy/publish, no paid
  services, no secret exposure, no destructive data operations.
- No new implementation, refactoring, or "quick fixes" while assembling the
  report — unfinished work is reported as remaining work, never silently
  completed or quietly dropped.
- Every status cites evidence from this effort; anything unproven is
  NOT VERIFIED or UNKNOWN. FLAKY results state the observed intermittency.
- Stop when the report file and the short chat summary are delivered.

## Output format

- Report file sections: Overview & final status; Deliverables done vs not
  done; Gate/acceptance table (PASS/FAIL/BLOCKED/NOT VERIFIED + evidence);
  Commands run; Defects fixed and remaining; Security review; Files changed;
  Environment limitations; Run instructions; Approvals required next.
- Chat close-out: report path + changed-file list + one-paragraph status.

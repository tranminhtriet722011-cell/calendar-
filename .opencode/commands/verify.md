---
description: "Run relevant checks for an area, classify results PASS/FAIL/BLOCKED/NOT VERIFIED, safely repair in-scope failures, and rerun."
agent: ape-builder
---

## Purpose

Verify an area, feature, or acceptance-criteria set by running the relevant
checks, classifying every result, repairing safe in-scope failures at their root
cause, and rerunning until results are honestly classified.

## Expected inputs

- `$ARGUMENTS` — the area or criteria to verify, e.g. `scheduler determinism`,
  `auth endpoints`, `all`, or `tasks/<file>`. Empty means verify the current
  working-tree changes.

## Allowed actions

- Run checks: targeted tests first, then unit/integration suites, lint,
  typecheck, build, and available security/dependency checks.
- Read any workspace file (no `.env` secrets; `.env.example` only).
- Edit only to repair in-scope defects discovered by the failing check; add
  regression tests for the repaired defect.
- Read-only git: `git status *`, `git diff *`, `git log *` to establish whether
  a failure is PRE-EXISTING or NEW.

## Stop conditions

- Mandatory approval boundaries: no push, no deploy/publish, no paid services,
  no secret exposure, no destructive data operations.
- Never weaken or delete tests to get green; a failing test may only be changed
  when it is factually wrong per a cited spec clause.
- If a fix would expand scope, conflict with a hard constraint, or requires
  unavailable credentials/tools, classify the item BLOCKED with evidence and
  continue verifying the rest.
- Stop after each check has a final classification; do not loop endlessly on a
  flaky or environmental failure — label it FLAKY or BLOCKED with evidence.

## Output format

1. **Verification table** — one row per check:

   | Check | Command | Result (PASS/FAIL/BLOCKED/NOT VERIFIED) | Origin (NEW/PRE-EXISTING) | Evidence |

2. **Repairs** — defect → root cause → files changed → rerun result.
3. **Regression status** — the broader suite result after repairs.
4. **Not verified** — anything not actually run, with the safe manual step.
5. **Remaining risks** — honest limitations; recommended next action.

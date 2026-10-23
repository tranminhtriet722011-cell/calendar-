---
name: test-repair
description: "Use when any check fails or when verifying an increment — diagnose failures at the root cause, repair safely, and prove no regression, including separating NEW failures from the PRE-EXISTING baseline and never weakening tests to get green."
---

# Test, Diagnose, Repair & Regression Verification

## Workflow

1. Establish the baseline first (from the discovery skill) so pre-existing
   failures are known before judging any change.
2. Run the smallest failing scope first (single test/file), capture the exact
   command and full failure output.
3. Diagnose the root cause before editing. Classify every failure: NEW
   regression, PRE-EXISTING baseline failure, FLAKY (order/timing dependent), or
   ENVIRONMENT/BLOCKED (missing tool, credential, or permission).
4. Fix in-scope defects at the cause — product code first. Change a test only
   when the test itself is factually wrong per a cited spec clause (e.g. it
   asserts a soft objective overriding a hard constraint); otherwise never
   weaken or delete assertions, coverage, or the test itself to get green.
5. Add a regression test that fails before the fix and passes after it.
6. Rerun the failed check, then the broader suite (plus lint/typecheck/build)
   to catch cross-module regressions.
7. Handle non-determinism properly for the scheduler: compare full input
   snapshots, verify tie-break stability, and timezones before calling a result
   flaky.
8. Update evidence: every affected check gets PASS/FAIL/BLOCKED/NOT VERIFIED
   with the command that produced it; refresh traceability rows.
9. If repair would exceed scope, hit an approval boundary, or require weakening
   a hard constraint, stop that fix, record BLOCKED with evidence, and continue
   other safe work.

## Quality checks

- Root cause identified and stated; symptom suppression rejected.
- Test count and strength not reduced without a cited spec clause.
- Flaky tests flagged and stabilized, not hidden or deleted.
- NEW vs PRE-EXISTING determined from the git baseline, not guessed.
- Diff contains no unrelated edits; no `.env`/secret touched.

## Expected evidence

- Failure output excerpt and root-cause statement.
- Files changed with reasons; the added regression test name.
- Before/after command results for the failed check and the broader suite.
- Classification table: check → NEW / PRE-EXISTING / FLAKY / BLOCKED.
- Traceability update with final statuses.

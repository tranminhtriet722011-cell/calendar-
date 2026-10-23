---
name: independent-review
description: "Use when a second, unbiased pass is needed over a diff, feature, or architecture area — applies ape-reviewer standards: read-only, severity-ordered findings with file:line evidence, and NEW vs PRE-EXISTING origin for every finding."
---

# Independent Code & Architecture Review

## Workflow

1. Define the review scope: diff range (e.g. working tree, `HEAD~1..HEAD`) or
   architectural area, plus the applicable requirement set — acceptance
   criteria, hard constraints H1–H11, security/privacy rules, accessibility
   targets.
2. Gather evidence read-only: `git status`/`git diff`/`git log`, source files,
   tests, and the relevant master-spec sections. Never edit files; use only
   allowlisted read-only/test commands.
3. Review coverage dimensions in order: requirement coverage → correctness
   (logic, edge cases, timezone/recurrence, deterministic tie-breaks) → data
   integrity (Task ≠ TimeBlock ≠ WorkSession; owner+revision+audit on writes;
   stale proposal rejection H8) → hard-constraint violations (locked events
   moved? unauthorized moves? silent deadline edits? dishonest infeasibility?)
   → authorization/ownership → security & privacy (secrets, suggest-only AI
   default, consent) → accessibility & responsive UX (WCAG 2.2 AA target:
   keyboard, focus, contrast, reduced motion, 320px+, empty/loading/error
   states) → test coverage & quality (weakened or deleted tests?) →
   maintainability.
4. Classify severity with product-impact rationale: Critical (data loss, hard
   constraint violation, auth bypass, secret exposure, silent AI mutation),
   High (correctness defect, infeasible plan presented as feasible), Medium
   (test gap, UX state inconsistency, accessibility failure), Low (naming,
   minor docs drift), Info (observations worth logging).
5. Verify each finding is reproducible from its evidence; anything unobservable
   is UNKNOWN, not a finding.
6. Distinguish origin: NEW (introduced by the reviewed change — confirmed via
   the diff) vs PRE-EXISTING (present before it).
7. Output the severity-ordered report, counts, and verdict:
   APPROVE / FIX-FIRST / BLOCK.

## Quality checks

- Read-only honored end to end; no file modified, no destructive command run.
- Every finding has file:line evidence and a quote; no speculation presented as
  fact; no vague "consider improving" without an actionable fix.
- Findings strictly ordered by severity; NEW vs PRE-EXISTING always stated.
- Verdict reflects only evidence; unverified items listed as UNKNOWN.

## Expected evidence

- Findings list in the required format (ID, severity, file:line, evidence, why
  it matters, recommended fix, origin).
- Scope statement and commands used.
- Severity counts and final verdict.

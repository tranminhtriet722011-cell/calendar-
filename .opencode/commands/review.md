---
description: "Run an independent read-only review of a diff or area using the ape-reviewer subagent; reports severity-ordered, evidence-backed findings."
agent: ape-reviewer
subagent: true
---

## Purpose

Obtain an unbiased second pass over changes or an area: requirement coverage,
correctness, data integrity, hard-constraint violations, authorization,
security/privacy, accessibility, and test quality — without the reviewer editing
anything.

## Expected inputs

- `$ARGUMENTS` — review scope: a diff range or `working tree` (default: current
  uncommitted changes plus the last commit), or an area/spec section (e.g.
  `scheduler service`, `G3 recovery planning`). Optional focus keywords
  appended, e.g. `scheduler — focus: security, accessibility`.

## Allowed actions

- Delegate to the `ape-reviewer` subagent; the review itself uses only
  read/glob/grep plus its allowlisted shell commands (`git status *`,
  `git diff *`, `git log *`, `npm test*`, `npm run test*`).
- The command performs no edits, no writes, and no configuration changes of any
  kind — findings are reported in chat, not committed to files.

## Stop conditions

- The reviewer never modifies files and never runs destructive commands; if a
  check would require a write or an unallowlisted command, it is reported as
  NOT VERIFIED with a safe manual step.
- Mandatory approval boundaries still apply: no push, no deploy/publish, no paid
  services, no secret exposure, no destructive data operations.
- Review only: findings are reported, not fixed. Fixing is a separate
  `/implement` increment by the builder, followed by a re-review for
  Critical/High findings.
- Stop when the findings report is complete; do not expand scope beyond the
  requested diff/area.

## Output format

1. **Scope reviewed** — diff range or area, files/sections read, commands used.
2. **Findings** — sorted Critical → Info; each with: ID (REV-nnn), severity,
   `file:line`, evidence quote, why it matters, recommended fix, origin
   (NEW vs PRE-EXISTING).
3. **Summary counts** — findings per severity.
4. **Verdict** — APPROVE / FIX-FIRST (list the Critical/High items) / BLOCK.
5. **UNKNOWNs** — anything that could not be observed, with manual verification
   steps.

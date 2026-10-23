---
description: "Read-only audit of the APE repository and environment; changes no files and reports evidence-backed findings."
agent: ape-reviewer
subagent: true
---

## Purpose

Audit the repository and environment for hygiene and risk: structure and
configuration validity, security/secret hygiene, documentation and traceability
gaps, and baseline check status — strictly read-only.

## Expected inputs

- `$ARGUMENTS` — optional audit focus: `config`, `permissions`, `secrets`,
  `docs`, `tests`, `structure`. Empty means the full audit.

## Allowed actions

- Delegate to the `ape-reviewer` subagent; use only read/glob/grep and the
  allowlisted shell commands (`git status *`, `git diff *`, `git log *`,
  `npm test*`, `npm run test*`).
- Report findings in chat only — do not write, edit, or delete any file, not
  even a report file, and do not modify git state.

## Stop conditions

- Read-only throughout. If any check would require writing a file, installing
  dependencies, or running an unallowlisted command, mark it NOT VERIFIED and
  give a safe manual verification step instead of performing it.
- Mandatory approval boundaries: no push, no deploy/publish, no paid services,
  no secret exposure, no destructive data operations (no reset, checkout --,
  forced cleanups, or test runs that would mutate seeded data).
- Stop when the audit report is complete; audit findings are reported, never
  fixed by this command.

## Output format

1. **Inventory summary** — top-level structure, OpenCode artifacts
   (`opencode.json`, `.opencode/` agents/commands/skills), docs, tests, runtime
   presence — VERIFIED or UNKNOWN per item.
2. **Findings** — sorted Critical → Info; each with: ID (AUD-nnn), severity,
   `file:line`, evidence quote, why it matters, recommended fix, origin
   (NEW vs PRE-EXISTING where determinable).
3. **Secrets & config hygiene** — `.env` files present? secrets in tracked
   files? template completeness — evidence-based only.
4. **Baseline check status** — checks that were run, with results labeled
   PRE-EXISTING; checks not run, with reasons.
5. **Claim table** — every claim classified VERIFIED / PROPOSED / UNKNOWN.

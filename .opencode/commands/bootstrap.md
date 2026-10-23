---
description: "Inspect environment, repository state, and OpenCode configuration validity; report and safely resolve setup gaps."
agent: ape-builder
---

## Purpose

Establish a trustworthy baseline before any product work: what the environment
actually is, what the repository contains, and whether the project-local OpenCode
operating system (`opencode.json`, `AGENTS.md`, `.opencode/` agents, commands,
and skills) is valid and discoverable.

## Expected inputs

- `$ARGUMENTS` — optional focus area, e.g. `opencode-config`, `git-state`,
  `toolchain`, `artifacts`. Empty means run the full baseline.

## Allowed actions

- Read any workspace file (never `.env`/secret files; `.env.example` templates
  only).
- Read-only shell inspection: `git status *`, `git diff *`, `git log *`,
  `node --version *`, `npm --version *`.
- Parse/validate JSON and YAML frontmatter of `opencode.json` and
  `.opencode/**` files with read-only checks.
- Create or narrowly edit project-local OpenCode setup artifacts that are
  missing or structurally invalid (`.opencode/**`, `opencode.json`) — reversible,
  workspace-only.
- Start the local dev server or run a harmless read-only smoke test only when a
  runtime actually exists in the repo.

## Stop conditions

- Never `git push`, deploy, publish, activate paid services, expose secrets, or
  perform destructive data operations (no reset, forced cleanup, or discarding
  uncommitted work).
- Ask (do not force) before unknown/high-impact shell commands or
  external-directory access.
- Never overwrite unrelated uncommitted user work: report it as PRE-EXISTING
  dirty state instead of resolving it.
- If a gap cannot be safely fixed, mark it BLOCKED with evidence and continue
  the remaining checks.

## Output format

1. **Environment table** — OS, runtime versions, OpenCode config presence; each
   row VERIFIED or UNKNOWN (UNKNOWN rows include a safe manual verification step).
2. **Repository state** — branch, dirty files, recent commits (read-only evidence).
3. **OpenCode artifacts** — file-by-file: existing / missing / invalid.
4. **Gaps and actions** — what was fixed (exact files changed), what remains open.
5. **Baseline checks** — commands run + results; pre-existing failures explicitly
   labeled PRE-EXISTING so later regressions can be distinguished.

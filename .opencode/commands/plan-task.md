---
description: "Turn a goal into scope, dependencies, acceptance criteria, verification plan, risks, and an ordered execution plan — without implementing."
agent: ape-builder
---

## Purpose

Convert a stated goal into an implementation-ready plan: bounded scope,
dependencies, measurable acceptance criteria, a verification plan, risks, and an
ordered execution sequence. Planning only — implementation happens later via
`/implement`.

## Expected inputs

- `$ARGUMENTS` — the goal in one or more sentences. May reference a spec section
  (e.g. `G3 recovery proposals`), an entity (`WorkSession logging`), or a task
  file (e.g. `tasks/APE-DISC-001.md`). Empty means ask nothing and plan the
  highest-value next increment from the roadmap.

## Allowed actions

- Read-only inspection: master spec, docs, repository tree, existing tests,
  read-only git commands.
- Write/update only a plan artifact (a task file under `tasks/` or a plan
  section in the response). No source code, test, or spec changes.

## Stop conditions

- Stop before implementation: no edits to source code or tests; only the plan
  artifact may be written.
- Mandatory approval boundaries: no push, no deploy/publish, no paid services,
  no secret exposure, no destructive data operations.
- If the goal hides a spec conflict, resolve it per the contract's
  source-of-truth order, log the decision in the plan, and continue — do not ask
  the Product Owner to resolve routine ambiguity.

## Output format

1. **Scope** — in scope / out of scope (with roadmap disposition for deferred items).
2. **Dependencies & inputs** — required files, decisions, environment facts.
3. **Acceptance criteria** — measurable, one per requirement; each names its
   planned verification.
4. **Verification plan** — exact commands/checks to be run during `/verify`.
5. **Risks & mitigations** — including hard-constraint (H1–H11), data-integrity,
   and accessibility risks where relevant.
6. **Ordered execution steps** — small bounded increments, each independently
   verifiable.
7. **Open decisions** — with recommended defaults and rationale (never
   open-ended questions to the Product Owner).

---
description: "Execute one bounded APE task continuously through implementation, checks, repair, and evidence reporting."
agent: ape-builder
---

## Purpose

Run the full autonomous execution loop for ONE bounded task — inspect →
acceptance criteria → implement → run checks → diagnose/fix → diff review →
traceability — without stopping for routine approval, then report evidence.

## Expected inputs

- `$ARGUMENTS` — the task statement, e.g. `implement Task CRUD endpoint with
  owner-scoped authorization`, or a plan step reference from `/plan-task`. May
  include `--task tasks/<file>` to consume a stored plan. The task must be
  bounded: one coherent, independently verifiable increment. If it is larger,
  implement the first coherent vertical slice and state what remains.

## Allowed actions

- Create and edit files within the workspace needed for the task.
- Run tests, lint, typecheck, and build; run safe read-only git commands.
- Apply safe in-scope defect fixes discovered while testing.
- Read `.env.example` templates; never read or write real `.env` secrets.

## Stop conditions

- Stop when the task's acceptance criteria are met AND verified, or when a
  mandatory approval boundary is hit: no push, no deploy/publish, no paid
  services, no secret exposure, no destructive data operations, no overwriting
  unrelated work.
- Never weaken or delete tests to get green; fixing a factually wrong test is
  allowed only with a cited spec clause.
- On a genuine blocker: investigate alternatives first, then report the exact
  blocked action, evidence, risk, and recommendation — and continue other safe
  work.
- On interruption or context limit: save a resumable checkpoint (task file with
  exact state and next step) before stopping.

## Output format

Final evidence report (required):

1. **Outcome** — actual state in one paragraph.
2. **Acceptance criteria** — PASS / FAIL / BLOCKED / NOT VERIFIED with evidence.
3. **Commands run** — exact commands in order, with results.
4. **Files changed** — paths with one-line reasons.
5. **Diff review notes** — unrelated edits, secrets, integration, UX states.
6. **Traceability** — requirement → test → observed result.
7. **Remaining risks & next checkpoint** — limitations and the recommended next
   increment.

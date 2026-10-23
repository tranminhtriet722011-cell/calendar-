---
description: "Assess release readiness with evidence — without deploying, publishing, pushing, or incurring any cost."
agent: ape-builder
---

## Purpose

Produce an evidence-based release-readiness assessment for the current increment
or milestone: run or locate evidence for every gate, classify each gate, and
list blockers and required approvals. This command NEVER performs the release
itself.

## Expected inputs

- `$ARGUMENTS` — optional target, e.g. `G3 vertical slice`, `v0.2.0-alpha`, or
  a milestone from the spec roadmap. Empty means assess the current working-tree
  increment.

## Allowed actions

- Read-only repository/environment inspection; read-only git commands.
- Run local checks that assess gates: tests, lint, typecheck, build, available
  security/dependency checks, accessibility smoke checks.
- Compile the readiness report in chat (write a report file only if explicitly
  requested in `$ARGUMENTS`).

## Forbidden actions (explicit — stop any of these and request approval)

- Deploy, publish, or release anything.
- Push to any Git remote.
- Create paid services, billable infrastructure, or payment methods.
- Expose secrets, private code, or personal data to any external party.
- Destructive data operations or disabling security/privacy controls.

## Stop conditions

- Assessment complete → stop. Never continue from assessment into an actual
  release in the same run.
- If a gate cannot be checked without a forbidden action or unavailable
  credentials, classify it BLOCKED or NOT VERIFIED with evidence — do not fake,
  skip silently, or attempt a workaround.
- Mandatory approval boundaries apply throughout: no push, no deploy, no paid
  services, no secret exposure, no destructive data operations.

## Output format

1. **Gate checklist** — one row per gate from the contract's definition of done
   plus the spec's release gates (security/privacy review, backup/restore test,
   no hard-constraint violations in the acceptance suite, timezone/recurrence
   data-model correctness, accessibility and mobile smoke, cost cap, incident
   path, owner sign-off):

   | Gate | Status (PASS/FAIL/BLOCKED/NOT VERIFIED) | Evidence (command/artifact) |

2. **Acceptance traceability summary** — counts of PASS/FAIL/BLOCKED/NOT VERIFIED.
3. **Blockers** — what must be fixed or approved before release.
4. **Required approvals** — exactly which approval gates the Product Owner must clear.
5. **Verdict** — READY / NOT READY for a given target, with the distinction
   between "ready for local handoff" and "ready for public release".

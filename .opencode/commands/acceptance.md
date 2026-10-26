---
description: "Verify a built APE increment end to end on a fresh database — main journeys, persistence, error/constraint/undo/audit flows, offline behaviour and API security probes — and report PASS/FAIL/BLOCKED/NOT VERIFIED evidence without fixing anything."
agent: ape-builder
---

## Purpose

Black-box acceptance verification of the current increment (or the scope in
`$ARGUMENTS`): run the gate, launch the built artifact on a throwaway
database, drive the product the way a user would, probe the edges, and produce
the evidence table. Follows the `acceptance-verification` skill. Defects are
reported with reproduction steps, not fixed here — fixing is a separate
`/implement` increment followed by re-verification with this command.

## Expected inputs

- `$ARGUMENTS` — optional scope: a task/milestone id (e.g. `APE-ACCEPT-002`)
  and optional focus keywords such as `persistence`, `security`, `errors`,
  `calendar`, `habits`, `offline`, `a11y`. Empty means the full core journey.

## Allowed actions

- Run the automated gate and build (`npm run check` or its parts).
- Launch the built server with `APE_PORT` and `APE_DB_FILE` pointed at a
  TEMP database (never the real `data/ape.db`); stop it afterwards.
- Drive UI flows with browser tooling when available; otherwise probe the API
  with read-only or test-user requests and state the reduced coverage.
- Read any workspace file except secrets (`.env.example` templates only);
  read-only git commands to record the tested commit.
- Write the acceptance report to `docs/reports/<TASK-ID>-REPORT.md` when the
  task id is known; otherwise report in chat only.

## Stop conditions

- Mandatory approval boundaries: no push, no deploy/publish, no paid
  services, no secret exposure, no destructive data operations. The temporary
  database may be deleted; the real database and user data are never touched.
- Never modify product code, tests, or configuration from this command;
  findings are reported for `/implement` so acceptance evidence stays
  independent of the fix.
- Stop when every in-scope flow has a final status; any flow that could not
  be driven is NOT VERIFIED with a concrete manual verification step.

## Output format

1. **Artifact under test** — commit id, build command, launch command,
   database path and port.
2. **Flow & gate table** — flow/gate | status (PASS/FAIL/BLOCKED/
   NOT VERIFIED) | evidence (command output or observed response).
3. **Defects found** — reproduction steps, impact, suggested fix; each routed
   to `/implement` with a required regression test.
4. **Security probes** — probe | expected | observed | status.
5. **Residual risks & limitations** — what was not verified, why, and the
   safe next step.

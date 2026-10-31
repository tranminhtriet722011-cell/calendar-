# Acceptance probes (APE-ACCEPT-002 / APE-ACCEPT-FOLLOWUP-001 / APE-BATCH-003 / APE-BATCH-004)

Black-box probes run against the BUILT artifact on a throwaway database. They never touch the
developer's real `data/ape.db`. Server under test:

```powershell
npm run build
$env:APE_PORT = 8788
$env:APE_DB_FILE = "$env:TEMP\ape-accept002-new.db"   # fresh file = fresh database
node dist/server.mjs
```

| Script | What it proves | Expected |
|---|---|---|
| `title-probe.mjs` | ACC-01 on all 5 title-bearing PATCH routes + the AT33 during-pause check on the built artifact (top-level `// --- AT33 on the built artifact ---` block) | 35/35 PASS |
| `at33-boundary.mjs` | Deterministic pause-window edges read straight from the SQLite file: `startedAt-1` counted, `startedAt`/`endedAt-1` excluded, `endedAt` counted (half-open fix), open window excludes `now` | 10/10 PASS |
| `at33-loop.mjs` | 40 iterations of pause→check-in; dumps raw `habit_pauses`/`habit_checkins` rows on any anomaly | 40/40 PASS |
| `settings-clock-probe.mjs` | D-038 strict clocks (52 invalid shapes → 400 naming the field, byte-identical stored settings, no partial write) + D-039 window ordering (inverted/equal → 400 naming the end field, merged-pair validation) + D-040 strict `graceMinutes` (11 invalid shapes → 400, 0–120 bounds, rounding, `null` keeps) | 18/18 PASS |
| `security-probe.mjs` | Unauth 401, foreign/unknown ID 404 with an identical oracle, foreign PATCH writes nothing, export carries no credentials | 8/8 PASS |
| `persistence.mjs snapshot` / `compare` | Stop → restart on the same DB: **8** fact families byte-identical (incl. `settings` and `workSessions`, added in APE-BATCH-003), request-time envelopes normalized, old session still valid | `PERSISTENCE PASS: all 8 fact families`, old session 200 |
| `viewport-320-probe.mjs` | Real 320×640 device emulation over the Chrome DevTools Protocol: each of the 6 views must render its expected `h1` and have `document.scrollWidth <= 320`; also reports clipped text and tap targets < 24 px (screenshots + `results.json` in the output dir) | `SUMMARY: 6/6 views have scrollWidth <= 320`, exit 0 |
| `ui-journey.mjs` (APE-BATCH-004) | Full UI journey driven through real headless Chrome (CDP) on a fresh temp DB + fresh throwaway user — registers through the auth gate, then drives Today/Tasks/Goals/Calendar/Habits/Activity: quick-add, estimate/due edit, plan→3 proposals, infeasible shortfall with named reasons, apply/undo/double-undo-withdrawn, recovery, log+complete, two-tab stale-edit `role="alert"`, E3 illegal-transition `role="alert"`, locked-event→overlap 409→two-step override→audit, habit 0→1→2, offline error+retry + single-origin. **Flows 19–27** drive the Settings screen: labelled controls + 7-day fieldset + natural tab order, a valid save read back after a full reload, five refused input classes (empty clock, inverted window, grace out of range, no working day, unknown zone) surfaced as `role="alert"` naming the field, proof that none of the refusals wrote anything, and the data-export control. **Flows 28–30** drive event move/resize through labelled start/end fields: a plain save read back after reload, a locked-event 409 → override button disabled until acknowledged → override applied and audited as `schedule.exception`, and protected rest (H5) refused outright with no override offered and the stored times unchanged after a reload. Drives the interface (clicks/types/DOM), not raw HTTP | `SUMMARY: 31/31 UI journey flows PASS`, exit 0 |

Run (server must be listening):

```powershell
node scripts/acceptance/title-probe.mjs
node scripts/acceptance/at33-boundary.mjs
node scripts/acceptance/at33-loop.mjs
node scripts/acceptance/settings-clock-probe.mjs
node scripts/acceptance/security-probe.mjs
node scripts/acceptance/persistence.mjs snapshot   # before restart
# ... stop the server, restart it on the same APE_DB_FILE ...
node scripts/acceptance/persistence.mjs compare    # after restart
node scripts/acceptance/viewport-320-probe.mjs     # needs local Chrome, exit 1 on any view > 320 px
node scripts/acceptance/ui-journey.mjs             # needs local Chrome; drives the UI over CDP, exit 1 on any flow FAIL
```

Environment overrides: `APE_BASE` (default `http://127.0.0.1:8788`), `APE_DB_FILE` (default
`%TEMP%\ape-accept002-new.db`), `APE_PERSIST_FILE` (snapshot path), `APE_PROBE_USER` /
`APE_PROBE_PASS` (probe credentials — any registered test user; use throwaway values). The
viewport probe additionally accepts `APE_CHROME` (Chrome/Chromium path, autodetected otherwise),
`APE_320_OUT` (screenshot/output directory) and `APE_CDP_PORT` (default 9333). The UI journey
accepts `APE_CHROME` (autodetected), `APE_CDP_PORT` (default 9444 — use a different port from the
viewport probe) and `APE_UI_OUT` (output dir for `results.json`, default
`%TEMP%\ape-ui-journey`); it registers its own throwaway user, so it needs no `APE_PROBE_USER`.

# Acceptance probes (APE-ACCEPT-002)

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
| `title-probe.mjs` | ACC-01 on all 5 title-bearing PATCH routes + AT33 on the built artifact | 35/35 PASS |
| `at33-boundary.mjs` | Deterministic pause-window edges read straight from the SQLite file: `startedAt-1` counted, `startedAt`/`endedAt-1` excluded, `endedAt` counted (half-open fix), open window excludes `now` | 10/10 PASS |
| `at33-loop.mjs` | 40 iterations of pause→check-in; dumps raw `habit_pauses`/`habit_checkins` rows on any anomaly | 40/40 PASS |
| `persistence.mjs snapshot` / `compare` | Stop → restart on the same DB: facts byte-identical (request-time envelopes normalized), old session still valid | `PERSISTENCE PASS`, old session 200 |

Run (server must be listening):

```powershell
node scripts/acceptance/title-probe.mjs
node scripts/acceptance/at33-boundary.mjs
node scripts/acceptance/at33-loop.mjs
node scripts/acceptance/persistence.mjs snapshot   # before restart
# ... stop the server, restart it on the same APE_DB_FILE ...
node scripts/acceptance/persistence.mjs compare    # after restart
```

Environment overrides: `APE_BASE` (default `http://127.0.0.1:8788`), `APE_DB_FILE` (default
`%TEMP%\ape-accept002-new.db`), `APE_PERSIST_FILE` (snapshot path), `APE_PROBE_USER` /
`APE_PROBE_PASS` (persistence probe credentials — any registered test user).

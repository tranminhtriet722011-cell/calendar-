# AI Planning Ecosystem (APE)

A local-first planner that turns a goal into a realistic schedule, keeps execution honest, and
recovers when plans change. The core journey — **Goal → Plan → Execute → Recover** — works with no
AI provider, no external service and no paid account: every "AI" behaviour in this increment is a
deterministic in-process proposal engine whose output is a *suggestion* that the user must preview
and approve (Decision `D-003`).

**Status of this repository:** one verified vertical slice (see `docs/spec/APE_V1_1_TRACEABILITY.md`
for per-acceptance-criterion evidence). Nothing here is deployed or published; no remote push, no
charges, no telemetry.

---

## 1. Requirements

| Requirement | Version / note |
|---|---|
| Node.js | **24 or newer** — the server uses the built-in `node:sqlite` driver |
| npm | Ships with Node (only `npm install` is needed) |
| OS | Developed and verified on Windows (PowerShell); the code is platform independent |
| Network | Not required at runtime. Install time needs registry access; run time never does |

No database server, no Docker, no API key, no `.env` value is required to run the app.

## 2. Quick start

```powershell
# 1) install dependencies (already installed in this workspace)
npm install

# 2) run everything: API (127.0.0.1:8787) + web client (127.0.0.1:5173)
npm run dev
```

Open <http://127.0.0.1:5173>, choose **Register**, and create a local account (username +
password). Everything you enter is stored in `data/ape.db`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | API with hot reload **and** the Vite client together (`scripts/dev.mjs`) |
| `npm run dev:server` | API only (tsx watch) |
| `npm run dev:client` | Vite client only (proxies `/api` to the API) |
| `npm run typecheck` | `tsc --noEmit` over server, client and tests |
| `npm test` | Vitest: domain unit tests + real-HTTP integration tests |
| `npm run build` | typecheck → `vite build` (to `dist/client`) → bundle the server to `dist/server.mjs` |
| `npm run check` | typecheck + tests + build — the gate used for release readiness |
| `npm start` | Run the built app (serves API **and** the built client) on port 8787 |

### Configuration

All optional; defaults work out of the box. Values are read from the **process environment**
(the app does not parse `.env` itself — export the variables in your shell before starting):

| Variable | Default | Meaning |
|---|---|---|
| `APE_PORT` | `8787` | API/HTTP port. The server binds `127.0.0.1` only. |
| `APE_DB_FILE` | `./data/ape.db` | SQLite database file (git-ignored, created on first run) |
| `APE_STATIC` | `./dist/client` | Built client to serve; if absent, the API still works and the UI is served by `npm run dev` |

`.env.example` is the documented template. It contains **no secrets** and must never be filled with
real credentials — this application has no credential configuration by design.

## 3. What works today

| Journey | Behaviour |
|---|---|
| **Capture** | Quick add with a title only → Inbox task, no invented time slot (`AT01`). Estimates, due dates, priority, subtasks and goal links are explicit. |
| **Plan** | `POST /api/schedule/plan` returns up to three revision-pinned proposals (`minimal`, `deadline`, `balanced`) with placement preview, impact (moved/added sessions, at-risk tasks) and an explicit feasibility report with shortfall + concrete options when the request cannot be satisfied (`AT16`, `AT26`, `AT27`). |
| **Commit** | Nothing is written until the user approves. Commit re-validates hard constraints and base revisions, honours an idempotency key, and writes an audit entry (`AT29`, `AT40`, `AT41`). |
| **Execute** | Manual blocks, timer/manual effort logs, late-start / overdue / overtime / at-risk flags, early completion that releases only the task's own future sessions (`AT21`–`AT23`, `AT25`). |
| **Recover** | "Need more time" re-plans around fixed events and existing sessions, showing what would move before the user approves (`AT24`). Undo restores a committed change when the schedule is still compatible, and refuses with a conflict preview when it is not (`AT30`, `AT31`). |
| **Goals & habits** | Goal progress comes from explicit outcome units, never from task completion (`AT06`); habit period attainment with pause windows and duplicate-check-in protection (`AT32`–`AT35`). |
| **Safety** | Owner-scoped authorization (foreign entity ids → `404`; foreign reference fields → identical `400`s, never an existence oracle), locked/fixed events are never auto-moved, protected rest is never scheduled over, manual overrides need explicit confirmation and are audited (`AT09`–`AT13`, `AT42`). |
| **Data rights** | `GET /api/export` returns the owner's data with no credential material (`AT44`). |

Scope decisions, including what is deliberately deferred (external calendar sync, offline queue,
native Android, LLM drafts, monthly habits), are recorded in `docs/DECISION_LOG.md` (D-006).

## 4. Repository layout

```text
server/                 Express 5 + node:sqlite API (domain / persistence / routes)
  domain/               pure, testable logic: time math, scheduler, task state
  routes/               auth, tasks, calendar, planning (goals/habits), schedule, activity
client/                 React 19 + Vite single-page client (accessible, responsive)
tests/                  Vitest: domain unit tests + real-HTTP integration tests
docs/                   master spec, decision log, traceability matrix, implementation spec
.opencode/              project-local agents, commands and skills
opencode.json           OpenCode V2 configuration (permissions, default agent)
scripts/dev.mjs         runs API and client together for development
data/                   SQLite database (git-ignored)
```

## 5. Quality gates and evidence

```powershell
npm run check     # typecheck + full test suite + production build
```

Acceptance criteria are traced to executed tests in
`docs/spec/APE_V1_1_TRACEABILITY.md`; a status may only become `PASS` by citing a command that was
actually run. Product and engineering decisions are in `docs/DECISION_LOG.md`, and the
implementation-ready specification is `docs/spec/APE_V1_1_IMPLEMENTATION_SPEC.md`.

## 6. OpenCode workspace

The repository ships a project-local OpenCode setup:

- **Agents:** `.opencode/agents/ape-builder.md` (default agent) and `.opencode/agents/ape-reviewer.md`
  (read-only reviewer).
- **Commands:** `/bootstrap`, `/plan-task`, `/implement`, `/verify`, `/review`, `/release-check`, `/audit`.
- **Skills:** discovery, spec-architecture, fullstack-implementation, test-repair, independent-review,
  security-privacy, ui-ux-accessibility, release-readiness.
- **Permissions** (`opencode.json`): routine work is allowed; `git push`, publishing, paid/deploy
  providers and credential-file access are denied; destructive git/shell operations and outbound
  requests ask first. Rule order matters — later rules win.

## 7. Security, privacy and cost

- Bearer tokens are opaque random values; passwords are hashed with scrypt and a per-user salt.
- Every query is scoped to the authenticated owner; foreign entity ids return `404`, not `403`.
  Reference fields a user can supply (`goalId`, `parentId`, `blockId`) return the same `400` whether
  the id is unknown or someone else's — responses never reveal whether an id exists elsewhere.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, minimal
  `Permissions-Policy`.
- No outbound network calls at runtime, no analytics, no third-party fonts or CDNs, no paid services.
- AI-provider keys are never required, sent or stored. AI proposals are deterministic and suggest-only.

## 8. Known limitations

See the final section of `docs/spec/APE_V1_1_TRACEABILITY.md` (deferred register) and
`docs/DECISION_LOG.md`. Highlights: no external calendar sync, no offline queue/multi-device merge,
no backup-restore drill, monthly/complex habit metrics deferred, and the "AI" layer is a local rule
engine rather than a language model.

Deliberate, disclosed trade-offs of this increment (fuller detail in
`docs/spec/APE_V1_1_IMPLEMENTATION_SPEC.md` §11.1):

- The client keeps its session token in `localStorage` (small XSS surface: no third-party scripts,
  CDN or web fonts), and login has no rate limiting — acceptable because the server binds
  `127.0.0.1` only and passwords are scrypt-hashed.
- Undoing a manual work log deletes that logged entry itself (the log *is* the mistake being
  reversed); every other undo only releases, restores or flags.
- Goals and habits cannot be deleted yet; tasks archive (with cascade + undo) instead.
- Working hours, grace, soft rest and time zone are set through `PATCH /api/auth/settings` — the
  client has no settings screen yet, so the registration default (08:00–22:00, all days) applies
  unless changed via the API.
- Creating or moving an event over a locked/fixed item requires the server's `override` + `confirm`
  gate; the client's event form has no override control yet, so such attempts surface the honest
  `409` from the API.

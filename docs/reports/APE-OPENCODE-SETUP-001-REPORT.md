# APE-OPENCODE-SETUP-001 — OpenCode Workflow Components: Audit, Build & Report

- **Task:** APE-OPENCODE-SETUP-001 (tooling/process preparation only — no APE product feature work)
- **Date:** 2026-10-26
- **Environment:** Windows (PowerShell), OpenCode **v2.1.4** (Desktop app, CLI at `%APPDATA%\ai.opencode.desktop\cli\2.1.4-x64\opencode-cli.exe`)
- **Repository state during the task:** branch `main`; baseline commit `162e959`, then checkpoint commit `ebadcec` (WIP of the separate APE-ACCEPT-002 task, committed first so the two tasks' file sets stay separable), then this task's commits.
- **Final status:** **COMPLETE** — Phases A–E executed; 2 items honestly classified NOT VERIFIED (see §E).

---

## A. Overview

### Completed
- **Phase A (audit)** — OpenCode version/config format, AGENTS.md, all skills, all commands, agents, permissions, MCP/plugins/LSP, and real tool capabilities were inspected as they actually are, not assumed. Discovery of every component was verified empirically against the running OpenCode (not by file existence alone).
- **Phase B (build)** — 2 skills and 2 commands created for the two capability groups that had no coverage (acceptance verification & evidence; consolidated final reporting). AGENTS.md gained a §8 tooling section so every future session works the same way.
- **Phase C (autonomy)** — No permission changes: evidence shows the current gates do not impede authorized autonomous work (§D).
- **Phase D (test & self-repair)** — 14 checks run (§E); frontmatter/structure issues would surface as discovery failures; all new components verified discovered and hot-reloaded.
- **Phase E (this report)** — written to `docs/reports/APE-OPENCODE-SETUP-001-REPORT.md` (location matches the `final-report` skill convention; `tasks/` root would have mixed reports with plans).

### Not completed / NOT VERIFIED
- End-to-end **execution** of a custom command (slash-expansion + agent-binding at run time) was not executed: the only safe way to test is a real TUI invocation, which spawns a live agent session that would write artifacts out of context. Manual step given in §E.
- The `opencode` command is **not on the shell PATH** in this environment (Desktop-app install); all verification used the explicit CLI path. A PATH entry would be a convenience, not a blocker — no evidence it hindered anything.

### Environment limits affecting results
- The shared API server answers project-scoped queries only when given `?location[directory]=<repo>`; without it, only global/builtin components list (this initially looked like a discovery failure and was resolved — see §E test 4/6).
- The API's `Command.Info` schema exposes only `name`/`description`, so command→agent binding cannot be observed through the API.

---

## B. Skills catalog (10 project + 2 builtin)

Structure per skill: name & path · status · purpose/activation · capabilities · overlaps · dependencies · verification · recommendation.

### 1. `discovery` — `.opencode/skills/discovery/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** load on session bootstrap or pre-implementation discovery; read-only environment/repository inventory with VERIFIED/UNKNOWN facts and a PRE-EXISTING baseline.
- **Capabilities:** group 1 (analysis/planning groundwork); establishes baseline check results before changes.
- **Overlaps:** shares its baseline concept with `/bootstrap`; complementary in practice (skill = knowledge, command = driver, and `/bootstrap` additionally validates `.opencode/` artifacts and may fix setup gaps, which discovery never does).
- **Dependencies:** referenced by `test-repair` (baseline-first).
- **Verification:** listed by `/api/skill?location[directory]=<repo>` (path resolved to `.opencode/skills/discovery/SKILL.md`); description loaded into this session's skill index at start.
- **Recommendation:** **keep** (optional low-priority edit: have `/bootstrap`'s body name this skill — see §F).

### 2. `spec-architecture` — `.opencode/skills/spec-architecture/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** reconciling conflicting requirements, versioning the spec, ADRs, decision-log discipline.
- **Capabilities:** group 1 (requirements analysis → implementation-ready spec).
- **Overlaps:** none.
- **Dependencies:** contract/master spec files under `docs/`.
- **Verification:** discovered via `/api/skill` with resolved path; description present in session skill index.
- **Recommendation:** **keep**.

### 3. `fullstack-implementation` — `.opencode/skills/fullstack-implementation/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** building APE application code across the layered monolith with invariants H1–H11, owner/revision/audit, suggest-only AI.
- **Capabilities:** group 2 (implementation).
- **Overlaps:** none; it is the skill body behind `/implement`.
- **Dependencies:** `ape-builder` agent (which cites the same invariants), spec-architecture outputs.
- **Verification:** discovered via `/api/skill`; historically loaded/used in prior increments.
- **Recommendation:** **keep**.

### 4. `test-repair` — `.opencode/skills/test-repair/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** any failing check — root-cause diagnosis, NEW/PRE-EXISTING/FLAKY/BLOCKED classification, regression test required per fix, never weaken tests.
- **Capabilities:** group 3 (test, diagnose, self-repair, rerun).
- **Overlaps:** conceptually part of `/verify`; the command body already mirrors its rules (accepted duplication of short rule lists — both must stand alone).
- **Dependencies:** `discovery` (baseline).
- **Verification:** discovered via `/api/skill`; exercised in prior increments.
- **Recommendation:** **keep**.

### 5. `independent-review` — `.opencode/skills/independent-review/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** unbiased second pass over a diff/area using ape-reviewer standards (severity-ordered, file:line evidence, NEW vs PRE-EXISTING).
- **Capabilities:** group 4 (review/regression).
- **Overlaps:** mirrors the `ape-reviewer` agent's own review checklist — by design: skill = how to review (any executor), agent = who reviews (read-only sandbox). Both are referenced by `/review`.
- **Dependencies:** `ape-reviewer` agent.
- **Verification:** discovered via `/api/skill`; agent verified via `debug agents`.
- **Recommendation:** **keep both** (deleting either would remove one half of the pair).

### 6. `security-privacy` — `.opencode/skills/security-privacy/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** auth/authorization/data-write/secret/AI-flow changes; owner-scoping, consent, prompt-injection awareness.
- **Capabilities:** group 4 (security dimension).
- **Overlaps:** the reviewer agent contains a condensed version of the same checks (dimension list vs full procedure) — acceptable; skill is the deep procedure.
- **Dependencies:** hard constraints H2/H8 from the spec.
- **Verification:** discovered via `/api/skill`.
- **Recommendation:** **keep**.

### 7. `ui-ux-accessibility` — `.opencode/skills/ui-ux-accessibility/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** WCAG 2.2 AA target for any screen/interaction change.
- **Capabilities:** accessibility & responsive UX checks, "targeted and tested to date" honesty rule.
- **Overlaps:** none.
- **Dependencies:** browser tooling for real measurement (when unavailable → NOT VERIFIED with manual step).
- **Verification:** discovered via `/api/skill`.
- **Recommendation:** **keep**.

### 8. `release-readiness` — `.opencode/skills/release-readiness/SKILL.md`
- **Status:** pre-existing (untouched).
- **Purpose/activation:** evidence-based release-gate assessment; never deploys/pushes/pays.
- **Capabilities:** group 5 partially (gate assessment side of acceptance).
- **Overlaps:** `release-check` command body mirrors it (accepted); vs the new `final-report` — readiness decides *ready/not ready*, final-report assembles *what happened*; they link, not duplicate.
- **Dependencies:** contract definition-of-done + spec release gates.
- **Verification:** discovered via `/api/skill`; loaded and executed in this session during APE-ACCEPT-002.
- **Recommendation:** **keep**.

### 9. `acceptance-verification` — `.opencode/skills/acceptance-verification/SKILL.md`
- **Status:** **NEW this task.**
- **Purpose/activation:** verify a *built* product end-to-end: fresh-DB launch, main journeys, persistence across restart, error/constraint/undo/audit flows, offline check, API security probes, requirement→evidence matrix. Trigger description asks for PASS/FAIL/BLOCKED/NOT VERIFIED backed by executed commands.
- **Capabilities:** group 5 (acceptance evidence collection) — previously uncovered by any component; APE-ACCEPT-002 had to improvise this protocol ad hoc (browser gotchas now captured so they are reusable).
- **Overlaps:** feeds `release-readiness` (provides its evidence) and `/acceptance` (its driver command); no duplicated rules.
- **Dependencies:** built artifact (`npm run check`), browser tooling when available; pairs with `/acceptance`.
- **Verification:** **discovered** — appears in `/api/skill?location[directory]=<repo>` output as `acceptance-verification` with resolved path, and OpenCode hot-loaded it into this session's skill index immediately after the file was saved (system update event observed).
- **Recommendation:** **keep**; pilot it on the resumed APE-ACCEPT-002 final verification.

### 10. `final-report` — `.opencode/skills/final-report/SKILL.md`
- **Status:** **NEW this task.**
- **Purpose/activation:** assemble the single consolidated final report per AGENTS.md §7 into `docs/reports/<TASK-ID>-REPORT.md`; status taxonomies (PASS/FAIL/BLOCKED/NOT VERIFIED, VERIFIED/PROPOSED/UNKNOWN, PRE-EXISTING/NEW, FLAKY).
- **Capabilities:** group 6 (final reporting, work status, open issues, risks) — previously only implicit across AGENTS.md §7 and per-command output formats, re-invented each task.
- **Overlaps:** name-adjacent to the *builtin* `report` skill (which files **GitHub issues for OpenCode itself** — different purpose entirely). Kept: builtins cannot be removed per project; activation descriptions differ clearly.
- **Dependencies:** AGENTS.md §7, `docs/reports/`, traceability/decision log.
- **Verification:** **discovered** — listed by `/api/skill` as `final-report`, hot-loaded into the session index (system update event observed). This report itself is the first artifact produced under its convention.
- **Recommendation:** **keep**.

### Builtin skills (context)
- `opencode` (`/builtin/opencode.md`) — OpenCode's own documentation index skill; loaded this task and used as the source-of-truth index for V2 formats. **Keep** (builtin).
- `report` (`/builtin/report.md`) — file GitHub issues about OpenCode. **Keep** (builtin; unrelated to project reporting despite the name).

---

## C. Commands catalog (9 project + 2 builtin)

### Pre-existing (7) — all format-verified against the V2 commands documentation and discovery-verified

| # | Command & path | Invocation / purpose | Behavior, skills used | Permissions & limits | Test result | Recommendation |
|---|---|---|---|---|---|---|
| 1 | `/bootstrap` `.opencode/commands/bootstrap.md` | `/bootstrap [focus]` — environment, git state, OpenCode-config validity baseline; may create/fix `.opencode/**` setup artifacts | ape-builder; read-only inspection + narrowly scoped setup fixes | read any file except secrets; allowlisted read-only shell; no push/deploy/destructive; never overwrite unrelated dirty work | discovered via API (test 6); frontmatter parsed (valid V2 fields `description`/`agent`) | **keep** |
| 2 | `/plan-task` `.opencode/commands/plan-task.md` | `/plan-task <goal>` — scope, dependencies, measurable ACs, verification plan, risks, ordered steps; planning only | ape-builder; reads spec/docs; writes only a plan artifact under `tasks/` | no source/test edits; approval boundaries cited; no open-ended PO questions | discovered via API; `tasks/` target dir verified to exist | **keep** |
| 3 | `/implement` `.opencode/commands/implement.md` | `/implement <task>` — full execution loop for ONE bounded increment | ape-builder; runs tests/lint/typecheck/build; in-scope fixes; cites `fullstack-implementation`/`test-repair` behaviors | no push/deploy/paid/secrets/destructive; never weaken tests; saves checkpoint on interruption | discovered via API | **keep** |
| 4 | `/verify` `.opencode/commands/verify.md` | `/verify <area>` — run checks, classify PASS/FAIL/BLOCKED/NOT VERIFIED, repair in-scope, rerun | ape-builder; targeted → suite → typecheck → build; PRE-EXISTING vs NEW via git | FLAKY/BLOCKED labeled rather than looped on; no test weakening | discovered via API; description echoes correctly | **keep** |
| 5 | `/review` `.opencode/commands/review.md` | `/review <diff\|area>` — independent read-only second pass | **subagent: true** → runs `ape-reviewer` in a background child session; reports severity-ordered findings, verdict APPROVE/FIX-FIRST/BLOCK | reviewer cannot edit/fetch/undocumented-shell; no fixes inside the command | discovered via API; **overrides the builtin `/review`** ("review changes [commit\|branch\|pr]") in this project — documented V2 precedence behavior, intended | **keep** (know that the builtin variant is replaced here) |
| 6 | `/audit` `.opencode/commands/audit.md` | `/audit [focus]` — read-only repository & environment hygiene/risk audit | subagent → `ape-reviewer`; chat-only findings (AUD-nnn) | writes nothing, not even a report file; unverifiable checks → NOT VERIFIED + manual step | discovered via API | **keep** (distinct from `/review`: inventory/risk vs diff/code review) |
| 7 | `/release-check` `.opencode/commands/release-check.md` | `/release-check [target]` — evidence-based readiness gates | ape-builder; runs local checks; follows `release-readiness` | explicit forbidden list: deploy/push/paid/secrets/destructive; assessment never continues into release | discovered via API | **keep** |

### New this task (2)

| # | Command & path | Invocation / purpose | Behavior, skills used | Permissions & limits | Test result | Recommendation |
|---|---|---|---|---|---|---|
| 8 | `/acceptance` `.opencode/commands/acceptance.md` | `/acceptance [TASK-ID] [focus…]` — black-box verification of a built increment on a temp DB: journeys, persistence, error/constraint/undo/audit, offline, API security probes | ape-builder; follows the **`acceptance-verification`** skill; writes `docs/reports/<TASK-ID>-REPORT.md` when the id is known | **never fixes product code** (defects → `/implement` with required regression test); temp `APE_DB_FILE` only, real `data/ape.db` never touched; standard approval boundaries | **discovered** via `/api/command?location[directory]=<repo>` — name + full description echoed (frontmatter parsed); execution semantics NOT VERIFIED (§E test 13) | **keep** |
| 9 | `/handoff` `.opencode/commands/handoff.md` | `/handoff [TASK-ID] [--chat-only]` — assemble ONE consolidated final report | ape-builder; follows the **`final-report`** skill; writes only `docs/reports/<TASK-ID>-REPORT.md` (+ dependent traceability/decision-log updates) | no push/deploy/paid/secrets/destructive; **no new implementation while reporting** — unfinished work is reported, never silently completed | **discovered** via API with full description; execution semantics NOT VERIFIED (§E test 13) | **keep** |

### Builtin commands (context)
- `/init` ("guided AGENTS.md setup") — builtin; would regenerate/extend AGENTS.md interactively. **Note:** avoid running it here — it could rewrite the project-tuned `AGENTS.md`. Recommendation: leave unused (kept, low risk).
- `/review` (builtin, "review changes [commit|branch|pr]") — **intentionally overridden** by the project's `/review` inside this repo (project sources take precedence per V2 docs).

---

## D. Configuration and permissions

### Files changed by THIS task
| File | Change |
|---|---|
| `.opencode/skills/acceptance-verification/SKILL.md` | new — acceptance verification protocol (group 5) |
| `.opencode/skills/final-report/SKILL.md` | new — consolidated final-report assembly (group 6) |
| `.opencode/commands/acceptance.md` | new — `/acceptance` driver command |
| `.opencode/commands/handoff.md` | new — `/handoff` driver command |
| `AGENTS.md` | modified — appended §8 "Tooling — OpenCode Components" (component inventory, conventions, post-edit verification rule) |
| `docs/reports/APE-OPENCODE-SETUP-001-REPORT.md` | new — this report |

Repo-state note: before any edits, the in-flight APE-ACCEPT-002 work was preserved as local checkpoint commit `ebadcec` (AGENTS.md §2 recovery checkpoint; contains no SETUP-001 changes), so this task's diff stands alone. **Nothing was pushed.**

### Permissions checked (no changes made — per task rule, change only with evidence of hindrance)
- **Observed working in this session (evidence = this task's own execution):** `read`/`edit`/`write`/`glob`/`grep` on workspace files; dozens of `shell` invocations (git add/commit/status/log, node/npm/npx, the OpenCode CLI itself, background shells); `skill` loading (project + builtin); `question`; `webfetch` (executed once after the configured `ask` gate); `subagent` (allowed in config; ape-reviewer available).
- **Gates confirmed still in force:** `git push *` → ask (per D-030 PO approval flow); `curl`/`Invoke-WebRequest`/`gh`/`webfetch`/`websearch` → ask; `external_directory` → ask; `npm publish`, `npm run deploy*`, and all deploy CLIs (vercel/netlify/flyctl/heroku/railway/aws/gcloud/az/docker push) → **deny**; `.env`/`.pem`/`.key`/`secrets/*` read+edit → **deny**; destructive git (reset/clean/checkout/branch -D/rm -rf/Remove-Item) → ask.
- **Effective merge verified:** `opencode debug agents` shows layered rules resolving with last-match-wins — builtin defaults → `opencode.json` → agent frontmatter; e.g. `ape-builder`'s `read *.env` ends **deny** (the builtin default `ask` is overridden), `.env.example` ends **allow**.
- **Conclusion:** no configuration currently blocks authorized autonomous work; the gates align with AGENTS.md §3 approval boundaries. **Zero permission lines were modified.** One benign observation: this session's shell ran without per-command prompts while every explicit deny above remained effective — friction-free for routine work, gated where it should be.

### Other configuration
- `opencode.json` — unchanged (schema `https://opencode.ai/config.json`, `default_agent: ape-builder`, watcher ignores `data/ dist/ node_modules/ coverage/`). Confirmed loaded via `opencode debug config`.
- **MCP:** `opencode mcp list` → "No MCP servers configured" — unchanged (no concrete need demonstrated).
- **Plugins:** `opencode plugin list` → "No plugins found" — unchanged.
- **LSP:** no custom `lsp` config; TypeScript checking runs via `npm run typecheck` (`tsc --noEmit`) — adequate for this repo; unchanged.
- **Global config:** `%USERPROFILE%\.config\opencode\` contains only `service.json` (no global overrides competing with the project config).

---

## E. Testing (Phase D)

| # | What was tested | Command / action | Result |
|---|---|---|---|
| 1 | OpenCode version & format era | `opencode-cli --version` | **PASS** — `opencode v2.1.4` (V2 → JSON config, `.opencode/commands/` plural layout confirmed correct per V2 docs) |
| 2 | Project config validity | `opencode debug config` | **PASS** — repo `opencode.json` listed as a config document |
| 3 | Agent discovery | `opencode debug agents` | **PASS** — 6 agents: `ape-builder` (primary) + `ape-reviewer` (subagent) with full system prompts, plus 4 builtins (`build`, `plan`, `explore`, `general`) |
| 4 | Project command discovery (baseline) | `opencode api get "/api/command?location[directory]=<repo>"` | **PASS** — all 7 project commands listed with their descriptions. (First attempt without `location` listed only builtins → diagnosed as missing project scope, not a defect) |
| 5 | Project skill discovery (baseline) | `opencode api get "/api/skill?location[directory]=<repo>"` | **PASS** — all 8 project skills with resolved `.opencode\skills\*\SKILL.md` paths + 2 builtins |
| 6 | NEW commands discovered | same as #4 after creating files | **PASS** — `/acceptance` and `/handoff` appear with full parsed descriptions (frontmatter syntax proven by the parser accepting it) |
| 7 | NEW skills discovered | same as #5 after creating files | **PASS** — 12 total ids: 10 project (incl. `acceptance-verification`, `final-report`) + 2 builtin |
| 8 | Hot reload of skills | save file → OpenCode event | **PASS** — harness received the system-update registering both new skills with exact descriptions, without any restart |
| 9 | Hot reload of AGENTS.md | edit → OpenCode event | **PASS** — harness received the updated instructions diff immediately |
| 10 | AGENTS.md content integrity | `Select-String` for `<`/`>` escapes + `Test-Path` on every referenced path | **PASS** — no HTML-escaped characters; all 7 referenced paths exist (`tasks/`, decision log, traceability, 4 new component files) |
| 11 | MCP / plugins / global config | `mcp list`, `plugin list`, config dir listing | **PASS** — none configured (by design), no global override files |
| 12 | Command→agent binding observability | `openapi.json` → `Command.Info` schema | **NOT VERIFIED via API** — schema has only `name`/`description`; the `agent`/`subagent` fields are valid V2 frontmatter (per the V2 commands doc fetched this task) but their runtime effect is not exposed by this endpoint |
| 13 | End-to-end command execution (slash expansion + child-session behavior) | not run | **NOT VERIFIED** — running `/acceptance` or `/handoff` outside a TUI would spawn a live agent session with no task context and write artifacts prematurely. **Manual step:** in the OpenCode TUI run `/handoff APE-OPENCODE-SETUP-001 --chat-only`; expected: an ape-builder prompt expanding to the command body and producing a chat-only report with no file writes |
| 14 | Permission non-blocking behavior | this session's own execution | **PASS (observed)** — read/edit/write/shell/skill/webfetch all exercised; explicit denies listed in §D remained in the effective rule set |

- **Errors found during testing and self-repaired:** initial false negatives from (a) missing `hidden: true` in my own file glob, (b) missing `location[directory]` API parameter, (c) PowerShell parsing of single-element JSON arrays. All three were test-harness issues, fixed in the test procedure and re-run — no product/tooling defect resulted.
- **Remaining errors in scope:** none. (The intermittent AT33 habit-pause test failure observed while finishing the *previous* task belongs to APE-ACCEPT-002, is out of scope here, and is preserved in checkpoint `ebadcec`'s message as a known open item.)
- **Components not verified:** items 12 and 13 above, with reasons and next steps.

---

## F. Recommendations for the Technical Lead

### Proposed final structure (no deletions — every candidate merge was evaluated, not predicted)

**Skills — 10, keep all:**
```
discovery · spec-architecture · fullstack-implementation · test-repair
independent-review · security-privacy · ui-ux-accessibility · release-readiness
acceptance-verification (new) · final-report (new)
```
Merge candidates evaluated and deliberately **not** applied:
1. `/bootstrap` body ↔ `discovery` skill — share a baseline core, but differ (`/bootstrap` validates/repairs `.opencode` setup; discovery is strictly read-only). *Suggested minimal edit (your call):* add one line to `/bootstrap` naming the `discovery` skill instead of duplicating its baseline wording.
2. `independent-review` skill ↔ `ape-reviewer` agent — a **pair**, not a duplicate (procedure vs sandboxed executor). Keep both; `/review` already wires them.
3. Builtin `report` skill ↔ new `final-report` — name collision risk only; purposes differ (GitHub issue vs project report). Keep; descriptions disambiguate.
4. `release-readiness` ↔ `final-report` — readiness verdict vs report assembly; linked, not merged.

**Commands — 9, keep all (each maps to a distinct workflow, each names its skill):**
```
/bootstrap → discovery          /plan-task → (planning rules)     /implement → fullstack-implementation + test-repair
/verify    → test-repair        /review, /audit → independent-review (+ security-privacy)
/release-check → release-readiness                                /acceptance → acceptance-verification (new)
/handoff  → final-report (new)
```

**Agents — 2, keep both.** Config/MCP/plugins — unchanged; re-evaluate only with a concrete need.

### Follow-ups (for the lead, none blocking)
- Run the §E test-13 manual step once to confirm command execution end-to-end.
- Consider adding the Desktop CLI directory to PATH for convenience.
- `/init` should stay unused (it may rewrite the project-tuned AGENTS.md).
- APE-ACCEPT-002 remains in progress separately (checkpoint `ebadcec`); its AT33 flake fix and final report are still due — the new `/acceptance` + `final-report` components were purpose-built to run that workflow next time.

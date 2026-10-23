# APE — UNIFIED AUTONOMOUS OPENCODE SETUP & PRODUCT EXECUTION CONTRACT

**Task ID:** APE-AUTO-001  
**Mode:** Large Task, Controlled Execution  
**Goal:** Set up a reusable autonomous OpenCode workflow, then use it to deliver the best verified APE product possible.  
**Approval model:** No routine user decisions or interim approvals. Stop only at mandatory risk boundaries or a genuine blocker; continue all safe, independent work.

---

## 1. Mission and expected outcome

Use the existing APE product materials—including the product description, Master Product Spec V1.0, and the supplied review/critique—as the basis for work. First establish a reliable, reusable OpenCode project workflow; then reconcile the APE specification, plan, implement, verify, repair, and independently review the product.

The Product Owner wants to state the desired outcome once and delegate ordinary product, technical, UX, implementation, and testing decisions to the agent. Do not ask the Product Owner to choose among routine alternatives. Make evidence-based decisions, document consequential choices, and keep moving.

The task has two connected workstreams:
1. **OpenCode operating system:** project instructions, safe permissions, agents, commands, and skills that make future work repeatable and autonomous.
2. **APE product delivery:** specification reconciliation through implementation and evidence-based verification.

Do not stop after writing documents or setting up configuration. Continue into product work when the setup is valid and the repository/environment permits it.

## 2. Source-of-truth and conflict resolution

Inspect all relevant available project files before changing anything. Use this priority order:

1. Explicit Product Owner requirements and hard constraints.
2. Latest approved product blueprint/specification and explicit acceptance criteria.
3. Existing repository decisions and architecture, where consistent with 1–2.
4. Supplied reviews/criticisms as evidence of issues to investigate—not automatic approval of every recommendation.
5. Agent judgment and external research where needed.

When documents conflict:
- Trace each conflicting requirement to its source.
- Prefer the higher-priority source above.
- If still ambiguous, choose the option that best preserves core product outcomes, security, user data, simplicity, reversibility, accessibility, and future flexibility.
- Record the resolution in a decision log; do not silently discard requirements or claim a decision was user-approved when it was not.
- Do not ask the user to resolve routine ambiguity. Make and document a reasonable choice.

## 3. Phase 0 — Safe discovery and baseline

Before creating or modifying files:
- Confirm the actual workspace/repository root, OpenCode version and available runtime where discoverable.
- Inspect Git branch/status/history and existing uncommitted changes.
- Inspect current `AGENTS.md`, `opencode.json`/other OpenCode configuration, `.opencode/` files, project instructions, package scripts, app structure, documentation, and tests.
- Identify which proposed setup files already exist and work; preserve and improve rather than duplicate.
- Establish baseline checks and distinguish existing failures from task-caused failures.
- Never overwrite unrelated user work or assume a clean repository without checking.
- If the workspace lacks a product repository, use the existing project materials to establish a suitable starting structure and document the rationale. Do not falsely report a repository or runtime that does not exist.

## 4. Phase 1 — Build a reusable OpenCode operating system

Create or improve the following project-local artifacts where supported by the installed OpenCode version. Verify current syntax and capabilities against the installed version and official documentation when network access is available. Do not blindly copy configuration examples that may be version-incompatible.

### 4.1 Project instructions
Create or update `AGENTS.md` to define:
- Product source-of-truth hierarchy and conflict resolution.
- Autonomous execution loop: discover → specify → plan → implement → test/repair → independent review → final report.
- Evidence-based claims and traceability from requirement to test.
- Code quality, accessibility, performance, security, privacy, data integrity, and documentation expectations.
- Decision delegation and mandatory risk gates.
- Git/change-management practices and final report format.

Keep project-specific instructions concise enough to be followed and link to detailed documents where useful.

### 4.2 OpenCode configuration and permissions
Create or update `opencode.json` (or the correct configuration format for the installed version) with safe, useful defaults:
- Permit routine workspace reading, search, editing, and file creation as needed for assigned tasks.
- Allow routine local checks that are known to be safe and defined by the project.
- Ask before unknown/high-impact shell operations, external directory access, network access, or operations with unclear side effects.
- Deny or gate destructive Git/filesystem commands, unapproved Git push, deployment/publication, secret exposure, and paid-resource creation.
- Avoid unrestricted shell permissions or pretending OpenCode permissions are a complete OS sandbox.
- Preserve existing working configuration unless changes are justified and verified.
- Ensure all permissions match the user's requested autonomy: do not prompt for every routine edit/test, but do not bypass a real safety gate.
- Check Windows/PowerShell-specific destructive-command aliases and equivalent commands; do not rely on a single `rm` rule as complete protection.
- Never disable or bypass a denied permission to make the task progress.

### 4.3 Agents
Create or improve:
- **Primary implementation/build agent:** executes approved work end-to-end, uses tests, fixes safe in-scope defects, and produces a final evidence-based report.
- **Independent read-only reviewer agent:** does not edit files; reviews requirements, architecture, integration, correctness, data integrity, security/privacy, UX/accessibility, and test coverage. Reports findings with severity and file/line evidence.
- Use Plan/Build modes or other agent roles only if actually supported in the installed version. Do not claim unavailable Desktop UI features exist. Validate agent frontmatter and permissions.

### 4.4 Custom commands
Create or improve these project commands using the actual supported format:
- `/bootstrap` — inspect the environment and project setup; report and safely resolve setup gaps.
- `/plan-task` — turn a defined goal into scope, dependencies, acceptance criteria, verification, risks, and an execution plan without prematurely implementing unrelated work.
- `/implement` — execute a bounded task continuously, including tests, repairs, and final reporting.
- `/verify` — run relevant checks, classify results, safely repair in-scope issues, and rerun.
- `/review` — invoke or follow an independent read-only review and report evidence-backed findings.
- `/release-check` — assess release readiness without deploying or publishing.
- `/audit` — read-only repository/environment audit where useful; must not change files.

Commands must state their purpose, expected inputs, allowed actions, stop conditions, and output format. Do not create duplicate or misleading commands if equivalent ones already exist; improve the existing implementation instead.

### 4.5 Skills
Create or improve reusable skills under the supported `.opencode/skills/` layout. At minimum cover:
1. Project/repository discovery.
2. Product specification and architecture design.
3. Full-stack implementation and integration.
4. Test, diagnose, repair, and regression verification.
5. Independent code/architecture review.
6. Security, privacy, permissions, and data integrity.
7. UI/UX quality, accessibility, and responsive behavior.
8. Release readiness and evidence-based handoff.

Each skill should have valid metadata for the installed version, clear activation/use conditions, a practical workflow, quality checks, and expected evidence. Avoid empty boilerplate or creating skills that merely repeat the same generic advice. Do not assume a framework before inspecting the repo.

### 4.6 Configuration verification
- Validate JSON/config syntax and all supported frontmatter.
- Confirm OpenCode can discover the commands, agents, and skills using the actual available app/CLI interface.
- Run a harmless read-only smoke test and a small reversible workflow test.
- Record what was actually verified versus what could not be verified in Desktop.
- If a feature is unsupported, implement the nearest maintainable alternative and document the limitation rather than pretending it works.

## 5. Phase 2 — Reconcile and strengthen the APE specification

After the reusable workflow is in place and validated, proceed to APE product work:
- Read the complete product specification and review, including severity-S issues, contradictions, gaps, and proposed acceptance tests.
- Produce a coherent, versioned implementation-ready specification and a requirement-to-test traceability matrix.
- Define measurable acceptance criteria for in-scope features.
- Prefer a coherent end-to-end vertical slice over broad, incomplete feature coverage.
- Resolve open questions autonomously using Sections 2 and 7.
- Preserve original source material; create a new version or tracked changes rather than silently overwriting the only copy.
- Maintain a decision log with assumption, options, chosen path, rationale, trade-offs, and reversal path for consequential reversible decisions.
- Do not spend the entire task polishing documents: once the specification is consistent enough to implement safely, proceed.

## 6. Phase 3 — Architecture and product implementation

Inspect the actual repository and stack before choosing or changing technologies. If no implementation exists, choose a maintainable, well-supported, low-cost stack that meets the product requirements, document the rationale, and proceed without asking the user to select it.

Build a coherent, working core journey for APE: goals → realistic plan/scheduling → execution → recovery when plans change. Product priorities:
1. Respect hard constraints before soft preferences; communicate infeasibility honestly.
2. Make scheduling deterministic and testable, with explicit stable tie-break rules and tests for edge cases.
3. Keep core workflows usable without AI.
4. Make AI proposals inspectable and controllable; avoid silent high-impact mutations and provide recovery/undo where feasible.
5. Preserve data integrity: handle stale proposals, conflicts, duplicate events, authorization failures, and concurrent updates safely.
6. Provide responsive, accessible UX with clear loading, empty, success, and error states.
7. Protect user data and secrets. Disclose external AI data processing and obtain appropriate consent before sending personal data to providers.
8. Do not use user data for model training by default; do not imply otherwise.
9. Minimize recurring cost. Prefer free/local options when they satisfy requirements.
10. Deliver complete, integrated user journeys rather than disconnected screens or nonfunctional placeholders.

Implement the best next increment, test it, fix issues, and continue. Use reversible migrations and preserve compatibility when practical. Do not add a feature merely because it appears in an old list if doing so undermines the coherent MVP; document the scope decision and preserve the requirement in the roadmap when appropriate.

## 7. Delegated decision authority

The agent may independently decide:
- Technology, architecture, data model, APIs, libraries, and code organization when not fixed by higher-priority requirements.
- MVP sequencing, task decomposition, UI patterns, defaults, validation, error handling, and accessibility details.
- How to resolve routine spec gaps and contradictions.
- Testing strategy, safe refactoring, and prioritization of defects.
- Among alternatives, select the best balance of user value, reliability, security, privacy, maintainability, complexity, cost, and reversibility.

Do not ask the user to choose among routine alternatives. For consequential but reversible decisions, record rationale and trade-offs. Prefer the simplest robust option, established technology, low operating cost, and reversible decisions.

## 8. Mandatory approval boundaries

Do not stop ordinary work for user approval. Stop only the specific action when no safe alternative exists and it would:
- Delete/corrupt user data, overwrite unrelated work, or irreversibly discard project history.
- Deploy, publish, release publicly, or push to an external Git remote without prior explicit authorization.
- Incur charges, subscribe to a paid service, add a payment method, or create billable infrastructure.
- Expose secrets, private code, or personal data to an unapproved external party/provider.
- Weaken important security/privacy protections or expand data sharing beyond the stated requirements.
- Directly contradict an explicit hard constraint with no safe reconciliation.
- Require unavailable credentials, account access, or information that cannot be safely inferred.

Before requesting help, investigate alternatives and finish independent safe work. Report the exact blocked action, evidence, risk, alternatives, and recommendation. Do not block unrelated safe work. Never bypass denied permissions or safety controls.

## 9. Phase 4 — Verification, repair, and independent review

For every implementation increment:
1. Run targeted tests.
2. Run relevant unit, integration, and end-to-end checks where available.
3. Run lint, typecheck, build, and supported security/dependency checks.
4. Distinguish pre-existing failures from new regressions.
5. Fix safe, in-scope defects and rerun failed checks.
6. Review diffs for unrelated edits, secrets, data loss risks, broken integration, and unfinished UX.
7. Update requirement-to-test traceability using actual results.

Then run the independent reviewer agent in read-only mode. Fix Critical/High findings and other safe, in-scope issues; rerun relevant checks. Never weaken/delete tests merely to get green results. Never claim a check passed unless it was actually run and passed.

## 10. Scope boundaries

**In scope:** OpenCode setup and verification; project instructions/configuration; agents, commands, and skills; product-spec reconciliation; architecture; APE implementation; local migrations; UX/accessibility; tests; safe bug fixes; security/privacy hardening; documentation; independent review; setup/run instructions.

**Not authorized in this task:** production deployment/public release, external Git push, paid services/billable infrastructure, payment setup, destructive data changes, or overwriting unrelated work.

“Out of scope” means do not perform the action in this task; it does not mean the feature can never be done later. Do not use scope boundaries as an excuse to avoid safe in-scope work.

## 11. Definition of done

The task is done only when:
- OpenCode setup artifacts are valid and their discoverability/functionality has been verified as far as the environment permits.
- The product spec is coherent, versioned, and traceable to acceptance criteria.
- A coherent working APE core journey is implemented—not merely a set of documents or disconnected UI.
- Every in-scope acceptance criterion has a status: PASS, FAIL, BLOCKED, or NOT VERIFIED, with evidence.
- Relevant checks were run; failures are fixed or honestly classified.
- Independent review findings are fixed or explicitly documented.
- Setup/run instructions and required environment variables are documented without secret values.
- Known limitations, decisions, and the next checkpoint are recorded.
- No unapproved external publication or charges occurred.

If the full product cannot reasonably be completed in one run, deliver the most complete coherent verified increment possible, preserve a clear checkpoint, and state precisely what remains. Do not pretend the whole product is complete.

## 12. Final report — one report, no routine interim reports

Provide one final report with:
1. Executive outcome and actual state.
2. Repository/environment baseline and changes made.
3. OpenCode setup artifacts created/updated and verification evidence.
4. Product specification changes and decision log.
5. Implemented features and working user journeys.
6. Acceptance-criteria traceability: PASS / FAIL / BLOCKED / NOT VERIFIED with evidence.
7. Exact test/check commands and results.
8. Independent review findings and repairs.
9. Security/privacy/cost review.
10. Setup/run instructions.
11. Known limitations, blockers, and next checkpoint.

Do not send routine progress reports or ask for approval between ordinary phases. If the environment or context limit interrupts work, save a resumable checkpoint and continue from it in the next run. Do not misrepresent uncompleted work as complete.

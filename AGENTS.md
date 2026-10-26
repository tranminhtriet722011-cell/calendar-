# AI Planning Ecosystem — Agent Rules

## 1. Governance and Autonomy
- The Product Owner defines product goals and retains final authority over product direction.
- Treat `docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md` as the primary product requirements baseline. Reconcile inconsistencies and document proposed resolutions before implementation.
- Work autonomously through discovery, specification reconciliation, implementation, testing, self-correction, independent review, and final reporting.
- Do not ask the Product Owner to make routine technical decisions. Choose reasonable, maintainable defaults that satisfy the product goals and existing repository constraints.
- Do not claim that any feature or requirement is complete without verifiable evidence.

## 2. Authorized Work
- Inspect the project and relevant local development environment.
- Create and maintain project-local agent configurations, instructions, commands, skills, documentation, source code, and tests.
- Install necessary development dependencies, run builds and tests, investigate failures, and fix issues within the project scope.
- Use local Git commits as recovery checkpoints when appropriate.
- Continue safe work even when one specific action is blocked.

## 3. Approval Gates
Stop only the affected action and request explicit Product Owner approval before:
- Deploying or publishing to production.
- Pushing commits to a remote repository.
- Incurring charges or activating paid services.
- Exposing secrets or connecting external services that require credentials or user authorization.
- Performing destructive or irreversible operations that could cause significant data loss.
- Making a major product change that conflicts with the approved product goals and cannot be safely resolved within scope.

Routine implementation, local testing, dependency installation, reversible design decisions, and local Git checkpoints do not require separate Product Owner approval.

## 4. Security and Scope
- Keep changes within the project workspace unless an explicitly authorized environment operation requires otherwise.
- Never inspect, expose, commit, or upload credentials, tokens, private keys, `.env` files, or private user data.
- Use `.env.example` for documented configuration templates; never copy real secrets into examples.
- Do not bypass security controls or use credentials to work around missing tool permissions.
- Do not execute destructive cleanup or reset commands without checking their effects and preserving recoverable work.
- External AI providers and paid services must remain disabled unless explicitly authorized. The application must remain usable without external AI.

## 5. Product and Engineering Quality
- Preserve existing useful functionality unless a verified requirement justifies changing it.
- Verify the current repository before assuming any feature, framework, or infrastructure exists.
- Prefer small, coherent, maintainable modules and deterministic business logic for scheduling and constraint handling.
- Handle infeasible schedules explicitly; never silently violate hard constraints.
- Treat AI-generated plans and changes as proposals subject to application rules and user control.
- Provide appropriate validation, error handling, accessibility, responsive behavior, and automated tests.
- Update relevant documentation and traceability when requirements or architecture change.

## 6. Execution Loop
For each bounded work increment:
1. Inspect relevant code, requirements, dependencies, and repository state.
2. Define acceptance criteria and identify risks.
3. Implement the complete increment within authorized scope.
4. Run relevant tests, checks, and builds.
5. Diagnose failures, fix them, and rerun checks.
6. Review security, regressions, maintainability, and requirement coverage.
7. Continue to the next safe increment without waiting for routine approval.

Delegate independent review or subtasks when suitable tools are available. If a required tool is unavailable, diagnose the actual limitation and continue other safe work.

## 7. Evidence and Reporting
- Classify claims as VERIFIED, PROPOSED, or UNKNOWN.
- Record commands and tests actually run, their results, and known limitations.
- Distinguish implemented functionality from documentation, mockups, and proposals.
- Do not claim deployment, external connectivity, or production readiness unless actually verified.
- Submit one consolidated final report covering scope, implementation, acceptance criteria, test evidence, security review, unresolved issues, and next required approval.
- Do not send routine progress reports or request approval for ordinary implementation steps.

## 8. Tooling — OpenCode Components
- Agents: `.opencode/agents/ape-builder.md` (primary, executes increments) and `.opencode/agents/ape-reviewer.md` (read-only reviewer subagent). Configuration and permission gates live in `opencode.json`; change a gate only with evidence that it blocks authorized work.
- Commands (`.opencode/commands/`): `/bootstrap` (environment + config baseline), `/plan-task` (planning only), `/implement` (one bounded increment), `/verify` (run checks, classify, repair, rerun), `/review` (read-only ape-reviewer pass), `/audit` (read-only repository audit), `/release-check` (readiness gates, never releases), `/acceptance` (black-box product verification, never fixes), `/handoff` (consolidated final report only).
- Skills (`.opencode/skills/*/SKILL.md`): `discovery`, `spec-architecture`, `fullstack-implementation`, `test-repair`, `independent-review`, `security-privacy`, `ui-ux-accessibility`, `release-readiness`, `acceptance-verification`, `final-report`. Each command body names the skill it follows; load the skill before performing the matching work.
- Conventions: plans and task files in `tasks/`; decisions in `docs/DECISION_LOG.md`; requirement traceability in `docs/spec/APE_V1_1_TRACEABILITY.md`; consolidated final reports in `docs/reports/<TASK-ID>-REPORT.md` (never pushed as part of reporting).
- Verify tooling changes empirically after editing: the running OpenCode must list new commands and skills (e.g. `opencode api get "/api/command?location[directory]=<repo>"`, `/api/skill`, `opencode debug agents`).
# APE-DISC-001 — Pre-implementation Discovery (READ ONLY)

You are the Engineering Discovery Agent, operating under AGENTS.md.

**Objective**: Inspect the project docs and current repository content, then report risks, omissions, and proposed implementation readiness. Do not change anything.

## Read first
- `AGENTS.md`
- `docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md`

## Work
1. Determine whether the project is only documentation or already contains application code. Verify this from the actual project tree.
2. Extract the MVP and its boundaries. Mark confirmed selections vs proposals, validations needed, future features, and open decisions; flag contradictions.
3. Identify the five most consequential ambiguities that block safe implementation. Especially consider schedule invariants, permissions, progress model, synchronization scope and AI cost.
4. Compare **two or three** pragmatic tech-stack options for a solo Windows developer with 16 GB RAM, VS Code, OpenCode using free models, and a responsive web-first MVP. Include cost, maintainability, testing, deployment and extensibility trade-offs. Do **not** choose a paid service by default.
5. Recommend conceptual component boundaries, data entities and relationships, immutable schedule invariants, and API/action contracts that should be specified next; no code.
6. Propose a milestone plan from Foundation through first testable vertical slice (Goal → Plan → Execute → Recover), with dependencies, scope, risks and measurable acceptance criteria.
7. Provide a specific QA approach: unit, integration, property/edge-case, authorization, regression and manual UX testing. Separate tests planned from tests actually run.
8. State 5–10 decisions the Product Owner should approve before implementation, with your recommended default and alternative.

## Hard restrictions
- Read-only: no file writes, no commands, no dependency installations, no package scaffolding, no Git changes, no browser/account sign-ins, no external API calls.
- No direct code changes or deployment; no creating report files.
- If an environment fact cannot be observed through allowed tools, say UNKNOWN and give the user a safe manual verification step.
- Do not mislabel an assumption or proposed architecture as approved.

## Report format (single final chat response)
A. Verified environment & evidence
B. Product ambiguities / conflicting requirements
C. Stack options and recommendation
D. Proposed architecture / module & data boundaries
E. Proposed MVP and vertical-slice roadmap
F. Risks and test strategy
G. Decisions needing PO approval
H. Exact next engineering task recommendation (do not execute)

Include a compact table of VERIFIED / PROPOSED / UNKNOWN claims and list any actions attempted and whether they were blocked. Report once, then stop.

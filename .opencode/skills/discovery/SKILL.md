---
name: discovery
description: "Use when starting any APE task that needs a trustworthy picture of the repository and environment — session bootstrap, pre-implementation discovery, or when asked what exists before changing anything. Produces a read-only inventory and baseline that separates pre-existing failures from new regressions."
---

# Discovery — Read-Only Project & Environment Inventory

## Workflow

1. Confirm the real workspace root, OS, runtime versions, and OpenCode
   artifacts (`opencode.json`, `AGENTS.md`, `.opencode/` agents/commands/skills).
   Mark each fact VERIFIED or UNKNOWN — never guess a runtime that was not
   observed.
2. Read `AGENTS.md`, the unified contract, and the master spec
   (`docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md`) table of contents;
   verify from the actual tree whether the project is documentation-only or has
   application code.
3. Capture the git baseline with read-only commands (`git status`, `git diff`,
   `git log`) BEFORE any change, so dirty user work is never mistaken for agent
   output and regressions can later be distinguished.
4. Inventory existing setup and app artifacts; preserve and improve rather than
   duplicate anything that already works.
5. Establish baseline checks: run existing test/lint/build commands if present;
   label every result PRE-EXISTING PASS/FAIL.
6. Extract the MVP boundary and key product context: entity invariants
   (Task ≠ TimeBlock ≠ WorkSession), hard constraints H1–H11, suggest-only AI
   default, owner-scoped authorization.
7. Report inventory, risks, omissions, and the recommended next increment. Do
   not create or modify files during discovery.

## Quality checks

- Every claim is VERIFIED with evidence or explicitly UNKNOWN (with a safe
  manual verification step).
- No assumption of a clean repository; dirty state recorded verbatim.
- No framework, stack, or feature assumed before inspecting the tree.
- Baseline failures labeled PRE-EXISTING before any implementation begins.
- Zero files written or edited.

## Expected evidence

- Environment table (OS, runtime, OpenCode config) with VERIFIED/UNKNOWN status.
- Repository tree summary (docs vs code) and git baseline output.
- Existing artifact list (present/missing/invalid).
- Baseline check commands and results, labeled PRE-EXISTING.
- VERIFIED / PROPOSED / UNKNOWN claim table.

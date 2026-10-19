# AI Planning Ecosystem — Discovery Starter

This package contains **documentation only**, not app source code.

## Files
- `docs/AI_Planning_Ecosystem_Master_Product_Spec_V1_0.md`: product-spec review candidate, NOT implementation authorization.
- `AGENTS.md`: governance and safety rules for coding agents.
- `opencode.json`: restrictive read-only OpenCode permissions for Discovery. Verify behavior on your installed version; do not start in auto-approval mode.
- `tasks/APE-DISC-001.md`: first read-only discovery contract.

## Windows PowerShell setup
1. Choose an empty project folder on D:, e.g. `D:\Projects\AI-Planning-Ecosystem`.
2. Extract all package contents directly into the project folder (AGENTS.md and opencode.json in project root).
3. Optional: open PowerShell in project root; run `git --version`. If available, `git init` creates local version control; it does not connect to a remote repo or make an initial commit.
4. Open only this project folder in OpenCode (not your parent D:\Projects folder).
5. In a new session select Plan or another restricted mode if available, confirm auto-approve is OFF, and paste the task file content or tell OpenCode to read `tasks/APE-DISC-001.md` and execute **read-only**.
6. Check OpenCode is not changing files. If it requests write, bash, network, or external-folder privileges, reject.
7. Copy its final report back to ChatGPT for PM/Technical Lead review.

## Expected result
A chat-only report recommending tech-stack options, architecture boundaries, scope and quality gates. No code, installations, deployment or paid providers.

## Important
The config is tailored to OpenCode documentation about `permission` (check https://docs.opencode.ai/docs/permissions/). Installed desktop version may differ; user must verify effective permissions.

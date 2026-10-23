---
name: ui-ux-accessibility
description: "Use when creating or reviewing APE screens and interactions — enforces the WCAG 2.2 AA design target: keyboard access, visible focus, contrast, reduced motion, responsive 320px+ layouts, and complete empty/loading/success/error states."
---

# UI/UX Quality & Accessibility

## Workflow

1. Identify the user journeys touched (goals → plan → execute → recovery) and
   enumerate every UI surface's states before editing: loading, empty, success,
   error, and infeasible/conflict states.
2. Keyboard & focus: every action reachable and operable without a mouse; Enter/
   Space activate controls; visible focus indicator at all times; logical tab
   order; modals trap focus and restore it on close; the calendar has a full
   keyboard path for create/move/resize.
3. Semantics & contrast: semantic elements, headings, labels and accessible
   names; text/UI contrast to WCAG 2.2 AA thresholds — measure with tools
   (axe/Lighthouse/contrast checker) when available, never assert compliance
   from documentation alone.
4. Motion & cognition: honor `prefers-reduced-motion`; no auto-play flashing or
   parallax that triggers vestibular issues; plain-language copy for errors and
   AI proposals (labeled as suggestions with preview + undo, never silent
   high-impact changes).
5. Responsive behavior: usable from 320px width up; no horizontal-scroll traps;
   adequate touch targets; the Day/Week calendar degrades gracefully on small
   screens.
6. State honesty: infeasible schedules are communicated explicitly with reasons
   (hard-constraint conflicts named), not hidden or silently violated; stale
   proposal expiry shown; optimistic updates roll back visibly on failure.
7. Screen-reader alternative for calendar data: table/list alternative view of
   TimeBlocks and fixed events with announced changes (aria-live where needed).
8. Verify by running the app and checks where the environment permits; otherwise
   mark NOT VERIFIED with a concrete manual verification step — never claim
   WCAG 2.2 AA "achieved", only "targeted and tested to date".

## Quality checks

- Keyboard-only walkthrough proven for each touched journey; focus visible
  everywhere.
- Contrast measured with a tool; results recorded.
- Reduced-motion respected; no motion-only information.
- All four async states (loading/empty/success/error) present per surface.
- No external AI, paid service, or heavy dependency added for UX polish.

## Expected evidence

- Route/surface inventory with state coverage table.
- Tool results (axe/Lighthouse/contrast) or manual walkthrough notes with steps.
- Screenshots/manual verification steps for keyboard and responsive checks.
- Findings: severity, file:line, evidence, recommended fix; NOT VERIFIED items
  explicitly listed.

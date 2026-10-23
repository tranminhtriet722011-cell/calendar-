/** Task flags rendered as text with an icon — never colour alone. */

import type { TaskFlags } from "../types";

const FLAG_LABELS: { key: keyof TaskFlags; label: string }[] = [
  { key: "late_start", label: "Late start" },
  { key: "overdue", label: "Overdue" },
  { key: "overtime", label: "Overtime" },
  { key: "at_risk", label: "At risk" },
];

export function FlagBadges({ flags }: { flags: TaskFlags }) {
  const active = FLAG_LABELS.filter((flag) => flags[flag.key]);
  if (active.length === 0) {
    return (
      <p className="flag flag-ok">
        <span aria-hidden="true">✓ </span>No flags — on track
      </p>
    );
  }
  return (
    <ul className="flag-list" aria-label="Task flags">
      {active.map((flag) => (
        <li key={flag.key} className="flag flag-warn">
          <span aria-hidden="true">⚠ </span>
          {flag.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * ProposalPreviewCard — the suggest-only contract made visible.
 *
 * A proposal never changes anything by itself: the card shows strategy, placements with task
 * titles and times, releases, reasons, metrics, impact and feasibility (including shortfall and
 * user options), and requires an explicit Apply or Dismiss action.
 */

import type { Feasibility, ProposalView } from "../types";
import { formatDateTime, formatDurationMinutes } from "../format";

const STRATEGY_LABELS: Record<string, string> = {
  minimal: "Minimal changes",
  deadline: "Deadline first",
  balanced: "Balanced",
};

export function strategyLabel(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy;
}

export function FeasibilityPanel({ feasibility }: { feasibility: Feasibility }) {
  if (feasibility.feasible) {
    return (
      <section className="proposal-section" aria-label="Feasibility">
        <h4>Feasibility</h4>
        <p className="flag flag-ok">
          <span aria-hidden="true">✓ </span>Feasible — required {formatDurationMinutes(feasibility.requiredMinutes)} of{" "}
          {formatDurationMinutes(feasibility.freeMinutes)} free time.
        </p>
      </section>
    );
  }
  return (
    <section className="proposal-section" aria-label="Feasibility">
      <h4>Feasibility</h4>
      <p className="flag flag-warn">
        <span aria-hidden="true">⚠ </span>Not fully feasible — short by{" "}
        {formatDurationMinutes(feasibility.shortfallMinutes)} (required {formatDurationMinutes(feasibility.requiredMinutes)},
        free {formatDurationMinutes(feasibility.freeMinutes)}).
      </p>
      {feasibility.shortfalls.length > 0 ? (
        <ul>
          {feasibility.shortfalls.map((shortfall) => (
            <li key={shortfall.taskId}>
              {shortfall.title}: {formatDurationMinutes(shortfall.minutes)} unplaced — {shortfall.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {feasibility.userOptions.length > 0 ? (
        <>
          <h5>What you can do</h5>
          <ul>
            {feasibility.userOptions.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export interface ProposalCardProps {
  proposal: ProposalView;
  onApply: (proposal: ProposalView) => void;
  onDismiss: (proposal: ProposalView) => void;
  busy: boolean;
  issue?: string | null;
}

export function ProposalCard(props: ProposalCardProps) {
  const { proposal, onApply, onDismiss, busy, issue } = props;
  const expired = proposal.expiresAt <= Date.now();
  const pending = proposal.status === "pending";

  return (
    <article className="card proposal" aria-label={`Proposal: ${strategyLabel(proposal.strategy)}`}>
      <header className="card-head">
        <h3>{strategyLabel(proposal.strategy)} plan</h3>
        <p className="muted">
          Type: {proposal.kind === "recovery" ? "Recovery (need more time)" : "Schedule"} · Status:{" "}
          <strong>{pending ? "Waiting for your decision" : proposal.status}</strong>
        </p>
        <p className="muted">
          Trigger: {proposal.trigger} · Created {formatDateTime(proposal.createdAt)}
        </p>
        <p className={expired ? "flag flag-warn" : "muted"}>
          {expired ? (
            <>
              <span aria-hidden="true">⚠ </span>Expired {formatDateTime(proposal.expiresAt)} — request a fresh plan before
              applying.
            </>
          ) : (
            <>Expires {formatDateTime(proposal.expiresAt)}</>
          )}
        </p>
      </header>

      <p className="proposal-note">
        Nothing has been scheduled yet. Review the proposal below, then apply it or dismiss it.
      </p>

      <section className="proposal-section" aria-label="Proposed sessions">
        <h4>Proposed sessions ({proposal.placements.length})</h4>
        {proposal.placements.length === 0 ? (
          <p>No new sessions would be placed.</p>
        ) : (
          <ul>
            {proposal.placements.map((placement, index) => (
              <li key={`${placement.taskId}-${placement.startAt}-${index}`}>
                {placement.title} — {formatDateTime(placement.startAt)} → {formatDateTime(placement.endAt)} (
                {formatDurationMinutes((placement.endAt - placement.startAt) / 60_000)})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="proposal-section" aria-label="Released sessions">
        <h4>Sessions released ({proposal.releases.length})</h4>
        {proposal.releases.length === 0 ? (
          <p>None — your existing sessions stay where they are.</p>
        ) : (
          <ul>
            {proposal.releases.map((blockId) => (
              <li key={blockId}>Session {blockId} would be released and re-placed.</li>
            ))}
          </ul>
        )}
      </section>

      <section className="proposal-section" aria-label="Reasons">
        <h4>Why this plan</h4>
        <ul>
          {proposal.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <section className="proposal-section" aria-label="Impact">
        <h4>Impact</h4>
        <ul>
          <li>Sessions moved: {proposal.impact.movedBlocks}</li>
          <li>Sessions added: {proposal.impact.addedBlocks}</li>
          <li>Tasks touched: {proposal.impact.tasksTouched.length}</li>
          <li>At-risk tasks in scope: {proposal.impact.atRiskTaskIds.length}</li>
        </ul>
      </section>

      <section className="proposal-section" aria-label="Quality metrics">
        <h4>Quality metrics</h4>
        <ul>
          <li>Deadline risk: {proposal.metrics.deadlineRisk}</li>
          <li>Priority coverage: {Math.round(proposal.metrics.priorityCoverage * 100)}%</li>
          <li>Minutes placed in soft rest: {proposal.metrics.restPenaltyMinutes}</li>
          <li>Extra fragments: {proposal.metrics.fragmentation}</li>
          <li>Blocks changed: {proposal.metrics.changeCount}</li>
        </ul>
      </section>

      <FeasibilityPanel feasibility={proposal.feasibility} />

      {issue ? (
        <div className="error-panel" role="alert">
          <p>
            <span aria-hidden="true">⚠ </span>
            {issue}
          </p>
        </div>
      ) : null}

      {pending ? (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || expired}
            onClick={() => onApply(proposal)}
          >
            {busy ? "Applying…" : "Apply this plan"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => onDismiss(proposal)}>
            Dismiss
          </button>
        </div>
      ) : (
        <p className="muted">This proposal is closed ({proposal.status}); no further action is possible.</p>
      )}
    </article>
  );
}

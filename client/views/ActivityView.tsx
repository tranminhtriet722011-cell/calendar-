/**
 * ActivityView — the audit timeline plus the proposal inbox.
 *
 * - Every entry shows actor / action / time; undoable entries get an explicit Undo button.
 * - A 409 undo conflict (`undo_conflict`) is surfaced with the server's conflict details instead
 *   of a blind restore (AT30/AT31).
 * - Proposals are previews: Apply (POST /schedule/commit) or Dismiss are explicit actions;
 *   nothing is ever applied automatically.
 */

import { useState } from "react";
import { ApiError, apiGet, apiPost, errorMessage } from "../api";
import { useAsyncData } from "../useAsyncData";
import { useStatus } from "../statusContext";
import { AsyncSection } from "../components/AsyncSection";
import { FeasibilityPanel, ProposalCard } from "../components/ProposalCard";
import { formatDateTime } from "../format";
import type {
  ActivityEntry,
  CommitResponse,
  Feasibility,
  ProposalView,
  UndoConflict,
} from "../types";

interface ActivityBundle {
  entries: ActivityEntry[];
  proposals: ProposalView[];
}

function loadActivity(): Promise<ActivityBundle> {
  return Promise.all([
    apiGet<{ entries: ActivityEntry[] }>("/api/activity", { limit: 100 }),
    apiGet<{ proposals: ProposalView[] }>("/api/schedule/proposals"),
  ]).then(([entryList, proposalList]) => ({ entries: entryList.entries, proposals: proposalList.proposals }));
}

function actorLabel(actor: string): string {
  if (actor === "user") return "You";
  if (actor === "agent") return "Scheduler";
  return "System";
}

interface UndoIssue {
  entryId: string;
  message: string;
  conflicts: UndoConflict[];
}

interface ProposalIssue {
  message: string;
  detail: string | null;
}

export default function ActivityView() {
  const { announce } = useStatus();
  const state = useAsyncData<ActivityBundle>(loadActivity, []);

  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [undoIssue, setUndoIssue] = useState<UndoIssue | null>(null);

  const [planBusy, setPlanBusy] = useState(false);
  const [planFeasibility, setPlanFeasibility] = useState<Feasibility | null>(null);

  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [proposalIssues, setProposalIssues] = useState<Record<string, ProposalIssue>>({});

  async function undo(entry: ActivityEntry): Promise<void> {
    setBusyEntryId(entry.id);
    setUndoIssue(null);
    try {
      await apiPost(`/api/activity/${encodeURIComponent(entry.id)}/undo`);
      announce("Action undone.", "success");
      state.reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const conflicts = Array.isArray(error.details) ? (error.details as UndoConflict[]) : [];
        setUndoIssue({ entryId: entry.id, message: error.message, conflicts });
        announce(error.message, "error");
      } else {
        const message = errorMessage(error);
        setUndoIssue({ entryId: entry.id, message, conflicts: [] });
        announce(message, "error");
      }
    } finally {
      setBusyEntryId(null);
    }
  }

  async function requestPlan(): Promise<void> {
    setPlanBusy(true);
    try {
      const result = await apiPost<{ proposals: ProposalView[]; feasibility: Feasibility }>("/api/schedule/plan", {
        trigger: "manual plan request from Activity view",
      });
      setPlanFeasibility(result.feasibility);
      announce(
        result.proposals.length > 0
          ? `${result.proposals.length} proposal(s) generated. Nothing is scheduled until you apply one.`
          : "The scheduler had nothing to propose.",
        result.proposals.length > 0 ? "success" : "info",
      );
      state.reload();
    } catch (error) {
      announce(errorMessage(error), "error");
    } finally {
      setPlanBusy(false);
    }
  }

  async function applyProposal(proposal: ProposalView): Promise<void> {
    setBusyProposalId(proposal.id);
    setProposalIssues((current) => ({ ...current, [proposal.id]: { message: "", detail: null } }));
    try {
      const result = await apiPost<CommitResponse>("/api/schedule/commit", {
        proposalId: proposal.id,
        idempotencyKey: `ui-${proposal.id}-${proposal.createdAt}`,
      });
      announce(
        `Plan applied: ${result.applied.length} session(s) placed, ${result.released.length} released. You can undo this from the timeline below.`,
        "success",
      );
      state.reload();
    } catch (error) {
      const message = errorMessage(error);
      let detail: string | null = null;
      if (error instanceof ApiError && error.status === 409) {
        if (error.code === "stale_proposal" || (error.details as { code?: string } | null)?.code === "stale_proposal") {
          detail = "The calendar changed after this proposal was generated, so it was discarded. Request a fresh plan.";
        } else if ((error.details as { code?: string } | null)?.code === "proposal_expired") {
          detail = "It expired — request a fresh plan so it reflects the current calendar.";
        } else if (Array.isArray((error.details as { violations?: unknown[] } | null)?.violations)) {
          detail = "Hard constraints would be violated, so nothing was applied.";
        }
      }
      setProposalIssues((current) => ({ ...current, [proposal.id]: { message, detail } }));
      announce(message, "error");
      state.reload();
    } finally {
      setBusyProposalId(null);
    }
  }

  async function dismissProposal(proposal: ProposalView): Promise<void> {
    setBusyProposalId(proposal.id);
    try {
      await apiPost(`/api/schedule/proposals/${encodeURIComponent(proposal.id)}/dismiss`);
      announce("Proposal dismissed. Nothing was changed.", "info");
      state.reload();
    } catch (error) {
      const message = errorMessage(error);
      setProposalIssues((current) => ({ ...current, [proposal.id]: { message, detail: null } }));
      announce(message, "error");
    } finally {
      setBusyProposalId(null);
    }
  }

  const entries = state.data?.entries ?? [];
  const proposals = state.data?.proposals ?? [];
  const pendingProposals = proposals.filter((proposal) => proposal.status === "pending");
  const closedProposals = proposals.filter((proposal) => proposal.status !== "pending");

  return (
    <div className="view">
      <h1>Activity</h1>

      <section aria-labelledby="activity-proposals">
        <h2 id="activity-proposals">Proposals</h2>
        <p className="lede">
          Proposals are previews only. The scheduler never changes your calendar by itself — you apply or dismiss each
          one explicitly.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={planBusy} onClick={() => void requestPlan()}>
            {planBusy ? "Planning…" : "Ask for a plan (next 7 days)"}
          </button>
          <button type="button" className="btn" onClick={state.reload}>
            Refresh
          </button>
        </div>
        {planFeasibility ? <FeasibilityPanel feasibility={planFeasibility} /> : null}

        <AsyncSection
          loading={state.loading}
          error={state.error}
          onRetry={state.reload}
          loadingLabel="Loading proposals…"
          isEmpty={proposals.length === 0}
          emptyTitle="No proposals yet"
          emptyMessage="Ask for a plan above, or use “Need more time” on a task in the Today view. Proposals appear here for review before anything is applied."
        >
          {pendingProposals.length === 0 && closedProposals.length === 0 ? (
            <p>No proposals yet — ask for a plan above.</p>
          ) : (
            <>
              {pendingProposals.map((proposal) => {
                const issue = proposalIssues[proposal.id];
                return (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    busy={busyProposalId === proposal.id}
                    issue={issue?.message ? `${issue.message}${issue.detail ? ` ${issue.detail}` : ""}` : null}
                    onApply={(item) => void applyProposal(item)}
                    onDismiss={(item) => void dismissProposal(item)}
                  />
                );
              })}
              {closedProposals.length > 0 ? (
                <details className="closed-proposals">
                  <summary>Closed proposals ({closedProposals.length})</summary>
                  {closedProposals.map((proposal) => {
                    const issue = proposalIssues[proposal.id];
                    return (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        busy={busyProposalId === proposal.id}
                        issue={issue?.message ? issue.message : null}
                        onApply={(item) => void applyProposal(item)}
                        onDismiss={(item) => void dismissProposal(item)}
                      />
                    );
                  })}
                </details>
              ) : null}
            </>
          )}
        </AsyncSection>
      </section>

      <section aria-labelledby="activity-timeline">
        <h2 id="activity-timeline">Timeline</h2>
        <AsyncSection
          loading={state.loading}
          error={state.error}
          onRetry={state.reload}
          loadingLabel="Loading the timeline…"
          isEmpty={entries.length === 0}
          emptyTitle="Nothing has happened yet"
          emptyMessage="Every change you, the scheduler or the system makes lands here with an actor and a timestamp, so nothing is invisible."
        >
          <ol className="timeline">
            {entries.map((entry) => (
              <li key={entry.id} className="timeline-item">
                <p>
                  <strong>{actorLabel(entry.actor)}</strong> · {entry.action.replace(/\./g, " ")} · {entry.entityType}{" "}
                  <span className="muted">({entry.entityId})</span>
                </p>
                <p className="muted">
                  {formatDateTime(entry.createdAt)}
                  {entry.reason ? ` — ${entry.reason}` : ""}
                  {entry.undoneAt !== null ? " — undone" : ""}
                </p>
                <div className="btn-row">
                  {entry.preview.available ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={busyEntryId === entry.id}
                      onClick={() => void undo(entry)}
                    >
                      {busyEntryId === entry.id ? "Undoing…" : "Undo"}
                    </button>
                  ) : (
                    <span className="muted">{entry.preview.summary}</span>
                  )}
                </div>
                {undoIssue?.entryId === entry.id ? (
                  <div className="error-panel" role="alert">
                    <p>
                      <strong>Undo blocked.</strong> {undoIssue.message}
                    </p>
                    {undoIssue.conflicts.length > 0 ? (
                      <>
                        <p>Conflicting items — review them before trying to restore:</p>
                        <ul>
                          {undoIssue.conflicts.map((conflict) => (
                            <li key={`${conflict.entity}-${conflict.id}`}>
                              {conflict.entity} {conflict.id}: {conflict.reason}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </AsyncSection>
      </section>
    </div>
  );
}

/**
 * Proposal endpoints: plan, need-more-time recovery, commit, dismiss.
 *
 * Implements the pseudo-contract in spec F10 and the lifecycle in G3:
 *   Intent → Proposal (validated, revision-pinned, expiring) → user approval →
 *   atomic revalidation → commit → audit → undo available
 *
 * There is no code path that writes a schedule without going through `commit`, and `commit` can
 * never override a locked/fixed event because proposals are always generated with
 * `allowLockedOverride: false` (H1/H2/H3, AT11, AT12).
 */

import { Router } from "express";
import type { DB } from "../db";
import { conflict as conflictError, badRequest, notFound } from "../errors";
import { generateProposals, proposalContentId, validatePlacements, type Placement, type Proposal, type SchedulerInput, type SchedulerTask } from "../domain/scheduler";
import { optionalEnum, optionalInstant, optionalInt, optionalString, requireUser, type AuthedRequest } from "../http";
import { STRATEGIES } from "../domain/scheduler";
import {
  buildScheduleContext,
  findIdempotent,
  getProposal,
  listProposals,
  listTasks,
  recordAudit,
  requireTask,
  resolveProposal,
  saveIdempotent,
  saveProposal,
  setBlockStatus,
  createBlock,
  requireBlock,
  toSchedulerTask,
  listBlocks,
  type ProposalRecord,
} from "../store";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

interface StoredPayload {
  strategy: string;
  placements: { taskId: string; startAt: number; endAt: number }[];
  releaseBlockIds: string[];
  reasons: string[];
  metrics: Proposal["metrics"];
  feasibility: {
    feasible: boolean;
    requiredMinutes: number;
    freeMinutes: number;
    shortfallMinutes: number;
    shortfalls: { taskId: string; title: string; minutes: number; reason: string }[];
    userOptions: string[];
  };
  impact: { movedBlocks: number; addedBlocks: number; tasksTouched: string[]; atRiskTaskIds: string[] };
}

function baseRevisionMap(db: DB, userId: string, input: SchedulerInput): Record<string, number> {
  const map: Record<string, number> = {};
  for (const task of input.tasks) {
    const row = db.prepare("SELECT revision FROM tasks WHERE id = ? AND user_id = ?").get(task.id, userId) as
      | { revision: number }
      | undefined;
    if (row) map[`task:${task.id}`] = Number(row.revision);
  }
  for (const busy of input.busy) {
    const table = busy.kind === "block" ? "blocks" : "events";
    const row = db.prepare(`SELECT revision FROM ${table} WHERE id = ? AND user_id = ?`).get(busy.id, userId) as
      | { revision: number }
      | undefined;
    if (row) map[`${table === "blocks" ? "block" : "event"}:${busy.id}`] = Number(row.revision);
  }
  return map;
}

function currentRevisions(db: DB, userId: string, base: Record<string, number>): { stale: string[]; current: Record<string, number> } {
  const stale: string[] = [];
  const current: Record<string, number> = {};
  for (const [key, revision] of Object.entries(base)) {
    const [kind, id] = key.split(":");
    const table = kind === "task" ? "tasks" : kind === "block" ? "blocks" : "events";
    const row = db.prepare(`SELECT revision FROM ${table} WHERE id = ? AND user_id = ?`).get(id ?? "", userId) as
      | { revision: number }
      | undefined;
    if (!row) {
      stale.push(key);
      continue;
    }
    current[key] = Number(row.revision);
    if (Number(row.revision) !== revision) stale.push(key);
  }
  return { stale, current };
}

function describeProposal(record: ProposalRecord<StoredPayload>, titles: Map<string, string>) {
  const payload = record.payload;
  return {
    id: record.id,
    /** Content hash: unchanged plan content ⇒ unchanged content id (AT18). */
    contentId: proposalContentId(payload),
    strategy: record.strategy,
    kind: record.kind,
    status: record.status,
    trigger: record.trigger,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    baseRevisions: record.baseRevisions,
    placements: payload.placements.map((placement) => ({
      ...placement,
      title: titles.get(placement.taskId) ?? "Unknown task",
    })),
    releases: payload.releaseBlockIds,
    reasons: payload.reasons,
    metrics: payload.metrics,
    impact: payload.impact,
    feasibility: payload.feasibility,
  };
}

export function scheduleRoutes(db: DB): Router {
  const router = Router();
  router.use(requireUser(db));

  /** Step 1: generate revision-pinned proposals. Nothing is written to the calendar. */
  router.post("/plan", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const now = Date.now();
    const from = optionalInstant(req.body?.from, "from") ?? now;
    const to = optionalInstant(req.body?.to, "to") ?? from + 7 * DAY_MS;
    if (to <= from) throw badRequest("`to` must be after `from`.");
    const requested = optionalEnum<(typeof STRATEGIES)[number]>(req.body?.strategy, "strategy", STRATEGIES);

    const all = listTasks(db, user.id);
    const scopeIds = Array.isArray(req.body?.taskIds) ? (req.body.taskIds as unknown[]).map(String) : null;
    const scoped = scopeIds ? all.filter((task) => scopeIds.includes(task.id)) : all.filter((task) => task.status !== "completed" && task.status !== "cancelled" && task.remainingMinutes > 0);
    if (scoped.length === 0) {
      res.json({ proposals: [], feasibility: { feasible: false, requiredMinutes: 0, freeMinutes: 0, shortfallMinutes: 0, shortfalls: [], userOptions: ["Add a task with remaining effort before asking for a plan."] } });
      return;
    }

    const context = buildScheduleContext(user, db, from, to);
    // Sessions already booked for the scoped tasks may be moved by a new plan — the user sees that
    // in the impact preview before approving (spec F6/F8), and every move stays auditable.
    const releaseable = listBlocks(db, user.id, now, to)
      .filter((block) => block.status === "planned" && block.startAt >= now && scoped.some((task) => task.id === block.taskId))
      .map((block) => block.id);
    const input: SchedulerInput = {
      now,
      horizon: { start: from, end: to },
      tasks: scoped.map(toSchedulerTask),
      workingWindows: context.workingWindows,
      softRest: context.softRest,
      busy: context.busy,
      releaseableBlockIds: releaseable,
      allowLockedOverride: false,
    };
    const result = requested
      ? (() => {
          const single = generateProposals({ ...input });
          return { ...single, proposals: single.proposals.filter((proposal) => proposal.strategy === requested) };
        })()
      : generateProposals(input);

    const baseRevisions = baseRevisionMap(db, user.id, input);
    const titles = new Map(scoped.map((task) => [task.id, task.title]));
    const atRiskIds = scoped.filter((task) => task.dueAt !== null && task.dueAt - now < 48 * 60 * 60 * 1000).map((task) => task.id);

    const saved = result.proposals.map((proposal) => {
      const payload: StoredPayload = {
        strategy: proposal.strategy,
        placements: proposal.placements.map((placement) => ({ taskId: placement.taskId, startAt: placement.start, endAt: placement.end })),
        releaseBlockIds: proposal.releases.map((release) => release.blockId),
        reasons: proposal.reasons,
        metrics: proposal.metrics,
        feasibility: result.feasibility,
        impact: {
          movedBlocks: proposal.releases.length,
          addedBlocks: proposal.placements.length,
          tasksTouched: [...new Set(proposal.placements.map((placement) => placement.taskId))],
          atRiskTaskIds: atRiskIds,
        },
      };
      const record = saveProposal<StoredPayload>(db, user.id, {
        kind: "schedule",
        strategy: proposal.strategy,
        payload,
        baseRevisions,
        trigger: typeof req.body?.trigger === "string" ? req.body.trigger : "explicit plan request",
        ttlMs: PROPOSAL_TTL_MS,
      });
      recordAudit(db, {
        userId: user.id,
        actor: "agent",
        action: "agent.proposal.create",
        entityType: "proposal",
        entityId: record.id,
        before: null,
        after: { strategy: proposal.strategy, placements: payload.placements, releases: payload.releaseBlockIds },
        reason: payload.reasons.join(" "),
        proposalId: record.id,
        undoable: false,
      });
      return describeProposal(record, titles);
    });

    res.json({ proposals: saved, feasibility: result.feasibility, generatedAt: now });
  });

  /**
   * Step 2: commit an approved proposal.
   * Revalidates revisions and hard constraints at commit time (H8) and honours idempotency (AT41).
   */
  router.post("/commit", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const proposalId = optionalString(req.body?.proposalId, "proposalId", 64);
    if (!proposalId) throw badRequest("proposalId is required.");
    const idempotencyKey =
      typeof req.header("idempotency-key") === "string" ? req.header("idempotency-key") : optionalString(req.body?.idempotencyKey, "idempotencyKey", 200) ?? null;

    if (idempotencyKey) {
      const previous = findIdempotent<CommitResponse>(db, user.id, idempotencyKey);
      if (previous) {
        res.json({ ...previous, replayed: true });
        return;
      }
    }

    const proposal = getProposal<StoredPayload>(db, user.id, proposalId);
    if (!proposal) throw notFound("Proposal not found.");
    if (proposal.status !== "pending") {
      throw conflictError(`This proposal is already ${proposal.status}.`, { status: proposal.status });
    }
    if (proposal.expiresAt < Date.now()) {
      resolveProposal(db, user.id, proposal.id, "expired");
      throw conflictError("This proposal expired. Request a fresh plan so it reflects the current calendar.", {
        code: "proposal_expired",
        expiresAt: proposal.expiresAt,
      });
    }

    const { stale, current } = currentRevisions(db, user.id, proposal.baseRevisions);
    if (stale.length > 0) {
      resolveProposal(db, user.id, proposal.id, "dismissed");
      throw conflictError("The calendar changed after this proposal was generated. It was discarded — request a new plan.", {
        code: "stale_proposal",
        stale,
        current,
      });
    }

    const now = Date.now();
    const from = Math.min(...proposal.payload.placements.map((placement) => placement.startAt), now);
    const to = Math.max(...proposal.payload.placements.map((placement) => placement.endAt), now + DAY_MS);
    const context = buildScheduleContext(user, db, from - DAY_MS, to + DAY_MS);
    const scopeTaskIds = [...new Set(proposal.payload.placements.map((placement) => placement.taskId))];
    const scopeTasks = listTasks(db, user.id).filter((task) => scopeTaskIds.includes(task.id));
    const input: SchedulerInput = {
      now,
      horizon: { start: from - DAY_MS, end: to + DAY_MS },
      tasks: scopeTasks.map(toSchedulerTask),
      workingWindows: context.workingWindows,
      softRest: context.softRest,
      // Sessions this proposal releases are being moved in the same transaction, so they must not
      // count as obstacles to their own replacement (spec F8).
      busy: context.busy.filter(
        (busy) => !(busy.kind === "block" && proposal.payload.releaseBlockIds.includes(busy.id)),
      ),
      allowLockedOverride: false,
    };
    const placements: Placement[] = proposal.payload.placements.map((placement) => ({
      taskId: placement.taskId,
      start: placement.startAt,
      end: placement.endAt,
    }));
    const violations = validatePlacements(placements, input);
    if (violations.length > 0) {
      resolveProposal(db, user.id, proposal.id, "dismissed");
      throw conflictError("The proposal no longer satisfies the hard constraints and was not applied.", {
        code: "validation_failed",
        violations,
      });
    }

    const applied: string[] = [];
    const released: string[] = [];
    db.exec("BEGIN");
    try {
      for (const blockId of proposal.payload.releaseBlockIds) {
        const block = requireBlock(db, user.id, blockId);
        setBlockStatus(db, user.id, block.id, "released");
        released.push(block.id);
      }
      for (const placement of proposal.payload.placements) {
        const block = createBlock(db, user.id, {
          taskId: placement.taskId,
          startAt: placement.startAt,
          endAt: placement.endAt,
          source: "proposal",
        });
        applied.push(block.id);
      }
      const audit = recordAudit(db, {
        userId: user.id,
        actor: "user",
        action: "schedule.commit",
        entityType: "proposal",
        entityId: proposal.id,
        before: { released },
        after: { applied, released, strategy: proposal.strategy },
        reason: `Approved ${proposal.strategy} proposal`,
        proposalId: proposal.id,
        undoable: true,
      });
      resolveProposal(db, user.id, proposal.id, "committed");
      const response: CommitResponse = {
        proposalId: proposal.id,
        applied,
        released,
        auditId: audit.id,
        undoable: true,
        revisions: currentRevisions(db, user.id, proposal.baseRevisions).current,
      };
      // REV-A-12: the idempotency row lands *inside* the transaction — a crash after COMMIT would
      // leave a committed change with no dedupe row, and a client retry could then double-apply.
      if (idempotencyKey) saveIdempotent(db, user.id, idempotencyKey, response);
      db.exec("COMMIT");
      res.json(response);
      return;
    } catch (error) {
      // Roll back only while a transaction is actually open, and never let the rollback attempt
      // mask the original error (REV-A-12).
      try {
        db.exec("ROLLBACK");
      } catch {
        /* no open transaction */
      }
      throw error;
    }
  });

  router.post("/proposals/:id/dismiss", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const proposal = getProposal<StoredPayload>(db, user.id, req.params.id);
    if (!proposal) throw notFound("Proposal not found.");
    // AT28/REV-012: dismissal is only meaningful — and only audited — for a proposal that is still
    // waiting. Dismissing a committed/expired one must never write a "nothing changed" entry.
    if (proposal.status !== "pending") {
      throw conflictError(`This proposal is already ${proposal.status}; it cannot be dismissed.`, {
        currentStatus: proposal.status,
      });
    }
    resolveProposal(db, user.id, proposal.id, "dismissed");
    recordAudit(db, {
      userId: user.id,
      actor: "user",
      action: "proposal.dismiss",
      entityType: "proposal",
      entityId: proposal.id,
      before: { status: proposal.status },
      after: { status: "dismissed" },
      reason: "Dismissed without applying any change",
      proposalId: proposal.id,
      undoable: false,
    });
    res.json({ proposal: getProposal<StoredPayload>(db, user.id, proposal.id) });
  });

  router.get("/proposals", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const records = listProposals<StoredPayload>(db, user.id, status);
    const titles = new Map(listTasks(db, user.id).map((task) => [task.id, task.title]));
    res.json({ proposals: records.map((record) => describeProposal(record, titles)) });
  });

  /**
   * "Need more time" recovery (spec F6/F8, AT24, AT26, AT27).
   * The task's own future sessions are returned to the pool and re-placed; nothing else moves.
   */
  router.post("/need-more", (req, res) => {
    const user = (req as unknown as AuthedRequest).user;
    const taskId = optionalString(req.body?.taskId, "taskId", 64);
    if (!taskId) throw badRequest("taskId is required.");
    const task = requireTask(db, user.id, taskId);
    const extra = optionalInt(req.body?.extraMinutes, "extraMinutes", 0, 100000);
    const explicitRemaining = optionalInt(req.body?.remainingMinutes, "remainingMinutes", 0, 100000);
    if (extra === undefined && explicitRemaining === undefined) {
      throw badRequest("Provide extraMinutes or remainingMinutes.");
    }
    const nextRemaining = explicitRemaining ?? task.remainingMinutes + (extra ?? 0);
    if (nextRemaining <= 0) {
      throw badRequest("There is no remaining effort to place.");
    }

    const now = Date.now();
    const horizonEnd = task.dueAt !== null ? Math.max(task.dueAt, now + 3 * DAY_MS) : now + 7 * DAY_MS;
    const futureBlocks = listBlocks(db, user.id, now, horizonEnd, task.id).filter((block) => block.status === "planned");
    const context = buildScheduleContext(user, db, now, horizonEnd);
    const others = listTasks(db, user.id).filter(
      (candidate) => candidate.id !== task.id && candidate.status !== "completed" && candidate.status !== "cancelled" && candidate.remainingMinutes > 0,
    );

    const schedulerTask: SchedulerTask = {
      ...toSchedulerTask(task),
      remainingMinutes: nextRemaining,
      earliestStart: now,
    };
    const input: SchedulerInput = {
      now,
      horizon: { start: now, end: horizonEnd },
      tasks: [schedulerTask, ...others.map(toSchedulerTask)],
      workingWindows: context.workingWindows,
      softRest: context.softRest,
      busy: context.busy,
      releaseableBlockIds: futureBlocks.map((block) => block.id),
      allowLockedOverride: false,
    };
    const result = generateProposals(input);
    const baseRevisions = baseRevisionMap(db, user.id, input);
    const titles = new Map([...others, task].map((item) => [item.id, item.title]));
    const atRiskIds = [...others, task]
      .filter((item) => item.dueAt !== null && item.dueAt - now < 48 * 60 * 60 * 1000)
      .map((item) => item.id);

    const saved = result.proposals.map((proposal) => {
      const payload: StoredPayload = {
        strategy: proposal.strategy,
        placements: proposal.placements.map((placement) => ({ taskId: placement.taskId, startAt: placement.start, endAt: placement.end })),
        releaseBlockIds: proposal.releases.map((release) => release.blockId),
        reasons: proposal.reasons,
        metrics: proposal.metrics,
        feasibility: result.feasibility,
        impact: {
          movedBlocks: proposal.releases.length,
          addedBlocks: proposal.placements.length,
          tasksTouched: [...new Set(proposal.placements.map((placement) => placement.taskId))],
          atRiskTaskIds: atRiskIds,
        },
      };
      const record = saveProposal<StoredPayload>(db, user.id, {
        kind: "recovery",
        strategy: proposal.strategy,
        payload,
        baseRevisions,
        trigger: `need-more-time on ${task.title}`,
        ttlMs: PROPOSAL_TTL_MS,
      });
      recordAudit(db, {
        userId: user.id,
        actor: "agent",
        action: "agent.recovery.proposal",
        entityType: "proposal",
        entityId: record.id,
        before: { remaining: task.remainingMinutes },
        after: { remaining: nextRemaining, placements: payload.placements, releases: payload.releaseBlockIds },
        reason: `Need more time: +${nextRemaining - task.remainingMinutes} min`,
        proposalId: record.id,
        undoable: false,
      });
      return describeProposal(record, titles);
    });

    // REV-008: the envelope describes the *representative* (first) proposal — summing over mutually
    // exclusive alternatives would double-count blocks and claim only one task is touched while the
    // chosen plan may move several (AT27).
    const representative = result.proposals[0] ?? null;
    res.json({
      proposals: saved,
      feasibility: result.feasibility,
      impact: {
        movedBlocks: representative ? representative.releases.length : 0,
        addedBlocks: representative ? representative.placements.length : 0,
        tasksTouched: representative ? [...new Set(representative.placements.map((placement) => placement.taskId))] : [],
        atRiskTaskIds: atRiskIds,
      },
    });
  });

  return router;
}

interface CommitResponse {
  proposalId: string;
  applied: string[];
  released: string[];
  auditId: string;
  undoable: boolean;
  revisions: Record<string, number>;
}

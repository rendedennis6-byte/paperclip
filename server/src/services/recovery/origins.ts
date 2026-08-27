export const RECOVERY_ORIGIN_KINDS = {
  issueGraphLivenessEscalation: "harness_liveness_escalation",
  issueProductivityReview: "issue_productivity_review",
  strandedIssueRecovery: "stranded_issue_recovery",
  staleActiveRunEvaluation: "stale_active_run_evaluation",
} as const;

export const RECOVERY_REASON_KINDS = {
  runLivenessContinuation: "run_liveness_continuation",
} as const;

export const RECOVERY_KEY_PREFIXES = {
  issueGraphLivenessIncident: "harness_liveness",
  issueGraphLivenessLeaf: "harness_liveness_leaf",
} as const;

export type RecoveryOriginKind = typeof RECOVERY_ORIGIN_KINDS[keyof typeof RECOVERY_ORIGIN_KINDS];
export type RecoveryReasonKind = typeof RECOVERY_REASON_KINDS[keyof typeof RECOVERY_REASON_KINDS];
export type RecoveryKeyPrefix = typeof RECOVERY_KEY_PREFIXES[keyof typeof RECOVERY_KEY_PREFIXES];

const RECOVERY_SOURCE_MAX_DEPTH = 25;

function issueIdFromContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const context = value as Record<string, unknown>;
  for (const key of ["sourceIssueId", "issueId", "taskId", "taskKey"]) {
    if (typeof context[key] === "string" && context[key]) return context[key] as string;
  }
  return null;
}

export function recoveryActionFingerprint(input: {
  sourceIssueId: string;
  signalFamily: string;
  dominantPreflightCause: string;
  workspaceId?: string | null;
}) {
  return ["recovery-action", input.sourceIssueId, input.signalFamily,
    input.dominantPreflightCause, input.workspaceId ?? "none"].join(":");
}

export async function resolveCanonicalRecoverySourceIssue(db: Db, initialIssue: typeof issues.$inferSelect | null) {
  let current = initialIssue;
  const visited = new Set<string>();
  for (let depth = 0; current && depth < RECOVERY_SOURCE_MAX_DEPTH; depth += 1) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (!Object.values(RECOVERY_ORIGIN_KINDS).includes(current.originKind as RecoveryOriginKind)) return current;
    let sourceIssueId: string | null = null;
    if (current.originKind === RECOVERY_ORIGIN_KINDS.staleActiveRunEvaluation) {
      const runId = current.originRunId ?? current.originId;
      if (runId) {
        const [run] = await db.select({ contextSnapshot: heartbeatRuns.contextSnapshot }).from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.companyId, current.companyId), eq(heartbeatRuns.id, runId))).limit(1);
        sourceIssueId = issueIdFromContext(run?.contextSnapshot);
      }
    } else sourceIssueId = current.originId;
    if (!sourceIssueId) return null;
    const [source] = await db.select().from(issues)
      .where(and(eq(issues.companyId, current.companyId), eq(issues.id, sourceIssueId))).limit(1);
    current = source ?? null;
  }
  return null;
}

export function isStrandedIssueRecoveryOriginKind(originKind: string | null | undefined) {
  return originKind === RECOVERY_ORIGIN_KINDS.strandedIssueRecovery;
}

export function buildIssueGraphLivenessIncidentKey(input: {
  companyId: string;
  issueId: string;
  state: string;
  blockerIssueId?: string | null;
  participantAgentId?: string | null;
}) {
  return [
    RECOVERY_KEY_PREFIXES.issueGraphLivenessIncident,
    input.companyId,
    input.issueId,
    input.state,
    input.blockerIssueId ?? input.participantAgentId ?? "none",
  ].join(":");
}

export function parseIssueGraphLivenessIncidentKey(incidentKey: string | null | undefined) {
  if (!incidentKey) return null;
  const parts = incidentKey.split(":");
  if (parts.length !== 5 || parts[0] !== RECOVERY_KEY_PREFIXES.issueGraphLivenessIncident) return null;
  const [, companyId, issueId, state, leafIssueId] = parts;
  if (!companyId || !issueId || !state || !leafIssueId) return null;
  return { companyId, issueId, state, leafIssueId };
}

export function buildIssueGraphLivenessLeafKey(input: {
  companyId: string;
  state: string;
  leafIssueId: string;
}) {
  return [
    RECOVERY_KEY_PREFIXES.issueGraphLivenessLeaf,
    input.companyId,
    input.state,
    input.leafIssueId,
  ].join(":");
}
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, issues } from "@paperclipai/db";

// The resolution model as the UI sees it. Mirrors the transitions enforced
// server-side by record_finding_action() / sync_tracked_findings() in
// supabase/migrations/20260921000500_resolution_history.sql — the database is
// the authority; this module only decides what to offer and how to describe it.
// The public demo drives the same model client-side.

import type { FindingResolutionRow, ResolutionAction, TrackedStatus } from "./dbTypes";

export type UserAction = "review_started" | "remediation_recorded" | "accepted_risk" | "dismissed_false_positive" | "reopened" | "note";

export const STATUS_LABEL: Record<TrackedStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  accepted_risk: "Accepted risk",
  dismissed_false_positive: "Dismissed as false positive",
};

export const STATUS_TONE: Record<TrackedStatus, "neutral" | "review" | "clear" | "common" | "quiet"> = {
  open: "neutral",
  in_review: "review",
  resolved: "clear",
  accepted_risk: "common",
  dismissed_false_positive: "quiet",
};

export interface ActionSpec {
  action: UserAction;
  label: string;
  description: string;
  requiresReason: boolean;
  reasonPrompt?: string;
  acceptsRevision?: boolean;
}

export const ACTIONS: Record<UserAction, ActionSpec> = {
  review_started: {
    action: "review_started",
    label: "Start review",
    description: "Tell your team someone is looking at this.",
    requiresReason: false,
  },
  remediation_recorded: {
    action: "remediation_recorded",
    label: "Record a fix",
    description: "You replaced or rewrote the code. PoryGen verifies it on the next scan.",
    requiresReason: false,
    reasonPrompt: "What changed? (optional)",
    acceptsRevision: true,
  },
  dismissed_false_positive: {
    action: "dismissed_false_positive",
    label: "Dismiss as false positive",
    description: "Independent work or an unavoidable idiom. Stays dismissed across rescans.",
    requiresReason: true,
    reasonPrompt: "Why is this a false positive?",
  },
  accepted_risk: {
    action: "accepted_risk",
    label: "Accept the risk",
    description: "Keep the code and meet the license terms. Your reason is kept with the finding.",
    requiresReason: true,
    reasonPrompt: "Why is this acceptable?",
  },
  reopened: {
    action: "reopened",
    label: "Reopen",
    description: "Put this finding back in the open queue.",
    requiresReason: false,
  },
  note: {
    action: "note",
    label: "Add a note",
    description: "Leave context for whoever looks next.",
    requiresReason: true,
    reasonPrompt: "Note",
  },
};

/** The user actions the server will accept from `status` (see record_finding_action). */
export function allowedActions(status: TrackedStatus): UserAction[] {
  switch (status) {
    case "open":
      return ["review_started", "remediation_recorded", "dismissed_false_positive", "accepted_risk", "note"];
    case "in_review":
      return ["remediation_recorded", "dismissed_false_positive", "accepted_risk", "note"];
    case "accepted_risk":
    case "dismissed_false_positive":
      return ["reopened", "note"];
    case "resolved":
      return ["note"];
  }
}

export const HISTORY_LABEL: Record<ResolutionAction, string> = {
  detected: "Detected",
  review_started: "Review started",
  remediation_recorded: "Fix recorded",
  rescan_still_detected: "Rescan still detects it",
  rescan_clean: "Clean rescan — resolved",
  reopened: "Reopened",
  accepted_risk: "Risk accepted",
  dismissed_false_positive: "Dismissed as false positive",
  note: "Note",
};

export type StageKey = "found" | "reviewed" | "remediated" | "rescanned" | "resolved";

export interface Stage {
  key: StageKey;
  label: string;
  done: boolean;
  at: string | null;
}

type HistoryLike = Pick<FindingResolutionRow, "action" | "actor_kind" | "created_at" | "to_status">;

/**
 * FOUND → REVIEWED → REMEDIATED → RESCANNED → RESOLVED, derived from the
 * history rows. Any user decision counts as reviewed. Only the latest cycle
 * counts: a reopen restarts everything after "found".
 */
export function stagesFromHistory(history: HistoryLike[]): Stage[] {
  const sorted = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let cycle = sorted;
  const lastReopen = sorted.map((h) => h.action).lastIndexOf("reopened");
  if (lastReopen >= 0) cycle = sorted.slice(lastReopen);

  const first = (predicate: (h: HistoryLike) => boolean) => cycle.find(predicate)?.created_at ?? null;
  const found = sorted.find((h) => h.action === "detected")?.created_at ?? null;
  const reviewed = first((h) => h.actor_kind === "user" && h.action !== "note");
  const remediated = first((h) => h.action === "remediation_recorded");
  const rescanned = first((h) => h.action === "rescan_clean" || h.action === "rescan_still_detected");
  const resolved = first((h) => h.to_status === "resolved");

  return [
    { key: "found", label: "Found", done: found !== null, at: found },
    { key: "reviewed", label: "Reviewed", done: reviewed !== null, at: reviewed },
    { key: "remediated", label: "Remediated", done: remediated !== null, at: remediated },
    { key: "rescanned", label: "Rescanned", done: rescanned !== null, at: rescanned },
    { key: "resolved", label: "Resolved", done: resolved !== null, at: resolved },
  ];
}

// Row shapes matching supabase/migrations exactly (snake_case, as returned
// by supabase-js) — see docs/DATA_MODEL.md.

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export type RepositoryProvider = "github" | "demo";
export type Visibility = "public" | "private";

export interface RepositoryRow {
  id: string;
  owner_id: string;
  name: string;
  provider: RepositoryProvider;
  clone_url: string;
  default_branch: string;
  visibility: Visibility;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  last_scanned_at: string | null;
}

export type ScanStatus =
  | "queued"
  | "ingesting"
  | "indexing"
  | "normalizing_ast"
  | "fingerprinting"
  | "analyzing_licenses"
  | "building_provenance_summary"
  | "complete"
  | "failed";

export type RiskLevel = "clear" | "review" | "blocking" | "unknown";

export interface ProviderCoverageJson {
  providerId: string;
  providerName: string;
  corpusName: string;
  corpusVersion: string;
  scope: string;
  entryCount: number;
  languages: string[];
  claim: string;
  limitations: string[];
}

/**
 * summary_json. Fields after `sbom` were added by pipeline 2026.09 and are
 * absent on older scans, so every reader must treat them as optional.
 */
export interface ScanSummaryJson {
  languages: string[];
  referenceFingerprintsChecked: number;
  clearFindings: number;
  reviewFindings: number;
  blockingFindings: number;
  provenanceCoveragePercent: number;
  terminalLog: string[];
  provenanceComposition: {
    human: number;
    ai: number;
    humanModifiedAi: number;
    unknown: number;
  };
  repoContentHash?: string;
  sbom?: unknown;
  pipelineVersion?: string;
  normalizer?: string;
  coverage?: ProviderCoverageJson[];
  providersRun?: string[];
  checkedPaths?: string[];
  ingestedPaths?: string[];
  manifestsChecked?: string[];
  findingsTruncated?: boolean;
  similarity?: { clear: number; commonPattern: number; reviewSuggested: number; strongMatch: number };
}

export interface ScanRow {
  id: string;
  repository_id: string;
  owner_id: string;
  status: ScanStatus;
  policy_version: string;
  started_at: string;
  finished_at: string | null;
  files_scanned: number;
  dependencies_scanned: number;
  risk_level: RiskLevel | null;
  summary_json: ScanSummaryJson;
  error_code: string | null;
  created_at: string;
}

export type FindingType = "license" | "structural_similarity" | "provenance_mix" | "policy";
export type FindingSeverity = "info" | "review" | "blocking";

export interface ScanFindingRow {
  id: string;
  scan_id: string;
  type: FindingType;
  severity: FindingSeverity;
  title: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  confidence: number | null;
  evidence_json: Record<string, unknown>;
  remediation: string | null;
  created_at: string;
  /** Stable identity across scans; null on rows written before the resolution-history migration. */
  finding_key?: string | null;
}

export type TrackedStatus = "open" | "in_review" | "resolved" | "accepted_risk" | "dismissed_false_positive";
export type SimilarityBand = "common_pattern" | "review_suggested" | "strong_match";

export interface TrackedFindingRow {
  id: string;
  repository_id: string;
  owner_id: string;
  finding_key: string;
  type: FindingType;
  provider_id: string | null;
  title: string;
  file_path: string | null;
  severity: FindingSeverity;
  band: SimilarityBand | null;
  status: TrackedStatus;
  remediation_pending: boolean;
  first_scan_id: string | null;
  last_seen_scan_id: string | null;
  latest_finding_id: string | null;
  resolved_scan_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ResolutionAction =
  | "detected"
  | "review_started"
  | "remediation_recorded"
  | "rescan_still_detected"
  | "rescan_clean"
  | "reopened"
  | "accepted_risk"
  | "dismissed_false_positive"
  | "note";

export interface FindingResolutionRow {
  id: string;
  tracked_finding_id: string;
  repository_id: string;
  owner_id: string;
  actor_kind: "user" | "system";
  actor_id: string | null;
  action: ResolutionAction;
  from_status: TrackedStatus | null;
  to_status: TrackedStatus;
  note: string | null;
  scan_id: string | null;
  rescan_scan_id: string | null;
  revision: string | null;
  created_at: string;
}

export type ProvenanceSourceType = "human" | "ai" | "imported" | "generated" | "unknown";
export type ProvenanceActorType = "developer" | "assistant" | "automation" | "external";

export interface ProvenanceEventRow {
  id: string;
  owner_id: string;
  repository_id: string;
  source_type: ProvenanceSourceType;
  actor_type: ProvenanceActorType;
  provider: string | null;
  tool: string | null;
  file_path: string;
  commit_sha: string | null;
  parent_event_id: string | null;
  content_hash: string;
  diff_hash: string | null;
  event_timestamp: string;
  metadata_json: Record<string, unknown>;
  previous_event_hash: string | null;
  event_hash: string;
  created_at: string;
}

export interface BillingCustomerRow {
  user_id: string;
  stripe_customer_id: string | null;
  apex_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingEventRow {
  id: string;
  stripe_event_id: string;
  user_id: string | null;
  event_type: string;
  stripe_customer_id: string | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  price_id: string | null;
  received_at: string;
  processed_at: string | null;
  payload_summary_json: Record<string, unknown>;
}

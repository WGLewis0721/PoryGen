import { supabase } from "./supabaseClient";
import type {
  RepositoryRow,
  ScanRow,
  ScanFindingRow,
  ProvenanceEventRow,
  BillingCustomerRow,
  BillingEventRow,
  TrackedFindingRow,
  FindingResolutionRow,
  TrackedStatus,
} from "./dbTypes";
import type { UserAction } from "./resolution";

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured in this environment.");
  return supabase;
}

/** Thrown when a feature's tables/functions aren't deployed yet (resolution-history migration pending). */
export class FeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} isn't enabled on this deployment yet.`);
    this.name = "FeatureUnavailableError";
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/** 42P01 undefined_table / 42883 undefined_function from Postgres; PGRST202/205 from PostgREST's schema cache. */
export function isMissingRelation(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "");
}

function rethrow(error: PostgrestLikeError, feature: string): never {
  if (isMissingRelation(error)) throw new FeatureUnavailableError(feature);
  throw error;
}

export async function listRepositories(): Promise<RepositoryRow[]> {
  const { data, error } = await requireClient()
    .from("repositories")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as RepositoryRow[];
}

export async function feedRepository(repositoryUrl: string): Promise<{ scanId: string; repositoryId: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("scan-repository", {
    body: { repositoryUrl },
  });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (context?.json) {
      const body = await context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as { scanId: string; repositoryId: string };
}

export async function getScan(scanId: string): Promise<ScanRow | null> {
  const { data, error } = await requireClient().from("scans").select("*").eq("id", scanId).maybeSingle();
  if (error) throw error;
  return data as ScanRow | null;
}

export async function getRepository(repositoryId: string): Promise<RepositoryRow | null> {
  const { data, error } = await requireClient()
    .from("repositories")
    .select("*")
    .eq("id", repositoryId)
    .maybeSingle();
  if (error) throw error;
  return data as RepositoryRow | null;
}

const SEVERITY_RANK: Record<ScanFindingRow["severity"], number> = { blocking: 0, review: 1, info: 2 };

export async function listFindings(scanId: string): Promise<ScanFindingRow[]> {
  const { data, error } = await requireClient()
    .from("scan_findings")
    .select("*")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ScanFindingRow[]).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export async function getFinding(scanId: string, findingId: string): Promise<ScanFindingRow | null> {
  const { data, error } = await requireClient()
    .from("scan_findings")
    .select("*")
    .eq("scan_id", scanId)
    .eq("id", findingId)
    .maybeSingle();
  if (error) throw error;
  return data as ScanFindingRow | null;
}

export async function listScansForRepository(repositoryId: string): Promise<ScanRow[]> {
  const { data, error } = await requireClient()
    .from("scans")
    .select("*")
    .eq("repository_id", repositoryId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as ScanRow[];
}

export async function listLatestScans(limit = 20): Promise<ScanRow[]> {
  const { data, error } = await requireClient()
    .from("scans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as ScanRow[];
}

export async function listFindingsForScans(scanIds: string[]): Promise<ScanFindingRow[]> {
  if (scanIds.length === 0) return [];
  const { data, error } = await requireClient().from("scan_findings").select("*").in("scan_id", scanIds);
  if (error) throw error;
  return data as ScanFindingRow[];
}

/** The user's own scans since `since` (the public sample repository's scans are readable too, so filter by owner). Display only. */
export async function countScansSince(ownerId: string, since: Date): Promise<number> {
  const { count, error } = await requireClient()
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

const RESOLUTION_FEATURE = "Resolution history";

export async function listTrackedFindings(filter: { repositoryId?: string; statuses?: TrackedStatus[] } = {}): Promise<TrackedFindingRow[]> {
  let query = requireClient().from("tracked_findings").select("*").order("updated_at", { ascending: false });
  if (filter.repositoryId) query = query.eq("repository_id", filter.repositoryId);
  if (filter.statuses?.length) query = query.in("status", filter.statuses);
  const { data, error } = await query;
  if (error) rethrow(error, RESOLUTION_FEATURE);
  return data as TrackedFindingRow[];
}

export async function getTrackedFindingByKey(repositoryId: string, findingKey: string): Promise<TrackedFindingRow | null> {
  const { data, error } = await requireClient()
    .from("tracked_findings")
    .select("*")
    .eq("repository_id", repositoryId)
    .eq("finding_key", findingKey)
    .maybeSingle();
  if (error) rethrow(error, RESOLUTION_FEATURE);
  return data as TrackedFindingRow | null;
}

export async function listFindingResolutions(trackedFindingId: string): Promise<FindingResolutionRow[]> {
  const { data, error } = await requireClient()
    .from("finding_resolutions")
    .select("*")
    .eq("tracked_finding_id", trackedFindingId)
    .order("created_at", { ascending: true });
  if (error) rethrow(error, RESOLUTION_FEATURE);
  return data as FindingResolutionRow[];
}

export interface ResolutionActivity extends FindingResolutionRow {
  tracked_findings: Pick<TrackedFindingRow, "title" | "file_path" | "repository_id" | "latest_finding_id" | "last_seen_scan_id"> | null;
}

export async function listRecentResolutions(limit = 12): Promise<ResolutionActivity[]> {
  const { data, error } = await requireClient()
    .from("finding_resolutions")
    .select("*, tracked_findings(title, file_path, repository_id, latest_finding_id, last_seen_scan_id)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) rethrow(error, RESOLUTION_FEATURE);
  return data as ResolutionActivity[];
}

export async function recordFindingAction(params: {
  trackedFindingId: string;
  action: UserAction;
  note?: string | null;
  revision?: string | null;
}): Promise<TrackedFindingRow> {
  const { data, error } = await requireClient().rpc("record_finding_action", {
    p_tracked_finding_id: params.trackedFindingId,
    p_action: params.action,
    p_note: params.note ?? null,
    p_revision: params.revision ?? null,
  });
  if (error) rethrow(error, RESOLUTION_FEATURE);
  return data as TrackedFindingRow;
}

export async function listProvenanceEvents(repositoryId: string): Promise<ProvenanceEventRow[]> {
  const { data, error } = await requireClient()
    .from("provenance_events")
    .select("*")
    .eq("repository_id", repositoryId)
    .order("event_timestamp", { ascending: true });
  if (error) throw error;
  return data as ProvenanceEventRow[];
}

export async function getBillingCustomer(userId: string): Promise<BillingCustomerRow | null> {
  const { data, error } = await requireClient()
    .from("billing_customers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as BillingCustomerRow | null;
}

export async function listBillingEvents(userId: string): Promise<BillingEventRow[]> {
  const { data, error } = await requireClient()
    .from("billing_events")
    .select("*")
    .eq("user_id", userId)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return data as BillingEventRow[];
}

export interface BillingDiagnostics {
  stripeConfigured: boolean;
  stripeEnvironment: "sandbox/test" | "live" | "unknown";
  stripeAccountId: string | null;
  /** Legacy field: the APEX dogfood one-time price (formerly labelled "Pro"). */
  stripeProPriceId: string | null;
  webhookSecretConfigured: boolean;
  apexCustomerIdConfigured: boolean;
  apexCustomerId: string | null;
  /** Present once billing-diagnostics is redeployed with plan separation. */
  prices?: {
    proMonthly: string | null;
    teamMonthly: string | null;
    apexDogfood: string | null;
  };
}

export async function getBillingDiagnostics(): Promise<BillingDiagnostics> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("billing-diagnostics", { body: {} });
  if (error) throw error;
  return data as BillingDiagnostics;
}

export type CheckoutPlan = "pro" | "team" | "apex_dogfood";

export async function createCheckoutSession(plan: CheckoutPlan): Promise<{ url: string } | { error: string; code?: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("create-checkout", { body: { plan } });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string; code?: string }> } }).context;
    if (context?.json) {
      const body = await context.json().catch(() => null);
      if (body?.error) return { error: body.error, code: body.code };
    }
    return { error: error.message };
  }
  return data;
}

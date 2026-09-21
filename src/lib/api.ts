import { supabase } from "./supabaseClient";
import type {
  RepositoryRow,
  ScanRow,
  ScanFindingRow,
  ProvenanceEventRow,
  BillingCustomerRow,
  BillingEventRow,
} from "./dbTypes";

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured in this environment.");
  return supabase;
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
  stripeProPriceId: string | null;
  webhookSecretConfigured: boolean;
  apexCustomerIdConfigured: boolean;
  apexCustomerId: string | null;
}

export async function getBillingDiagnostics(): Promise<BillingDiagnostics> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("billing-diagnostics", { body: {} });
  if (error) throw error;
  return data as BillingDiagnostics;
}

export async function createCheckoutSession(): Promise<{ url: string } | { error: string; code?: string }> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("create-checkout", { body: {} });
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

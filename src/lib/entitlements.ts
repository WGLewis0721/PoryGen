// Entitlement boundary. PoryGen's standalone demo tracks scan credits
// locally for display purposes — it does not implement a second
// production-grade entitlement ledger that competes with APEX. This
// interface is the seam: swap the local provider for a real APEX-backed one
// once APEX's own SDK and credentials are deliberately wired in. See
// docs/APEX_DOGFOOD.md.

export interface Entitlements {
  plan: "community" | "pro";
  scanCreditsRemaining: number;
  scanCreditsTotal: number;
}

export interface EntitlementProvider {
  getEntitlements(userId: string): Promise<Entitlements>;
  /** `idempotencyKey` must make repeated calls (e.g. a retried request) safe to no-op. */
  consumeScanCredit(userId: string, idempotencyKey: string): Promise<{ ok: boolean; entitlements: Entitlements }>;
}

const COMMUNITY_MONTHLY_CREDITS = 3;
const STORAGE_PREFIX = "porygen.demo-entitlements.";

interface StoredState {
  plan: "community" | "pro";
  consumedThisPeriod: number;
  consumedIdempotencyKeys: string[];
}

function loadState(userId: string): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (raw) return JSON.parse(raw) as StoredState;
  } catch {
    // localStorage can throw (private browsing, blocked storage) — fall through to defaults
  }
  return { plan: "community", consumedThisPeriod: 0, consumedIdempotencyKeys: [] };
}

function saveState(userId: string, state: StoredState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(state));
  } catch {
    // best-effort only — this is demo display state, not a real quota enforcement path
  }
}

function toEntitlements(state: StoredState): Entitlements {
  const total = state.plan === "pro" ? 1000 : COMMUNITY_MONTHLY_CREDITS;
  return {
    plan: state.plan,
    scanCreditsTotal: total,
    scanCreditsRemaining: Math.max(0, total - state.consumedThisPeriod),
  };
}

/**
 * Local, display-only demo quota. Not a security boundary: real scan
 * authorization is enforced by Supabase RLS (a user can only create scans
 * for their own repositories), not by this client-visible counter.
 */
export class LocalDemoEntitlementProvider implements EntitlementProvider {
  async getEntitlements(userId: string): Promise<Entitlements> {
    return toEntitlements(loadState(userId));
  }

  async consumeScanCredit(userId: string, idempotencyKey: string) {
    const state = loadState(userId);
    if (state.consumedIdempotencyKeys.includes(idempotencyKey)) {
      return { ok: true, entitlements: toEntitlements(state) };
    }
    const entitlements = toEntitlements(state);
    if (entitlements.scanCreditsRemaining <= 0) {
      return { ok: false, entitlements };
    }
    state.consumedThisPeriod += 1;
    state.consumedIdempotencyKeys = [...state.consumedIdempotencyKeys, idempotencyKey].slice(-200);
    saveState(userId, state);
    return { ok: true, entitlements: toEntitlements(state) };
  }
}

/**
 * Future binding — intentionally not implemented. Wiring this up requires
 * APEX's own SDK, credentials, and the customer mapping described in
 * docs/APEX_DOGFOOD.md. Never fake this integration; if this class is ever
 * instantiated without that real wiring, fail loudly rather than silently
 * behaving like the local provider.
 */
export class ApexEntitlementProvider implements EntitlementProvider {
  async getEntitlements(): Promise<Entitlements> {
    throw new Error("ApexEntitlementProvider is not wired up in this build — see docs/APEX_DOGFOOD.md.");
  }
  async consumeScanCredit(): Promise<{ ok: boolean; entitlements: Entitlements }> {
    throw new Error("ApexEntitlementProvider is not wired up in this build — see docs/APEX_DOGFOOD.md.");
  }
}

export const entitlementProvider: EntitlementProvider = new LocalDemoEntitlementProvider();

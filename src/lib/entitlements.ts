// Plan entitlements, derived from verified Stripe webhook rows (billing_events)
// and real scan counts. Display-only today: limits are shown, not enforced —
// scan authorization is Supabase RLS, and paid checkout isn't open yet.
//
// Two concerns are deliberately separate:
//   * customer plans (Free / Pro / Team) — resolved from subscription events
//     whose metadata carries porygen_plan = "pro" | "team";
//   * the APEX dogfood SKU — a one-time sandbox payment that must never grant a
//     plan. Its credit ledger belongs to APEX (see docs/APEX_DOGFOOD.md), so
//     PoryGen only exposes the seam below and never fakes that integration.

import { planById, type PlanId } from "../config/plans";
import type { BillingEventRow } from "./dbTypes";

export interface PlanState {
  plan: PlanId;
  /** "webhook" when a verified Stripe event set the plan; "default" when nothing has. */
  source: "webhook" | "default";
  /** Completed APEX dogfood checkouts (operator tests) — shown on diagnostics, never a plan. */
  apexTestPurchases: number;
}

const ENDED_SUBSCRIPTION_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

function summaryField(event: BillingEventRow, key: string): string | null {
  const value = (event.payload_summary_json ?? {})[key];
  return typeof value === "string" ? value : null;
}

/** Replays verified webhook events in order. Anything without explicit Pro/Team metadata never grants a plan. */
export function derivePlan(events: BillingEventRow[]): PlanState {
  const ordered = [...events].sort((a, b) => a.received_at.localeCompare(b.received_at));
  let plan: PlanId = "free";
  let source: PlanState["source"] = "default";
  let apexTestPurchases = 0;

  for (const event of ordered) {
    const tagged = summaryField(event, "porygen_plan");
    const isPaidPlan = tagged === "pro" || tagged === "team";
    if (event.event_type === "checkout.session.completed") {
      if (isPaidPlan && summaryField(event, "mode") !== "payment") {
        plan = tagged as PlanId;
        source = "webhook";
      } else if (!isPaidPlan) {
        // Before plan separation, the only SKU was the APEX $19 pack; untagged
        // completions are that test, not a subscription.
        apexTestPurchases++;
      }
    } else if (event.event_type === "customer.subscription.deleted") {
      plan = "free";
      source = "webhook";
    } else if (event.event_type === "customer.subscription.updated" || event.event_type === "customer.subscription.created") {
      const status = summaryField(event, "subscription_status");
      if (status && ENDED_SUBSCRIPTION_STATUSES.has(status)) {
        plan = "free";
        source = "webhook";
      } else if (isPaidPlan && (status === "active" || status === "trialing")) {
        plan = tagged as PlanId;
        source = "webhook";
      }
    }
  }
  return { plan, source, apexTestPurchases };
}

export interface UsageReadout {
  plan: PlanId;
  scansThisMonth: number;
  scansIncluded: number;
  repositories: number;
  repositoriesIncluded: number;
  overScans: boolean;
  overRepositories: boolean;
}

export function usageReadout(plan: PlanId, scansThisMonth: number, repositories: number): UsageReadout {
  const limits = planById(plan).limits;
  return {
    plan,
    scansThisMonth,
    scansIncluded: limits.scansPerMonth,
    repositories,
    repositoriesIncluded: limits.repositories,
    overScans: scansThisMonth > limits.scansPerMonth,
    overRepositories: repositories > limits.repositories,
  };
}

export function startOfMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * APEX credit seam — intentionally not implemented. Wiring it requires APEX's
 * own SDK, credentials, and the customer mapping in docs/APEX_DOGFOOD.md. If
 * this is ever instantiated without that wiring it fails loudly rather than
 * pretending to be a ledger.
 */
export interface ApexCreditProvider {
  getCredits(apexCustomerId: string): Promise<number>;
}

export class UnwiredApexCreditProvider implements ApexCreditProvider {
  async getCredits(): Promise<number> {
    throw new Error("APEX credit provider is not wired up in this build — see docs/APEX_DOGFOOD.md.");
  }
}

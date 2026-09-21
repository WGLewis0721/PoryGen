import { describe, expect, it } from "vitest";
import { derivePlan, startOfMonth, usageReadout } from "./entitlements";
import type { BillingEventRow } from "./dbTypes";

let n = 0;
function event(type: string, summary: Record<string, unknown>, at: string): BillingEventRow {
  n += 1;
  return {
    id: `e${n}`,
    stripe_event_id: `evt_${n}`,
    user_id: "u1",
    event_type: type,
    stripe_customer_id: "cus_1",
    checkout_session_id: null,
    payment_intent_id: null,
    price_id: null,
    received_at: at,
    processed_at: at,
    payload_summary_json: summary,
  };
}

describe("derivePlan", () => {
  it("is Free with no verified events", () => {
    expect(derivePlan([])).toEqual({ plan: "free", source: "default", apexTestPurchases: 0 });
  });

  it("never grants a plan for the APEX dogfood purchase", () => {
    const state = derivePlan([event("checkout.session.completed", { porygen_plan: "apex_dogfood", mode: "payment" }, "2026-09-01T00:00:00Z")]);
    expect(state.plan).toBe("free");
    expect(state.apexTestPurchases).toBe(1);
  });

  it("treats untagged legacy completions as the APEX test, not a subscription", () => {
    const state = derivePlan([event("checkout.session.completed", { payment_status: "paid" }, "2026-09-01T00:00:00Z")]);
    expect(state).toMatchObject({ plan: "free", apexTestPurchases: 1 });
  });

  it("grants Pro from a verified subscription checkout and drops it on cancellation", () => {
    const start = event("checkout.session.completed", { porygen_plan: "pro", mode: "subscription" }, "2026-09-02T00:00:00Z");
    expect(derivePlan([start]).plan).toBe("pro");
    const cancelled = event("customer.subscription.deleted", { porygen_plan: "pro", subscription_status: "canceled" }, "2026-09-20T00:00:00Z");
    expect(derivePlan([cancelled, start]).plan).toBe("free");
  });

  it("follows subscription updates between plans", () => {
    const events = [
      event("checkout.session.completed", { porygen_plan: "pro", mode: "subscription" }, "2026-09-02T00:00:00Z"),
      event("customer.subscription.updated", { porygen_plan: "team", subscription_status: "active" }, "2026-09-05T00:00:00Z"),
    ];
    expect(derivePlan(events)).toMatchObject({ plan: "team", source: "webhook" });
  });
});

describe("usage readout", () => {
  it("reports usage against plan limits without enforcing them", () => {
    expect(usageReadout("free", 4, 1)).toMatchObject({ scansIncluded: 3, overScans: true, overRepositories: false });
  });

  it("starts the month in UTC", () => {
    expect(startOfMonth(new Date("2026-09-21T15:00:00Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

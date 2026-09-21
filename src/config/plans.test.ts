import { describe, expect, it } from "vitest";
import { DILIGENCE_PACK, ENTERPRISE, PLANS, planById } from "./plans";
import { APEX_DOGFOOD_SKU } from "./apexDogfood";

describe("commercial plans", () => {
  it("offers Free, Pro, and Team at the agreed prices", () => {
    expect(PLANS.map((p) => [p.id, p.priceLabel, p.cadence])).toEqual([
      ["free", "$0", "forever"],
      ["pro", "$49", "per month"],
      ["team", "$199", "per month"],
    ]);
    expect(planById("pro").limits.repositories).toBe(5);
    expect(planById("team").limits.repositories).toBe(25);
    expect(planById("free").limits).toMatchObject({ repositories: 1, scansPerMonth: 3 });
  });

  it("never exposes the APEX dogfood SKU as customer pricing", () => {
    const customerCopy = JSON.stringify([PLANS, DILIGENCE_PACK, ENTERPRISE]);
    expect(customerCopy).not.toMatch(/\$19(?!\d)/);
    expect("APEX SKU $19 one-time").toMatch(/\$19(?!\d)/);
    expect(customerCopy).not.toMatch(/credits/i);
    expect(PLANS.some((p) => p.stripePriceEnv === APEX_DOGFOOD_SKU.stripePriceEnv || p.stripePriceEnv === APEX_DOGFOOD_SKU.legacyStripePriceEnv)).toBe(false);
  });

  it("wires paid plans to their own subscription price variables", () => {
    expect(planById("free").stripePriceEnv).toBeNull();
    expect(planById("pro").stripePriceEnv).toBe("STRIPE_PRICE_PRO_MONTHLY");
    expect(planById("team").stripePriceEnv).toBe("STRIPE_PRICE_TEAM_MONTHLY");
  });

  it("marks features that don't exist yet instead of advertising them as available", () => {
    const byLabel = new Map(PLANS.flatMap((p) => p.features.map((f) => [`${p.id}:${f.label}`, f.availability] as const)));
    expect(byLabel.get("pro:Private repositories")).toBe("in_development");
    expect(byLabel.get("pro:Automatic checks on every push and pull request")).toBe("in_development");
    expect(byLabel.get("team:GitHub pull-request checks")).toBe("in_development");
    expect(byLabel.get("team:Team access and roles")).toBe("in_development");
    expect(ENTERPRISE.includes.every((f) => f.availability !== "available")).toBe(true);
  });

  it("keeps the Diligence Pack an optional one-time add-on", () => {
    expect(DILIGENCE_PACK.priceLabel).toBe("From $1,500");
    expect(DILIGENCE_PACK.cadence).toBe("one-time");
  });
});

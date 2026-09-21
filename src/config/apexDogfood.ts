// The APEX dogfood SKU — an operator test, not PoryGen pricing.
//
// PoryGen is the first external-style SaaS used to validate APEX's
// connected-Stripe ingestion (see docs/APEX_DOGFOOD.md). That experiment needs
// a real one-time Stripe payment against a Price APEX has never seen, so this
// SKU exists. It must never appear on customer surfaces: it's reachable only
// from /billing/diagnostics, and a completed payment never changes a
// customer's plan.

export const APEX_DOGFOOD_SKU = {
  checkoutPlan: "apex_dogfood" as const,
  name: "APEX dogfood scan pack",
  priceLabel: "$19 one-time (sandbox)",
  /** Preferred env var; STRIPE_PRO_PRICE_ID is still read as a legacy fallback. */
  stripePriceEnv: "STRIPE_APEX_DOGFOOD_PRICE_ID",
  legacyStripePriceEnv: "STRIPE_PRO_PRICE_ID",
  description:
    "Creates a real Stripe Checkout Session for the unmapped-price APEX ingestion test. Operator use only; it does not grant a PoryGen plan.",
};

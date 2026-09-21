// Public-facing configuration that differs per deployment. Only VITE_* values
// reach the browser; none of these are secrets.

/** Sales contact for Enterprise / Diligence Pack. TODO(client): set VITE_SALES_EMAIL — no address is invented here. */
export const SALES_EMAIL: string | null = (import.meta.env.VITE_SALES_EMAIL as string | undefined)?.trim() || null;

/** Set to "true" once STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_TEAM_MONTHLY are configured server-side. */
export const PAID_CHECKOUT_ENABLED = import.meta.env.VITE_BILLING_CHECKOUT_ENABLED === "true";

export const PRODUCT_LINE =
  "PoryGen checks the code AI agents put into your product for suspicious source similarity and license risk before it ships.";

export const THESIS = "If AI coding becomes normal, checking what the AI gave you should become normal too.";

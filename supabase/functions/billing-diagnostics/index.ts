// billing-diagnostics: returns non-secret Stripe/APEX configuration state for
// the operator diagnostics panel. Never returns STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, or the Supabase service-role key — only whether
// they're configured, plus identifiers that are safe to display (Price IDs, a
// Stripe account ID).

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const STRIPE_PRICE_PRO_MONTHLY = Deno.env.get("STRIPE_PRICE_PRO_MONTHLY");
const STRIPE_PRICE_TEAM_MONTHLY = Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY");
const APEX_DOGFOOD_PRICE_ID = Deno.env.get("STRIPE_APEX_DOGFOOD_PRICE_ID") ?? Deno.env.get("STRIPE_PRO_PRICE_ID");
const APEX_CUSTOMER_ID = Deno.env.get("APEX_CUSTOMER_ID");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (!req.headers.get("Authorization")) return json({ error: "Missing Authorization header" }, 401);

  let stripeAccountId: string | null = null;
  let stripeEnvironment: "sandbox/test" | "live" | "unknown" = "unknown";

  if (STRIPE_SECRET_KEY) {
    stripeEnvironment = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "sandbox/test";
    try {
      const res = await fetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      });
      if (res.ok) {
        const data = await res.json();
        stripeAccountId = data.id ?? null;
      }
    } catch {
      // diagnostics tolerate Stripe being unreachable
    }
  }

  return json({
    stripeConfigured: Boolean(STRIPE_SECRET_KEY),
    stripeEnvironment,
    stripeAccountId,
    // Legacy field kept for older clients: this was always the APEX dogfood price.
    stripeProPriceId: APEX_DOGFOOD_PRICE_ID ?? null,
    webhookSecretConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
    apexCustomerIdConfigured: Boolean(APEX_CUSTOMER_ID),
    apexCustomerId: APEX_CUSTOMER_ID ?? null,
    prices: {
      proMonthly: STRIPE_PRICE_PRO_MONTHLY ?? null,
      teamMonthly: STRIPE_PRICE_TEAM_MONTHLY ?? null,
      apexDogfood: APEX_DOGFOOD_PRICE_ID ?? null,
    },
  });
});

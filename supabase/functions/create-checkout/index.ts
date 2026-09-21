// create-checkout: creates (or reuses) a Stripe Customer for the signed-in
// PoryGen user, then a Stripe Checkout Session for one of:
//
//   plan = "pro" | "team"  → a monthly subscription (customer plans)
//   plan = "apex_dogfood"  → the $19 one-time APEX dogfood test SKU
//
// The two are deliberately separate. Customer plans read their Price IDs from
// STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_TEAM_MONTHLY and fail closed with
// PLAN_NOT_CONFIGURED when unset. The APEX SKU reads
// STRIPE_APEX_DOGFOOD_PRICE_ID (falling back to the legacy STRIPE_PRO_PRICE_ID)
// and is tagged porygen_plan=apex_dogfood so it can never be mistaken for a
// Pro subscription. All Stripe calls are server-side; the secret key never
// reaches the browser. Payment state is only ever written by stripe-webhook.
//
// Two Supabase clients are used deliberately: `authed` (anon key + the
// caller's JWT) only to identify who is asking, and `admin` (service role)
// for the billing_customers write — that table has no client-facing write
// policy at all.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const APEX_CUSTOMER_ID = Deno.env.get("APEX_CUSTOMER_ID");

type Plan = "pro" | "team" | "apex_dogfood";

interface PlanConfig {
  priceId: string | undefined;
  priceEnv: string;
  mode: "subscription" | "payment";
}

function planConfig(plan: Plan): PlanConfig {
  switch (plan) {
    case "pro":
      return { priceId: Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"), priceEnv: "STRIPE_PRICE_PRO_MONTHLY", mode: "subscription" };
    case "team":
      return { priceId: Deno.env.get("STRIPE_PRICE_TEAM_MONTHLY"), priceEnv: "STRIPE_PRICE_TEAM_MONTHLY", mode: "subscription" };
    case "apex_dogfood":
      return {
        priceId: Deno.env.get("STRIPE_APEX_DOGFOOD_PRICE_ID") ?? Deno.env.get("STRIPE_PRO_PRICE_ID"),
        priceEnv: "STRIPE_APEX_DOGFOOD_PRICE_ID",
        mode: "payment",
      };
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

async function stripeRequest(path: string, form: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe request to ${path} failed`);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { plan?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body is handled as "no plan" below
  }
  const plan = body.plan;
  if (plan !== "pro" && plan !== "team" && plan !== "apex_dogfood") {
    return json({ error: "Choose a plan: pro, team, or apex_dogfood.", code: "PLAN_REQUIRED" }, 400);
  }

  if (!STRIPE_SECRET_KEY) {
    return json({ error: "Stripe is not configured in this environment (STRIPE_SECRET_KEY missing).", code: "STRIPE_NOT_CONFIGURED" }, 501);
  }
  const config = planConfig(plan);
  if (!config.priceId) {
    return json(
      {
        error:
          plan === "apex_dogfood"
            ? `The APEX dogfood price isn't configured (${config.priceEnv}).`
            : `Checkout for the ${plan === "pro" ? "Pro" : "Team"} plan isn't open yet (${config.priceEnv} is not configured).`,
        code: "PLAN_NOT_CONFIGURED",
      },
      501,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authed.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);
  const user = userData.user;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing } = await admin.from("billing_customers").select("*").eq("user_id", user.id).maybeSingle();

  let stripeCustomerId = existing?.stripe_customer_id ?? null;
  const apexMetadata: Record<string, string> =
    plan === "apex_dogfood" && APEX_CUSTOMER_ID ? { "metadata[apex_customer_id]": APEX_CUSTOMER_ID } : {};

  if (!stripeCustomerId) {
    const customer = await stripeRequest("customers", {
      email: user.email ?? "",
      "metadata[porygen_user_id]": user.id,
      ...(APEX_CUSTOMER_ID ? { "metadata[apex_customer_id]": APEX_CUSTOMER_ID } : {}),
    });
    stripeCustomerId = customer.id;

    await admin.from("billing_customers").upsert(
      {
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        apex_customer_id: APEX_CUSTOMER_ID ?? null,
      },
      { onConflict: "user_id" },
    );
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const form: Record<string, string> = {
    mode: config.mode,
    customer: stripeCustomerId!,
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: plan === "apex_dogfood" ? `${origin}/billing/diagnostics` : `${origin}/pricing`,
    "metadata[porygen_user_id]": user.id,
    "metadata[porygen_plan]": plan,
    ...apexMetadata,
  };
  if (config.mode === "subscription") {
    // Subscription events carry their own metadata, so plan changes and
    // cancellations can be attributed without another lookup.
    form["subscription_data[metadata][porygen_user_id]"] = user.id;
    form["subscription_data[metadata][porygen_plan]"] = plan;
  }

  const session = await stripeRequest("checkout/sessions", form);
  return json({ url: session.url, sessionId: session.id });
});

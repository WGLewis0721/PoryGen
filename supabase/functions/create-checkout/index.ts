// create-checkout: creates (or reuses) a real Stripe Customer for the signed-in
// PoryGen user, then creates a real Stripe Checkout Session for the PoryGen
// Pro Scan Pack. All Stripe calls are server-side; the secret key never
// reaches the browser.
//
// Two Supabase clients are used deliberately: `authed` (anon key + the
// caller's JWT) only to identify who is asking, and `admin` (service role)
// for the billing_customers write — billing linkage is not something a user
// should be able to write directly via RLS, even to their own row, so this
// table has no client-facing insert/update policy at all.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_PRO_PRICE_ID = Deno.env.get("STRIPE_PRO_PRICE_ID");
const APEX_CUSTOMER_ID = Deno.env.get("APEX_CUSTOMER_ID");

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

  if (!STRIPE_SECRET_KEY || !STRIPE_PRO_PRICE_ID) {
    return json(
      {
        error: "Stripe is not configured in this environment (STRIPE_SECRET_KEY / STRIPE_PRO_PRICE_ID missing).",
        code: "STRIPE_NOT_CONFIGURED",
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

  const { data: existing } = await admin
    .from("billing_customers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  let stripeCustomerId = existing?.stripe_customer_id ?? null;

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

  const session = await stripeRequest("checkout/sessions", {
    mode: "payment",
    customer: stripeCustomerId!,
    "line_items[0][price]": STRIPE_PRO_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    "metadata[porygen_user_id]": user.id,
    "metadata[porygen_plan]": "pro",
    ...(APEX_CUSTOMER_ID ? { "metadata[apex_customer_id]": APEX_CUSTOMER_ID } : {}),
  });

  return json({ url: session.url, sessionId: session.id });
});

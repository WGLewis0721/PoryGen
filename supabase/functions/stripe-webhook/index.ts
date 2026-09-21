// stripe-webhook: verified, idempotent Stripe webhook ingestion.
//
// Signature verification is implemented directly against Stripe's documented
// scheme (HMAC-SHA256 over `${timestamp}.${payload}`, using the raw request
// body — never the parsed JSON, which would not match the signature) rather
// than pulling in the full Stripe SDK for one HMAC check. Idempotency is
// enforced by the database: `billing_events.stripe_event_id` is UNIQUE, and a
// conflict there is treated as "already processed," not an error.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function fetchLineItemPriceId(sessionId: string): Promise<string | null> {
  if (!STRIPE_SECRET_KEY) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.price?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!STRIPE_WEBHOOK_SECRET) {
    return json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, 501);
  }

  const signatureHeader = req.headers.get("stripe-signature");
  if (!signatureHeader) return json({ error: "Missing Stripe-Signature header" }, 400);

  const payload = await req.text();
  const valid = await verifyStripeSignature(payload, signatureHeader, STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: "Invalid signature" }, 400);

  const event = JSON.parse(payload);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const receivedAt = new Date().toISOString();
  const object = event.data?.object ?? {};

  let userId: string | null = object.metadata?.porygen_user_id ?? null;
  if (!userId && typeof object.customer === "string") {
    const { data: customerRow } = await admin
      .from("billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", object.customer)
      .maybeSingle();
    userId = customerRow?.user_id ?? null;
  }

  let priceId: string | null = null;
  if (event.type === "checkout.session.completed" && object.id) {
    priceId = await fetchLineItemPriceId(object.id);
  }

  const payloadSummary = {
    type: object.object ?? null,
    livemode: event.livemode ?? null,
    amount_total: object.amount_total ?? null,
    currency: object.currency ?? null,
    payment_status: object.payment_status ?? null,
  };

  const { error: insertError } = await admin.from("billing_events").insert({
    stripe_event_id: event.id,
    user_id: userId,
    event_type: event.type,
    stripe_customer_id: typeof object.customer === "string" ? object.customer : null,
    checkout_session_id: object.object === "checkout.session" ? object.id : null,
    payment_intent_id: typeof object.payment_intent === "string" ? object.payment_intent : null,
    price_id: priceId,
    received_at: receivedAt,
    processed_at: new Date().toISOString(),
    payload_summary_json: payloadSummary,
  });

  if (insertError) {
    // Unique violation on stripe_event_id => this event was already
    // processed by an earlier delivery or retry. Idempotent no-op, not a
    // failure — Stripe should not keep retrying.
    if (insertError.code === "23505") {
      return json({ received: true, idempotent: true });
    }
    return json({ error: insertError.message }, 500);
  }

  return json({ received: true });
});

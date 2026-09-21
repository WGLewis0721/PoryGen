# Stripe setup

## Status in this build

The full Checkout + webhook code path is implemented and deployed
(`create-checkout`, `stripe-webhook`, `billing-diagnostics` Edge Functions), but **not
exercised end-to-end** — no Stripe sandbox `STRIPE_SECRET_KEY` was available in this
environment. `create-checkout` returns a clear `STRIPE_NOT_CONFIGURED` (501) response
when the key is absent, verified live:

```json
{"error":"Stripe is not configured in this environment (STRIPE_SECRET_KEY / STRIPE_PRO_PRICE_ID missing).","code":"STRIPE_NOT_CONFIGURED"}
```

This is the [`APEX dogfood`](APEX_DOGFOOD.md) sandbox account
(`acct_1UHy1FCmLamiWIin`) — see that doc for exactly what the operator needs to do next.

## Sandbox account, Product, and Price

In the target Stripe sandbox (test mode):

1. Create a Product: **"PoryGen Pro Scan Pack"**.
2. Create a one-time Price on it: **$19 USD**, representing 1,000 scan credits.
3. Copy the Price ID (`price_...`) into `STRIPE_PRO_PRICE_ID`.

`create-checkout` always uses this configured Price ID — it never creates a new Price at
checkout time, so the same Price ID is what APEX's operator later maps to a credit grant.

## Environment variables (Edge Function secrets)

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRO_PRICE_ID=price_...
supabase secrets set APEX_CUSTOMER_ID=<apex-side customer uuid, if dogfooding>
```

None of these are ever read client-side; `create-checkout` and `stripe-webhook` are the
only readers.

## Checkout flow

1. Client calls `create-checkout` (authenticated, via `supabase.functions.invoke`).
2. The function looks up (or creates) a Stripe Customer for the signed-in user, tagging
   it with `metadata.porygen_user_id` and, if configured, `metadata.apex_customer_id`.
   The Stripe Customer ID is persisted to `billing_customers` via the **service role**
   (this table has no client-facing write policy — see [SECURITY.md](SECURITY.md)).
3. It creates a Checkout Session (`mode=payment`, the configured Price, quantity 1),
   tagged with the same metadata, `success_url` →
   `/billing/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` → `/pricing`.
4. The browser redirects to `session.url`.

Reaching `/billing/success` is **not** treated as proof of payment anywhere in the UI —
the success page explicitly checks whether a matching `billing_events` row (written only
by the verified webhook) exists yet.

## Webhook

Configure a Stripe webhook endpoint pointing at
`https://<project-ref>.functions.supabase.co/stripe-webhook`, subscribed to at minimum
`checkout.session.completed`. `stripe-webhook`:

- Verifies `Stripe-Signature` by hand (HMAC-SHA256 over `${timestamp}.${rawBody}`,
  constant-time comparison) — no Stripe SDK dependency for one check.
- Resolves `user_id` from the event's metadata or, failing that, a `billing_customers`
  lookup by Stripe Customer ID.
- Fetches the Checkout Session's line items to record the Price ID actually charged.
- Inserts into `billing_events` with `stripe_event_id` **unique** — a replayed or
  duplicate-delivered webhook is detected via the resulting `23505` unique-violation and
  answered `{"received": true, "idempotent": true}` rather than creating a second row or
  double-processing anything.

## Diagnostic flow

`/billing/diagnostics` in the app calls the `billing-diagnostics` Edge Function, which
returns only non-secret state: whether Stripe is configured, sandbox vs. live, the
Stripe account ID (fetched live via `GET /v1/account`), the configured Price ID, whether
a webhook secret is set, and the configured (or missing) APEX customer ID. Combined with
`billing_customers`/`billing_events` rows (read client-side, RLS-scoped to the signed-in
user), this is enough to diagnose the whole path — Stripe Customer ID, latest Checkout
Session ID, latest PaymentIntent ID, latest Stripe event ID, webhook processed state —
without querying the database directly.

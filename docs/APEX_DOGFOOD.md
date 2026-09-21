# APEX dogfood

PoryGen is also the first external-style SaaS used to validate APEX's connected-Stripe
ingestion path. This document is for the operator running that acceptance test. It is **not**
part of PoryGen's product or pricing: the $19 SKU below never appears on customer surfaces and
never grants a PoryGen plan. Customer pricing (Free / Pro $49 / Team $199) lives in
`src/config/plans.ts` and [STRIPE_SETUP.md](STRIPE_SETUP.md).

## The experiment

```
PoryGen user
  → real Stripe Customer (sandbox acct_1UHy1FCmLamiWIin)
  → APEX dogfood scan pack Checkout Session ($19 one-time, porygen_plan=apex_dogfood)
  → checkout.session.completed (real Stripe test-mode payment)
  → APEX's existing connected-Stripe event ingress
  → APEX sees a Price it has no entitlement mapping for
  → APEX persists the event as mapping_required
  → operator maps that Price → 1,000 credits
  → APEX requeues the persisted event
  → APEX's canonical processor grants exactly +1,000 credits
  → replay of the same Stripe event stays idempotent
```

**The Price must start unmapped in APEX.** PoryGen doesn't create, seed, or hint at that mapping.

## What changed with plan separation (2026.09)

- The SKU is started from **`/billing/diagnostics` → "Start $19 one-time (sandbox) checkout"**,
  not from `/billing` (which now sells subscriptions).
- `create-checkout` is called with `{ "plan": "apex_dogfood" }`. Its Price comes from
  `STRIPE_APEX_DOGFOOD_PRICE_ID`, falling back to the legacy `STRIPE_PRO_PRICE_ID` so an existing
  setup keeps working.
- Session metadata is `porygen_plan=apex_dogfood` (previously `pro`), so the payment can't be
  mistaken for a Pro subscription anywhere. APEX doesn't read `porygen_plan`; the attribution
  contract below is unchanged.
- The cancel URL returns to `/billing/diagnostics`.
- A completed dogfood payment shows as an APEX test purchase in diagnostics and doesn't change
  the account's plan.

## What this build does NOT do

- Create the APEX price mapping, use the Apex-Public publisher account or the managed-app
  sandbox, or change APEX code or configuration.
- Invent an `APEX_CUSTOMER_ID` — if unset, diagnostics say so.

## IDs the operator needs

All on `/billing/diagnostics` after signing in:

| Field | Source |
|---|---|
| Stripe account ID | `billing-diagnostics` → `GET /v1/account` |
| Stripe environment | Inferred from the secret key prefix |
| APEX dogfood price | `STRIPE_APEX_DOGFOOD_PRICE_ID` (or legacy `STRIPE_PRO_PRICE_ID`) — the Price APEX must map |
| APEX customer ID | `APEX_CUSTOMER_ID`, echoed if set |
| PoryGen user ID | `auth.users.id` |
| Stripe Customer ID | `billing_customers.stripe_customer_id` |
| Latest Checkout Session / PaymentIntent / event IDs | `billing_events` (verified webhook only) |

## Attribution contract

For the dogfood SKU, `create-checkout` sets `metadata.apex_customer_id` on the Checkout Session
and — when the Customer is first created — on the Stripe Customer, from `APEX_CUSTOMER_ID`. Per
APEX's connected-ingress code (`supabase/functions/_shared/connected_stripe_ingress.ts` in the
APEX repo, not modified here), that field is a Stripe-carried linkage claim that APEX honors only
if it names an existing APEX customer for the connected workspace. It never sets how many credits
are granted. Subscription checkouts (`pro` / `team`) don't carry `apex_customer_id` on the session.

`APEX_CUSTOMER_ID` must be a real, existing APEX customer ID for the workspace connected to
`acct_1UHy1FCmLamiWIin`.

## Status

`STRIPE_SECRET_KEY` and `APEX_CUSTOMER_ID` were not available in this environment, so the live
chain hasn't been exercised end to end. The code path is real.

## Next action

1. `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_APEX_DOGFOOD_PRICE_ID=...`
   (or keep `STRIPE_PRO_PRICE_ID`).
2. `supabase secrets set APEX_CUSTOMER_ID=...` (the real APEX customer for that workspace).
3. Point a Stripe webhook at PoryGen's `stripe-webhook` and confirm APEX's ingress is subscribed
   to the same sandbox account.
4. Redeploy `create-checkout`, `stripe-webhook`, `billing-diagnostics`.
5. Sign in → `/billing/diagnostics` → start the $19 checkout → complete it in Stripe test mode.
6. Confirm the `checkout.session.completed` event in diagnostics, then check APEX's ingress state
   (expected on first delivery: `mapping_required`).

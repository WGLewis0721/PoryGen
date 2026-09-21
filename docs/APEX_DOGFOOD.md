# APEX dogfood

PoryGen is also the first external-style SaaS used to validate APEX's connected-Stripe
ingestion path. This document is for the operator running that acceptance test — it is
not part of PoryGen's own product surface.

## The experiment

```
PoryGen user
  → real Stripe Customer (sandbox acct_1UHy1FCmLamiWIin)
  → PoryGen Pro Scan Pack Checkout Session
  → checkout.session.completed (real Stripe test-mode payment)
  → APEX's existing connected-Stripe event ingress
  → APEX sees a Price it has no entitlement mapping for
  → APEX persists the event as mapping_required
  → operator maps that Price → 1,000 credits
  → APEX requeues the persisted event
  → APEX's canonical processor grants exactly +1,000 credits
  → replay of the same Stripe event stays idempotent
```

**PoryGen's Pro Price must start unmapped in APEX.** This build does not create, seed,
or hint at that mapping — the whole point is testing APEX's `mapping_required` /
requeue path against a genuinely new, externally-created Price.

## What this build does NOT do

- Does not create the APEX price mapping.
- Does not use the Apex-Public Stripe App publisher account.
- Does not use the APEX managed-app sandbox.
- Does not change any APEX code or configuration.
- Does not invent an `APEX_CUSTOMER_ID` — if it's unset, PoryGen's billing diagnostics
  say so explicitly (see below) instead of fabricating one.

## IDs the operator needs

All available without querying any database directly — open `/billing/diagnostics` after
signing in and completing (or attempting) a checkout:

| Diagnostic field | Where it comes from |
|---|---|
| Stripe account ID | `billing-diagnostics` Edge Function → `GET /v1/account` with the configured `STRIPE_SECRET_KEY` |
| Stripe environment (sandbox/live) | Inferred from the `STRIPE_SECRET_KEY` prefix |
| PoryGen Pro Price ID (`STRIPE_PRO_PRICE_ID`) | Configured Edge Function secret — this is the Price APEX needs to map |
| APEX customer ID (configured / missing) | `APEX_CUSTOMER_ID` Edge Function secret, echoed verbatim if set |
| PoryGen internal user ID | The signed-in Supabase `auth.users.id` |
| Stripe Customer ID | `billing_customers.stripe_customer_id`, created on first checkout |
| Latest Checkout Session ID / PaymentIntent ID / Stripe event ID | `billing_events`, written only by the verified webhook |

## Attribution contract

`create-checkout` sets `metadata.apex_customer_id` on **both** the Stripe Customer and
the Checkout Session, read from `APEX_CUSTOMER_ID`. Per APEX's own connected-ingress
code (`supabase/functions/_shared/connected_stripe_ingress.ts` in the APEX repo — not
modified by this build), that metadata field is a **Stripe-carried linkage claim**: APEX
resolves it against its own `customers` table for the connected workspace and only
honors it if it names a customer that already exists there. It never sets *how many*
credits are granted (that's resolved server-side from APEX's own price mappings) — it
only identifies *whose* ledger the eventual grant belongs to.

**`APEX_CUSTOMER_ID` must therefore be a real, existing APEX customer ID for the
workspace connected to `acct_1UHy1FCmLamiWIin`** — not a PoryGen-internal ID, and not
invented by this build.

## Status in this build

`APEX_CUSTOMER_ID` and `STRIPE_SECRET_KEY` were not available in this environment, so the
live Checkout → webhook → APEX-ingress chain was not exercised end-to-end. The Stripe
integration code (Customer creation, Checkout Session creation, signed webhook
ingestion) is real and deployed — see [STRIPE_SETUP.md](STRIPE_SETUP.md).

## Next action

To produce the actual unmapped-Price payment APEX should ingest:

1. Provide sandbox credentials for `acct_1UHy1FCmLamiWIin`: `supabase secrets set
   STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... STRIPE_PRO_PRICE_ID=...`.
2. Provide the real APEX customer ID for that connected workspace: `supabase secrets set
   APEX_CUSTOMER_ID=...`.
3. Point a Stripe webhook endpoint at PoryGen's `stripe-webhook` function (see
   [STRIPE_SETUP.md](STRIPE_SETUP.md)) **and** confirm APEX's own connected-Stripe
   ingress is subscribed to the same sandbox account's events.
4. Sign in to PoryGen, go to `/billing`, click **Upgrade to Pro**, complete the sandbox
   Checkout.
5. Confirm in `/billing/diagnostics` that a `checkout.session.completed` event landed,
   then check APEX's own ingress state for that event (expected: `mapping_required` on
   first delivery, since the Price is intentionally unmapped).

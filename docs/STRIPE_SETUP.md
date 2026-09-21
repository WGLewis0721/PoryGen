# Stripe setup

PoryGen sells monthly subscriptions (**Pro** $49, **Team** $199). Separately, the APEX dogfood
experiment uses a $19 one-time SKU — an operator test, not pricing (see
[APEX_DOGFOOD.md](APEX_DOGFOOD.md)). All plan data lives in `src/config/plans.ts`; nothing about
pricing is hardcoded in pages.

## Status

Checkout, webhook, and diagnostics code is implemented. **No subscription Price IDs are
configured**, so paid checkout fails closed:

```json
{"error":"Checkout for the Pro plan isn't open yet (STRIPE_PRICE_PRO_MONTHLY is not configured).","code":"PLAN_NOT_CONFIGURED"}
```

The frontend mirrors that: with `VITE_BILLING_CHECKOUT_ENABLED` unset, `/pricing` and `/billing`
say paid checkout isn't open yet and don't offer a checkout button. No completed payment is ever
faked; plan state changes only through a verified webhook.

## Products and prices

In Stripe (test mode first):

1. Product **PoryGen Pro** → recurring monthly price $49 USD → copy the `price_…` ID.
2. Product **PoryGen Team** → recurring monthly price $199 USD → copy the `price_…` ID.
3. (APEX only) keep the existing one-time $19 **PoryGen scan pack** price for the dogfood test.

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_TEAM_MONTHLY=price_...
supabase secrets set STRIPE_APEX_DOGFOOD_PRICE_ID=price_...   # APEX only; STRIPE_PRO_PRICE_ID still works as a legacy fallback
```

Then set `VITE_BILLING_CHECKOUT_ENABLED=true` for the frontend build.

## Checkout

`create-checkout` requires `{ "plan": "pro" | "team" | "apex_dogfood" }`:

| Plan | Mode | Price from | Metadata |
|---|---|---|---|
| `pro` | subscription | `STRIPE_PRICE_PRO_MONTHLY` | session and `subscription_data`: `porygen_user_id`, `porygen_plan=pro` |
| `team` | subscription | `STRIPE_PRICE_TEAM_MONTHLY` | same, `porygen_plan=team` |
| `apex_dogfood` | payment | `STRIPE_APEX_DOGFOOD_PRICE_ID` → `STRIPE_PRO_PRICE_ID` | `porygen_plan=apex_dogfood`, plus `apex_customer_id` when configured |

It reuses or creates the Stripe Customer (service-role write to `billing_customers`), never
creates Prices at checkout time, and returns `session.url`. Missing plan → `400 PLAN_REQUIRED`;
missing key → `501 STRIPE_NOT_CONFIGURED`; missing price → `501 PLAN_NOT_CONFIGURED`.

The APEX SKU is tagged `apex_dogfood` (it was tagged `pro` before plan separation) so a test
payment can never be mistaken for a Pro subscription.

## Webhook

Endpoint: `https://<project-ref>.functions.supabase.co/stripe-webhook`. Subscribe to
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`.

`stripe-webhook` verifies the signature against the raw body, resolves the user from metadata or
the customer, records the charged Price for completed checkouts, and inserts `billing_events`
idempotently (unique `stripe_event_id`). `payload_summary_json` holds only non-secret fields,
now including `porygen_plan`, checkout `mode`, and `subscription_status`.

## Plan derivation

`src/lib/entitlements.ts#derivePlan` replays verified events: a `pro`/`team` subscription
checkout or an active/trialing subscription update sets the plan; deletion or an ended status
returns to Free; `apex_dogfood` or untagged completions never grant a plan (they count as APEX
test purchases). Limits are displayed, not enforced, during early access.

## Diagnostics

`/billing/diagnostics` (via `billing-diagnostics`) shows: key configured, environment, account
ID, webhook secret, **subscription price status** (Pro, Team), the APEX price and customer ID,
completed APEX test checkouts, and this account's Stripe linkage. Secrets never leave the server.

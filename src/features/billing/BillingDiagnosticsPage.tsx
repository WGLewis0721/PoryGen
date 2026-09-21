import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { createCheckoutSession, getBillingCustomer, getBillingDiagnostics, listBillingEvents, type BillingDiagnostics } from "../../lib/api";
import type { BillingCustomerRow, BillingEventRow } from "../../lib/dbTypes";
import { derivePlan } from "../../lib/entitlements";
import { APEX_DOGFOOD_SKU } from "../../config/apexDogfood";

function Row({ label, value }: { label: string; value: string | null | boolean }) {
  const display = typeof value === "boolean" ? (value ? "Configured" : "Missing") : (value ?? "—");
  return (
    <div className="kv-cell">
      <div className="kv-key">{label}</div>
      <div className="kv-value">
        <span className={typeof value === "string" ? "mono" : undefined}>{display}</span>
        {typeof value === "string" && value && (
          <button type="button" className="kv-copy" onClick={() => navigator.clipboard?.writeText(value)} aria-label={`Copy ${label}`}>
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

export function BillingDiagnosticsPage() {
  useDocumentTitle("Billing diagnostics — PoryGen");
  const { user } = useAuth();
  const [diagnostics, setDiagnostics] = useState<BillingDiagnostics | null>(null);
  const [customer, setCustomer] = useState<BillingCustomerRow | null>(null);
  const [events, setEvents] = useState<BillingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apexError, setApexError] = useState<string | null>(null);
  const [startingApex, setStartingApex] = useState(false);

  useEffect(() => {
    getBillingDiagnostics()
      .then(setDiagnostics)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load diagnostics."));
    if (user) {
      getBillingCustomer(user.id).then(setCustomer).catch(() => undefined);
      listBillingEvents(user.id).then(setEvents).catch(() => undefined);
    }
  }, [user]);

  async function startApexCheckout() {
    setStartingApex(true);
    setApexError(null);
    const result = await createCheckoutSession("apex_dogfood");
    if ("error" in result) {
      setApexError(result.error);
      setStartingApex(false);
      return;
    }
    window.location.assign(result.url);
  }

  const latest = events[0];
  const apexPrice = diagnostics?.prices?.apexDogfood ?? diagnostics?.stripeProPriceId ?? null;
  const apexPurchases = derivePlan(events).apexTestPurchases;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Billing diagnostics</h1>
          <p>
            Non-secret configuration for operators. Secret keys are read server-side by the billing-diagnostics function and never
            reach this page.
          </p>
        </div>
      </header>

      {error && <p className="notice notice-error block-notice">{error}</p>}

      <section aria-labelledby="diag-stripe">
        <h2 id="diag-stripe" className="block-title">
          Stripe
        </h2>
        <div className="kv block-gap">
          <Row label="Secret key" value={diagnostics?.stripeConfigured ?? false} />
          <Row label="Environment" value={diagnostics?.stripeEnvironment ?? "unknown"} />
          <Row label="Account ID" value={diagnostics?.stripeAccountId ?? null} />
          <Row label="Webhook secret" value={diagnostics?.webhookSecretConfigured ?? false} />
        </div>
      </section>

      <section className="block" aria-labelledby="diag-plans">
        <h2 id="diag-plans" className="block-title">
          Customer subscriptions
        </h2>
        <div className="kv block-gap">
          <Row label="Pro monthly price (STRIPE_PRICE_PRO_MONTHLY)" value={diagnostics?.prices ? diagnostics.prices.proMonthly : null} />
          <Row label="Team monthly price (STRIPE_PRICE_TEAM_MONTHLY)" value={diagnostics?.prices ? diagnostics.prices.teamMonthly : null} />
        </div>
        {diagnostics && !diagnostics.prices && (
          <p className="notice notice-warn block-gap">
            The deployed billing-diagnostics function predates plan separation. Redeploy it to see subscription price status.
          </p>
        )}
        <p className="fine block-gap">Checkout for a plan whose price isn't configured fails closed with PLAN_NOT_CONFIGURED.</p>
      </section>

      <section className="block" aria-labelledby="diag-apex">
        <h2 id="diag-apex" className="block-title">
          APEX dogfood — operator test
        </h2>
        <p className="answer block-gap">
          {APEX_DOGFOOD_SKU.description} See docs/APEX_DOGFOOD.md for the full procedure.
        </p>
        <div className="kv block-gap">
          <Row label={`${APEX_DOGFOOD_SKU.name} price`} value={apexPrice} />
          <Row label="APEX customer ID" value={diagnostics?.apexCustomerId ?? null} />
          <Row label="Completed test checkouts" value={String(apexPurchases)} />
        </div>
        {diagnostics && !diagnostics.apexCustomerIdConfigured && (
          <p className="notice notice-warn block-gap">
            APEX_CUSTOMER_ID isn't set. Checkout still works, but Stripe metadata will omit apex_customer_id until it's configured
            with <code>supabase secrets set APEX_CUSTOMER_ID=…</code>.
          </p>
        )}
        <div className="cta-row">
          <button type="button" className="btn btn-secondary" onClick={startApexCheckout} disabled={startingApex}>
            {startingApex ? "Opening checkout…" : `Start ${APEX_DOGFOOD_SKU.priceLabel} checkout`}
          </button>
        </div>
        {apexError && (
          <p className="notice notice-error block-gap" role="alert">
            {apexError}
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="diag-linkage">
        <h2 id="diag-linkage" className="block-title">
          Linkage for this account
        </h2>
        <div className="kv block-gap">
          <Row label="PoryGen user ID" value={user?.id ?? null} />
          <Row label="Stripe customer ID" value={customer?.stripe_customer_id ?? null} />
          <Row label="Latest checkout session" value={latest?.checkout_session_id ?? null} />
          <Row label="Latest payment intent" value={latest?.payment_intent_id ?? null} />
          <Row label="Latest Stripe event" value={latest?.stripe_event_id ?? null} />
          <Row label="Webhook state" value={latest ? (latest.processed_at ? "processed" : "received, unprocessed") : "no events yet"} />
        </div>
      </section>
    </div>
  );
}

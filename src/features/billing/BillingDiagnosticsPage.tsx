import { useEffect, useState } from "react";
import { useAuth } from "../../features/auth/AuthContext";
import { getBillingDiagnostics, getBillingCustomer, listBillingEvents, type BillingDiagnostics } from "../../lib/api";
import type { BillingCustomerRow, BillingEventRow } from "../../lib/dbTypes";

function CopyableRow({ label, value }: { label: string; value: string | null | boolean }) {
  const display = typeof value === "boolean" ? (value ? "configured" : "missing") : value ?? "—";
  return (
    <div className="pg-kv-cell">
      <div className="pg-kv-key">{label}</div>
      <div className="pg-kv-value">
        <span>{display}</span>
        {typeof value === "string" && value && (
          <button
            type="button"
            className="pg-kv-copy"
            onClick={() => navigator.clipboard.writeText(value)}
            aria-label={`Copy ${label}`}
          >
            copy
          </button>
        )}
      </div>
    </div>
  );
}

export function BillingDiagnosticsPage() {
  const { user } = useAuth();
  const [diagnostics, setDiagnostics] = useState<BillingDiagnostics | null>(null);
  const [customer, setCustomer] = useState<BillingCustomerRow | null>(null);
  const [events, setEvents] = useState<BillingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBillingDiagnostics().then(setDiagnostics).catch((err) => setError(err instanceof Error ? err.message : "Could not load diagnostics."));
    if (user) {
      getBillingCustomer(user.id).then(setCustomer);
      listBillingEvents(user.id).then(setEvents);
    }
  }, [user]);

  const latestEvent = events[0];

  return (
    <div>
      <div className="pg-page-header">
        <div>
          <h1>Billing diagnostics</h1>
          <p>Non-secret configuration state for diagnosing the PoryGen → APEX dogfood acceptance path. See docs/APEX_DOGFOOD.md.</p>
        </div>
      </div>

      {error && <div className="pg-form-error" style={{ marginBottom: 24 }}>{error}</div>}

      <h2 className="pg-section-title">Stripe</h2>
      <div className="pg-kv-grid" style={{ marginBottom: 32 }}>
        <CopyableRow label="Stripe configured" value={diagnostics?.stripeConfigured ?? false} />
        <CopyableRow label="Stripe environment" value={diagnostics?.stripeEnvironment ?? "unknown"} />
        <CopyableRow label="Stripe account ID" value={diagnostics?.stripeAccountId ?? null} />
        <CopyableRow label="Stripe Pro price ID" value={diagnostics?.stripeProPriceId ?? null} />
        <CopyableRow label="Webhook secret configured" value={diagnostics?.webhookSecretConfigured ?? false} />
      </div>

      <h2 className="pg-section-title">APEX dogfood</h2>
      <div className="pg-kv-grid" style={{ marginBottom: 32 }}>
        <CopyableRow label="APEX customer ID configured" value={diagnostics?.apexCustomerIdConfigured ?? false} />
        <CopyableRow label="APEX customer ID" value={diagnostics?.apexCustomerId ?? null} />
      </div>
      {diagnostics && !diagnostics.apexCustomerIdConfigured && (
        <div className="pg-form-error" style={{ marginBottom: 32 }}>
          APEX_CUSTOMER_ID is not set. The PoryGen billing demo still functions, but the Stripe Customer
          and Checkout Session metadata will omit apex_customer_id until it's configured via{" "}
          <code>supabase secrets set APEX_CUSTOMER_ID=...</code>.
        </div>
      )}

      <h2 className="pg-section-title">PoryGen linkage</h2>
      <div className="pg-kv-grid" style={{ marginBottom: 32 }}>
        <CopyableRow label="PoryGen internal user ID" value={user?.id ?? null} />
        <CopyableRow label="Stripe customer ID" value={customer?.stripe_customer_id ?? null} />
        <CopyableRow label="Latest Checkout Session ID" value={latestEvent?.checkout_session_id ?? null} />
        <CopyableRow label="Latest PaymentIntent ID" value={latestEvent?.payment_intent_id ?? null} />
        <CopyableRow label="Latest Stripe event ID" value={latestEvent?.stripe_event_id ?? null} />
        <CopyableRow label="Webhook processed state" value={latestEvent ? (latestEvent.processed_at ? "processed" : "received, unprocessed") : "no events yet"} />
      </div>

      <p style={{ fontSize: "0.78rem", color: "var(--pg-structure-faint)", maxWidth: "65ch" }}>
        This panel never displays STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, or the Supabase service-role
        key. Configuration is read server-side by the billing-diagnostics Edge Function and only
        non-secret identifiers are returned.
      </p>
    </div>
  );
}

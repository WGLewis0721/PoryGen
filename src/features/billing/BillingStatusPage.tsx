import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext";
import { getBillingCustomer, listBillingEvents, createCheckoutSession } from "../../lib/api";
import type { BillingCustomerRow, BillingEventRow } from "../../lib/dbTypes";

export function BillingStatusPage() {
  const { user } = useAuth();
  const [customer, setCustomer] = useState<BillingCustomerRow | null>(null);
  const [events, setEvents] = useState<BillingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    getBillingCustomer(user.id).then(setCustomer);
    listBillingEvents(user.id).then(setEvents);
  }, [user]);

  const paid = events.some((e) => e.event_type === "checkout.session.completed");

  async function upgrade() {
    setCheckingOut(true);
    setError(null);
    const result = await createCheckoutSession();
    setCheckingOut(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div>
      <div className="pg-page-header">
        <div>
          <h1>Billing</h1>
          <p>Plan status backed by verified Stripe webhook events — reaching a success URL is never treated as proof of payment.</p>
        </div>
        <div className="pg-page-actions">
          <Link to="/billing/diagnostics" className="pg-btn pg-btn-ghost">diagnostics</Link>
        </div>
      </div>

      <div className="pg-panel" style={{ padding: 24, marginBottom: 32 }}>
        <div className="pg-kv-key">Current plan</div>
        <div style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: 6 }}>
          {paid ? "Pro Daemon" : "Community Scanner"}
        </div>
        {!paid && (
          <button type="button" className="pg-btn pg-btn-primary" style={{ marginTop: 16 }} onClick={upgrade} disabled={checkingOut}>
            {checkingOut ? "starting checkout…" : "Upgrade to Pro"}
          </button>
        )}
        {error && <div className="pg-form-error" style={{ marginTop: 16 }}>{error}</div>}
      </div>

      <h2 className="pg-section-title">Stripe linkage</h2>
      <div className="pg-kv-grid" style={{ marginBottom: 32 }}>
        <div className="pg-kv-cell">
          <div className="pg-kv-key">Stripe customer</div>
          <div className="pg-kv-value">{customer?.stripe_customer_id ?? "not created yet"}</div>
        </div>
        <div className="pg-kv-cell">
          <div className="pg-kv-key">APEX customer ID</div>
          <div className="pg-kv-value">{customer?.apex_customer_id ?? "not configured"}</div>
        </div>
      </div>

      <h2 className="pg-section-title">Webhook event history</h2>
      {events.length === 0 ? (
        <p style={{ color: "var(--pg-structure-dim)", fontSize: "0.85rem" }}>No billing events received yet.</p>
      ) : (
        <table className="pg-table">
          <thead>
            <tr><th>Type</th><th>Received</th><th>Session</th><th>Price</th></tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{e.event_type}</td>
                <td>{new Date(e.received_at).toLocaleString()}</td>
                <td>{e.checkout_session_id?.slice(0, 16) ?? "—"}</td>
                <td>{e.price_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

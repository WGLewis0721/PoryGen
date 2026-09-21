import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { useAuth } from "../../features/auth/AuthContext";
import { listBillingEvents } from "../../lib/api";
import type { BillingEventRow } from "../../lib/dbTypes";

export function BillingSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user } = useAuth();
  const [matchingEvent, setMatchingEvent] = useState<BillingEventRow | null>(null);

  useEffect(() => {
    if (!user || !sessionId) return;
    listBillingEvents(user.id).then((events) => {
      setMatchingEvent(events.find((e) => e.checkout_session_id === sessionId) ?? null);
    });
  }, [user, sessionId]);

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24 }}>
        <BitCritter state={matchingEvent ? "healthy" : "idle"} size={64} />
        <div>
          <h1 style={{ fontSize: "1.2rem" }}>Checkout returned</h1>
          <p style={{ marginTop: 4, color: "var(--pg-structure-dim)", fontSize: "0.85rem" }}>
            Session {sessionId ?? "unknown"}
          </p>
        </div>
      </div>

      <div className="pg-panel" style={{ padding: 20, marginBottom: 24 }}>
        <p style={{ fontSize: "0.85rem", color: "var(--pg-structure-dim)", lineHeight: 1.7 }}>
          Reaching this page is <strong>not proof of payment</strong>. PoryGen's billing state is
          authoritative only once the Stripe webhook has verified and processed the
          <code> checkout.session.completed</code> event.
        </p>
        <p style={{ marginTop: 12, fontSize: "0.85rem", fontWeight: 700 }}>
          {matchingEvent ? "Webhook confirmed: this session was processed." : "Webhook not yet observed for this session."}
        </p>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Link to="/billing" className="pg-btn pg-btn-primary">View billing status</Link>
        <Link to="/billing/diagnostics" className="pg-btn pg-btn-ghost">Diagnostics</Link>
      </div>
    </div>
  );
}

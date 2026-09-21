import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { listBillingEvents } from "../../lib/api";
import type { BillingEventRow } from "../../lib/dbTypes";

export function BillingSuccessPage() {
  useDocumentTitle("Checkout returned — PoryGen");
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { user } = useAuth();
  const [match, setMatch] = useState<BillingEventRow | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || !sessionId) return;
    listBillingEvents(user.id)
      .then((events) => setMatch(events.find((e) => e.checkout_session_id === sessionId) ?? null))
      .finally(() => setChecked(true));
  }, [user, sessionId]);

  const plan = (match?.payload_summary_json as Record<string, unknown> | undefined)?.porygen_plan;

  return (
    <div className="narrow-page">
      <header className="page-head">
        <div>
          <h1>Checkout returned</h1>
          <p className="mono">Session {sessionId ?? "unknown"}</p>
        </div>
      </header>
      <p className="notice">
        Arriving here is <strong>not</strong> proof of payment. Your plan updates only after PoryGen verifies Stripe's{" "}
        <code>checkout.session.completed</code> webhook.
      </p>
      <p className={`notice block-gap ${match ? "notice-ok" : "notice-warn"}`} role="status">
        {!checked
          ? "Checking for the webhook…"
          : match
            ? plan === "apex_dogfood"
              ? "Webhook confirmed. This was the APEX dogfood test purchase; it doesn't change a plan."
              : "Webhook confirmed. Your plan is updated."
            : "The webhook hasn't arrived yet. Refresh in a moment."}
      </p>
      <div className="cta-row">
        <Link to="/billing" className="btn btn-primary">
          Plan and billing
        </Link>
        <Link to="/billing/diagnostics" className="link-arrow">
          Diagnostics
        </Link>
      </div>
    </div>
  );
}

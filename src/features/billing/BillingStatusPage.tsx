import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { countScansSince, createCheckoutSession, listBillingEvents, listRepositories } from "../../lib/api";
import type { BillingEventRow } from "../../lib/dbTypes";
import { derivePlan, startOfMonth, usageReadout, type PlanState, type UsageReadout } from "../../lib/entitlements";
import { PLANS, planById, type PlanId } from "../../config/plans";
import { PAID_CHECKOUT_ENABLED } from "../../config/site";
import { formatDateTime } from "../../lib/format";

export function BillingStatusPage() {
  useDocumentTitle("Plan and billing — PoryGen");
  const { user } = useAuth();
  const [params] = useSearchParams();
  const highlighted = params.get("plan") as PlanId | null;
  const [events, setEvents] = useState<BillingEventRow[]>([]);
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [usage, setUsage] = useState<UsageReadout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listBillingEvents(user.id), countScansSince(user.id, startOfMonth()), listRepositories()])
      .then(([rows, scans, repos]) => {
        if (cancelled) return;
        const state = derivePlan(rows);
        setEvents(rows);
        setPlanState(state);
        setUsage(usageReadout(state.plan, scans, repos.filter((r) => !r.is_demo).length));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load billing."));
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function upgrade(plan: "pro" | "team") {
    setCheckingOut(plan);
    setError(null);
    const result = await createCheckoutSession(plan);
    if ("error" in result) {
      setError(result.error);
      setCheckingOut(null);
      return;
    }
    window.location.assign(result.url);
  }

  const current = planState?.plan ?? "free";
  const customerEvents = events.filter((e) => (e.payload_summary_json as Record<string, unknown> | null)?.porygen_plan !== "apex_dogfood");

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Plan and billing</h1>
          <p>
            Your plan changes only when Stripe confirms a payment through a verified webhook. Reaching a success page is never
            treated as proof of payment.
          </p>
        </div>
      </header>

      {error && (
        <p className="notice notice-error block-notice" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="plan-current">
        <h2 id="plan-current" className="block-title">
          Current plan
        </h2>
        <div className="kv block-gap">
          <div className="kv-cell">
            <div className="kv-key">Plan</div>
            <div className="kv-value">{planById(current).name}</div>
          </div>
          <div className="kv-cell">
            <div className="kv-key">Scans this month</div>
            <div className="kv-value">{usage ? `${usage.scansThisMonth} of ${usage.scansIncluded}` : "—"}</div>
          </div>
          <div className="kv-cell">
            <div className="kv-key">Repositories</div>
            <div className="kv-value">{usage ? `${usage.repositories} of ${usage.repositoriesIncluded}` : "—"}</div>
          </div>
        </div>
        <p className="fine block-gap">
          Early access: plan limits are shown here but not enforced yet, and the resolution workflow is available on every plan.
          {usage && (usage.overScans || usage.overRepositories) ? " You're past your plan's included usage — nothing is blocked." : ""}
        </p>
      </section>

      <section className="block" aria-labelledby="plan-options">
        <h2 id="plan-options" className="block-title">
          Plans
        </h2>
        {!PAID_CHECKOUT_ENABLED && (
          <p className="notice block-gap">Paid checkout isn't open yet. You can use PoryGen on Free in the meantime.</p>
        )}
        <ul className="rows block-gap">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === current;
            return (
              <li className={`row${highlighted === plan.id ? " row-highlight" : ""}`} key={plan.id}>
                <span className="plan-row-name">
                  {plan.name} <span className="muted">{plan.priceLabel} {plan.cadence}</span>
                </span>
                <div className="row-main">
                  <span className="row-meta">{plan.summary}</span>
                </div>
                <div className="row-side">
                  {isCurrent ? (
                    <span className="tag tag-clear">
                      <Check aria-hidden="true" /> Current
                    </span>
                  ) : plan.id === "free" ? null : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => upgrade(plan.id as "pro" | "team")}
                      disabled={!PAID_CHECKOUT_ENABLED || checkingOut !== null}
                    >
                      {checkingOut === plan.id ? "Opening checkout…" : PAID_CHECKOUT_ENABLED ? `Choose ${plan.name}` : "Checkout opens soon"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="fine block-gap">
          <Link to="/pricing">Compare plans in full</Link>
        </p>
      </section>

      <section className="block" aria-labelledby="plan-payments">
        <h2 id="plan-payments" className="block-title">
          Payment records
        </h2>
        {customerEvents.length === 0 ? (
          <p className="muted block-gap">No payments yet.</p>
        ) : (
          <div className="table-wrap block-gap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Received</th>
                  <th scope="col">Plan</th>
                </tr>
              </thead>
              <tbody>
                {customerEvents.map((e) => (
                  <tr key={e.id}>
                    <td>{e.event_type}</td>
                    <td>{formatDateTime(e.received_at)}</td>
                    <td>{String((e.payload_summary_json as Record<string, unknown> | null)?.porygen_plan ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fine block-gap">
          Operators: <Link to="/billing/diagnostics">billing diagnostics</Link>.
        </p>
      </section>
    </div>
  );
}

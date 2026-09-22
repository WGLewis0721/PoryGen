import { Link } from "react-router-dom";
import { Check, Clock, Minus } from "lucide-react";
import { AVAILABILITY_LABEL, DILIGENCE_PACK, ENTERPRISE, PLANS, type CommercialPlan } from "../../config/plans";
import { PAID_CHECKOUT_ENABLED, SALES_EMAIL } from "../../config/site";
import { useAuth } from "../auth/AuthContext";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import "./marketing.css";

const FAQ = [
  {
    q: "Does PoryGen search the whole internet?",
    a: "No. Today a scan compares your code against PoryGen's bundled reference corpus and resolves dependency licenses from npm and PyPI. Every finding names the source collection it came from. Larger source corpora are planned as additional providers; the product will say exactly what each one covers.",
  },
  {
    q: "Is a strong source match proof that code was copied?",
    a: "No. It's strong evidence of structural similarity — the kind worth a human look. Independent implementations of the same idea can look alike, which is why you can dismiss a false positive with a note.",
  },
  {
    q: "Is this legal advice?",
    a: "No. PoryGen shows the license attached to a possible source and what that family of license usually requires. Decisions about your obligations belong with you and, where it matters, your counsel.",
  },
  {
    q: "Does it matter which coding agent I use?",
    a: "No. PoryGen checks the code in your repository, whoever or whatever wrote it — Claude Code, Cursor, Codex, Copilot, or a person.",
  },
  {
    q: "What does “In development” mean?",
    a: "Those features are being built and aren't usable yet. The plan descriptions change as they ship.",
  },
  {
    q: "Do I need the VS Code extension?",
    a: "No. Scans work from your repository alone. The extension is an optional add-on that records the shape of edits for richer attribution.",
  },
];

function PlanFeatures({ plan }: { plan: CommercialPlan }) {
  return (
    <ul className="plan-features">
      {plan.features.map((feature) => (
        <li key={feature.label} className={`plan-feature${feature.availability === "available" ? "" : " plan-feature-pending"}`}>
          {feature.availability === "available" ? <Check aria-hidden="true" /> : <Clock aria-hidden="true" />}
          <span>
            {feature.label}
            {feature.availability !== "available" && <span className="avail">{AVAILABILITY_LABEL[feature.availability]}</span>}
          </span>
        </li>
      ))}
      {plan.excluded.map((label) => (
        <li key={label} className="plan-feature plan-feature-excluded">
          <Minus aria-hidden="true" />
          <span>
            {label}
            <span className="visually-hidden"> — not included</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlanCta({ plan }: { plan: CommercialPlan }) {
  const { user } = useAuth();
  if (plan.id === "free") {
    return (
      <Link to="/scan" className="btn btn-secondary btn-block">
        Start free
      </Link>
    );
  }
  if (PAID_CHECKOUT_ENABLED) {
    return (
      <Link to={`/billing?plan=${plan.id}`} className={`btn btn-block ${plan.recommended ? "btn-primary" : "btn-secondary"}`}>
        Choose {plan.name}
      </Link>
    );
  }
  return (
    <>
      <Link to={user ? "/billing" : "/sign-up"} className={`btn btn-block ${plan.recommended ? "btn-primary" : "btn-secondary"}`}>
        {user ? "View plan options" : "Start free"}
      </Link>
      <p className="plan-cta-note">Paid checkout isn't open yet. Start on Free and upgrade from the app once it is.</p>
    </>
  );
}

function Contact({ subject }: { subject: string }) {
  if (SALES_EMAIL) {
    return (
      <a className="btn btn-secondary" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`}>
        Contact us
      </a>
    );
  }
  return <p className="offer-contact">A sales contact is being set up. Until then, start with Free or Pro.</p>;
}

export function PricingPage() {
  useDocumentTitle("Pricing — PoryGen");
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <h1 className="display">Pricing that starts with the question you actually have.</h1>
          <p className="lede">
            Free shows you whether your AI-written code has a source problem. Pro keeps watching and gives you the workflow to
            resolve what it finds. Everything marked In development is being built now and isn't available yet.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="plans-title">
        <div className="shell">
          <h2 id="plans-title" className="visually-hidden">
            Plans
          </h2>
          <div className="plans">
            {PLANS.map((plan) => (
              <article key={plan.id} className={`plan${plan.recommended ? " plan-recommended" : ""}`} aria-labelledby={`plan-${plan.id}`}>
                <h3 id={`plan-${plan.id}`} className="plan-name">
                  {plan.name}
                  {plan.recommended && <span className="tag tag-neutral">For most founders</span>}
                </h3>
                <p className="plan-price">
                  <span className="display">{plan.priceLabel}</span>
                  <span className="muted">{plan.cadence}</span>
                </p>
                <p className="plan-summary">{plan.summary}</p>
                <div className="plan-cta">
                  <PlanCta plan={plan} />
                </div>
                <PlanFeatures plan={plan} />
              </article>
            ))}
          </div>

          <div className="offers">
            <section className="offer" aria-labelledby="diligence-title">
              <h2 id="diligence-title">{DILIGENCE_PACK.name}</h2>
              <p className="offer-price">
                {DILIGENCE_PACK.priceLabel} · {DILIGENCE_PACK.cadence}
              </p>
              <p>{DILIGENCE_PACK.summary}</p>
              <ul>
                {DILIGENCE_PACK.includes.map((item) => (
                  <li key={item.label}>
                    {item.label}
                    <span className="avail">{AVAILABILITY_LABEL[item.availability]}</span>
                  </li>
                ))}
              </ul>
              <Contact subject="Diligence Pack" />
            </section>
            <section className="offer" id="enterprise" aria-labelledby="enterprise-title">
              <h2 id="enterprise-title">{ENTERPRISE.name}</h2>
              <p className="offer-price">{ENTERPRISE.priceLabel}</p>
              <p>{ENTERPRISE.summary}</p>
              <ul>
                {ENTERPRISE.includes.map((item) => (
                  <li key={item.label}>
                    {item.label}
                    <span className="avail">{AVAILABILITY_LABEL[item.availability]}</span>
                  </li>
                ))}
              </ul>
              <Contact subject="Enterprise and private deployment" />
            </section>
          </div>

          <div className="faq">
            <h2 className="display section-title">Questions worth asking.</h2>
            <div className="faq-list">
              {FAQ.map((item) => (
                <details className="faq-item" key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

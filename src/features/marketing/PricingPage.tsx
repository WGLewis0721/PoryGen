import { Link } from "react-router-dom";
import "./marketing.css";

type Cell = "yes" | "no" | "preview" | string;

const ROWS: { label: string; community: Cell; pro: Cell; enterprise: Cell }[] = [
  { label: "Repository scans", community: "3 / month", pro: "1,000 credits", enterprise: "Bulk assessment" },
  { label: "License inventory", community: "yes", pro: "yes", enterprise: "yes" },
  { label: "Structural fingerprint match (configured corpus)", community: "yes", pro: "yes", enterprise: "yes" },
  { label: "Verified: Clear snapshot badge", community: "yes", pro: "yes", enterprise: "yes" },
  { label: "Continuous provenance ledger", community: "no", pro: "yes", enterprise: "yes" },
  { label: "VS Code provenance capture", community: "no", pro: "yes", enterprise: "yes" },
  { label: "Evidence export (JSON + print report)", community: "no", pro: "yes", enterprise: "yes" },
  { label: "In-toto attestations", community: "no", pro: "yes", enterprise: "yes" },
  { label: "Revision comparison", community: "no", pro: "yes", enterprise: "yes" },
  { label: "Organization policies", community: "no", pro: "no", enterprise: "yes" },
  { label: "SBOM enrichment (CycloneDX)", community: "no", pro: "no", enterprise: "yes" },
  { label: "Large-corpus similarity architecture", community: "no", pro: "no", enterprise: "preview" },
  { label: "UI / DOM similarity review", community: "no", pro: "no", enterprise: "preview" },
  { label: "Private deployment boundary", community: "no", pro: "no", enterprise: "preview" },
  { label: "Acquisition-diligence workflow", community: "no", pro: "no", enterprise: "preview" },
];

function Cell({ value }: { value: Cell }) {
  if (value === "yes") return <span className="pg-spec-yes">included</span>;
  if (value === "no") return <span className="pg-spec-no">—</span>;
  if (value === "preview") return <span className="pg-spec-preview">Enterprise preview</span>;
  return <span>{value}</span>;
}

export function PricingPage() {
  return (
    <section className="pg-section">
      <div className="pg-shell">
        <div className="pg-section-head">
          <span className="pg-kicker">Pricing</span>
          <h2>One specification plate, three columns</h2>
          <p>
            Community, Pro, and Enterprise share one equipment spec rather than three disconnected cards.
            Rows marked "Enterprise preview" describe target architecture not yet built in this MVP.
          </p>
        </div>

        <div className="pg-spec-plate">
          <div className="pg-spec-plate-header">
            <div />
            <div>
              <div className="pg-spec-tier-name">Community scanner</div>
              <div className="pg-spec-tier-price">$0</div>
              <div className="pg-spec-tier-hook">Repo scans, license inventory, fingerprint checks.</div>
              <div className="pg-spec-tier-cta">
                <Link to="/sign-up" className="pg-btn pg-btn-ghost pg-btn-block">Start free</Link>
              </div>
            </div>
            <div>
              <div className="pg-spec-tier-name">Pro daemon</div>
              <div className="pg-spec-tier-price">$19</div>
              <div className="pg-spec-tier-hook">The receipt for your development history.</div>
              <div className="pg-spec-tier-cta">
                <Link to="/billing" className="pg-btn pg-btn-primary pg-btn-block">Upgrade to Pro</Link>
              </div>
            </div>
            <div>
              <div className="pg-spec-tier-name">Enterprise audit</div>
              <div className="pg-spec-tier-price">Contact</div>
              <div className="pg-spec-tier-hook">M&amp;A-grade engineering evidence.</div>
              <div className="pg-spec-tier-cta">
                <Link to="/enterprise" className="pg-btn pg-btn-ghost pg-btn-block">View architecture</Link>
              </div>
            </div>
          </div>

          {ROWS.map((row) => (
            <div className="pg-spec-row" key={row.label}>
              <div>{row.label}</div>
              <div><Cell value={row.community} /></div>
              <div><Cell value={row.pro} /></div>
              <div><Cell value={row.enterprise} /></div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 24, fontSize: "0.78rem", color: "var(--pg-structure-faint)", maxWidth: "70ch" }}>
          Pro Daemon checkout runs against a real Stripe sandbox Checkout Session — see{" "}
          <Link to="/billing/diagnostics">billing diagnostics</Link> for live configuration state.
          "PoryGen Verified: Clear" reflects the selected policy at the recorded scan time; it is not a
          perpetual certification and is not legal advice.
        </p>
      </div>
    </section>
  );
}

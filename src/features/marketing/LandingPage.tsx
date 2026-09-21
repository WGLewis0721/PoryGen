import { Link } from "react-router-dom";
import { ArrowRight, CodeXml, GitCompare, History, PencilLine, RefreshCw, ShieldCheck } from "lucide-react";
import { Picture } from "../../components/Picture";
import { CodeCompare } from "../../components/CodeCompare";
import { sliceLines } from "../../components/codeLines";
import { EvidenceList } from "../../components/EvidenceList";
import { ToneTag } from "../../components/Tags";
import { ScrawlArrow, ScrawlUnderline } from "../../components/Scrawl";
import { useReveal } from "../../components/useReveal";
import { useAuth } from "../auth/AuthContext";
import { PLANS, DILIGENCE_PACK, AVAILABILITY_LABEL } from "../../config/plans";
import { SAMPLE_CORPUS, RATE_LIMIT_BEFORE, SAMPLE_REPOSITORY } from "../demo/sampleRepo";
import { SAMPLE_MATCH_SNAPSHOT as SNAP } from "../demo/sampleSnapshot";
import "./marketing.css";

const STEPS = [
  { icon: CodeXml, title: "Check", body: "Point PoryGen at a GitHub repository. It reads the code — it never runs it." },
  { icon: GitCompare, title: "Compare", body: "Names, formatting, and comments are normalized away, so a renamed copy still matches." },
  { icon: ShieldCheck, title: "Understand", body: "See your code beside the possible source, with the license and the reason it was flagged." },
  { icon: PencilLine, title: "Fix", body: "Replace or rewrite it, dismiss a false positive, or accept the risk and say why." },
  { icon: RefreshCw, title: "Rescan", body: "PoryGen checks again. If the match is gone, the finding closes itself." },
  { icon: History, title: "Stay protected", body: "Keep checking as the code keeps coming, with every decision on record." },
];

const DECISIONS = [
  { title: "Inspect", body: "Side by side, line by line, with the evidence and the license in view." },
  { title: "Replace or rewrite", body: "Swap in a library or your own implementation. PoryGen records the fix." },
  { title: "Mark it reviewed", body: "Let the team know someone is on it." },
  { title: "Dismiss a false positive", body: "Common idioms happen. Dismiss with a note and it stays dismissed." },
  { title: "Accept the risk", body: "Keep it, meet the license terms, and write down why." },
  { title: "Rescan", body: "PoryGen checks again. A clean result closes the finding for you." },
];

const source = SAMPLE_CORPUS.find((entry) => entry.id === SNAP.candidateId)!;
const yourCode = sliceLines(RATE_LIMIT_BEFORE, 1, 12, 34);
const theirCode = sliceLines(source.source, 1, 10, 32);
const pct = (value: number) => `${Math.round(value * 100)}%`;

function Hero() {
  const { user } = useAuth();
  return (
    <section className="hero" aria-labelledby="hero-title">
      <Picture
        className="hero-media"
        landscape={{ name: "hero-ridge", widths: [960, 1600, 2560] }}
        portrait={{ name: "hero-ridge-portrait", widths: [720, 900] }}
        portraitMaxWidth={900}
        width={2560}
        height={1072}
        alt="A trail runner crossing a high mountain ridge at first light, with mist filling the valleys below."
        priority
      />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="shell hero-content">
        <h1 id="hero-title" className="display hero-title">
          <span className="hero-line">Move fast.</span>
          <span className="hero-line">Keep it yours.</span>
        </h1>
        <p className="hero-lede">
          PoryGen checks the code AI agents put into your product for suspicious source similarity and license risk
          before it ships.
        </p>
        <div className="hero-actions">
          <Link to={user ? "/repositories/new" : "/sign-up"} className="btn btn-primary">
            Scan a repo
          </Link>
          <Link to="/demo" className="btn btn-secondary">
            See live demo
          </Link>
        </div>
        <p className="hero-note">Free for one repository. No credit card.</p>
      </div>
    </section>
  );
}

function Problem() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="section problem" aria-labelledby="problem-title">
      <div ref={ref} className="shell problem-grid reveal">
        <h2 id="problem-title" className="display problem-statement">
          Coding agents write more code in an afternoon than anyone on your team could check by hand.
        </h2>
        <div className="problem-body">
          <p>
            Claude Code, Cursor, Codex, Copilot, Replit, Lovable, Bolt, Windsurf — whichever you use, it learned from an
            enormous amount of other people's code. Nearly everything it hands you is fine.
          </p>
          <p>
            Once in a while it hands you something that closely tracks one specific project, with that project's license
            attached. Nobody spots that by reading a diff. It takes a comparison.
          </p>
        </div>
      </div>
      <div className="shell">
        <blockquote className="thesis">
          <p className="display">
            If AI coding becomes normal, checking what the AI gave you should become{" "}
            <span className="thesis-mark">
              normal too.
              <ScrawlUnderline className="thesis-scrawl" />
            </span>
          </p>
        </blockquote>
      </div>
    </section>
  );
}

function Product() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="section product" aria-labelledby="product-title">
      <div className="shell">
        <div ref={ref} className="section-head reveal">
          <h2 id="product-title" className="display section-title">
            Another set of eyes on what your AI gave you.
          </h2>
          <p className="lede">
            PoryGen reads the code in your repository, compares its structure with known reference source, and checks the
            licenses your dependencies carry. When something looks borrowed, you see what it resembles, where, under which
            license — and what to do next.
          </p>
        </div>
        <ol className="steps">
          {STEPS.map((step, index) => (
            <li className="step" key={step.title}>
              <step.icon className="step-icon" aria-hidden="true" strokeWidth={1.4} />
              <h3 className="step-title">
                <span className="step-index">{index + 1}</span>
                {step.title}
              </h3>
              <p className="step-body">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="coverage-note">
          Today PoryGen compares against its bundled reference corpus and looks up npm and PyPI licenses. It never claims
          to have searched the whole internet; broader source corpora are on the roadmap.{" "}
          <Link to="/how-it-works" className="link-arrow">
            How PoryGen compares code <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </p>
      </div>
    </section>
  );
}

function FindingShowcase() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="section on-sand showcase" aria-labelledby="showcase-title">
      <div className="shell">
        <div ref={ref} className="section-head reveal">
          <h2 id="showcase-title" className="display section-title">
            A flag you can act on.
          </h2>
          <p className="lede">
            Not a percentage of “AI-ness.” A specific file, a possible source, the evidence, and the license that comes with
            it.
          </p>
        </div>

        <article className="finding-card" aria-label="Sample finding">
          <header className="finding-card-head">
            <ToneTag tone="strong">Strong source match</ToneTag>
            <span className="finding-card-file mono">{SNAP.path}</span>
            <span className="finding-card-sample">Sample finding · fictional repository</span>
          </header>
          <div className="finding-card-body">
            <div className="finding-card-code">
              <CodeCompare
                left={{
                  label: "Your code",
                  path: `${SAMPLE_REPOSITORY.name}/${SNAP.path}`,
                  code: yourCode.code,
                  startLine: yourCode.startLine,
                  highlight: SNAP.probeLines,
                }}
                right={{
                  label: "Possible source",
                  path: `${SNAP.sourceRepository}/${SNAP.sourcePath}`,
                  code: theirCode.code,
                  startLine: theirCode.startLine,
                  highlight: SNAP.candidateLines,
                }}
              />
              <p className="annotation" aria-hidden="true">
                <ScrawlArrow className="annotation-arrow" />
                <span className="hand">same shape, new names</span>
              </p>
            </div>
            <EvidenceList
              className="finding-card-evidence evidence-stacked"
              items={[
                {
                  term: "Similarity",
                  detail: (
                    <>
                      <span className="big">{pct(SNAP.containment)}</span>
                      <span className="sub">
                        {SNAP.sharedFingerprints} of {SNAP.candidateFingerprints} structural fingerprints shared
                      </span>
                    </>
                  ),
                },
                { term: "Where", detail: "Lines 3–41 of your file, lines 1–32 of the source" },
                {
                  term: "Possible source",
                  detail: (
                    <>
                      {SNAP.candidateTitle}
                      <span className="sub">Fictional public project — sample data</span>
                    </>
                  ),
                },
                { term: "License", detail: <>GPL-3.0 <span className="sub">Strong copyleft: derived code may have to ship under the same license.</span></> },
                { term: "Why it was flagged", detail: "Same control flow and data structures with every identifier renamed — a pattern renaming can't hide." },
              ]}
            />
          </div>
        </article>
        <p className="showcase-cta">
          <Link to="/demo" className="link-arrow">
            Walk through the whole loop in the live demo <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </p>

        <div className="decisions">
          <h2 className="display section-title decisions-title">Every flag ends in a decision.</h2>
          <dl className="decision-list">
            {DECISIONS.map((d) => (
              <div className="decision" key={d.title}>
                <dt>{d.title}</dt>
                <dd>{d.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Protection() {
  return (
    <section className="protection" aria-labelledby="protection-title">
      <Picture
        className="protection-media"
        landscape={{ name: "lookout-dusk", widths: [960, 1600, 2048] }}
        width={2048}
        height={1152}
        sizes="(max-width: 900px) 100vw, 55vw"
        alt="A fire lookout tower on a forested ridge at dusk, one window lit, town lights in the valley below."
      />
      <div className="protection-content">
        <h2 id="protection-title" className="display section-title">
          Stay protected while the code keeps coming.
        </h2>
        <p className="lede">
          Agents don't stop at one pull request, and the check shouldn't either. Rescan whenever you ship: fixes close
          themselves, and the decisions you've made carry forward instead of resurfacing.
        </p>
        <dl className="status-list">
          <div>
            <dt>
              <span className="tag tag-clear">{AVAILABILITY_LABEL.available}</span>
            </dt>
            <dd>Public GitHub repositories, on-demand scans and rescans, automatic resolution on a clean rescan.</dd>
          </div>
          <div>
            <dt>
              <span className="tag tag-review">{AVAILABILITY_LABEL.in_development}</span>
            </dt>
            <dd>Checks on every push and pull request, private repositories through a GitHub App, and PR status checks.</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Record() {
  const ref = useReveal<HTMLDivElement>();
  const steps = [
    { label: "Found", note: `Strong source match in ${SNAP.path}` },
    { label: "Reviewed", note: "You started a review" },
    { label: "Remediated", note: `Replacement recorded in ${SAMPLE_REPOSITORY.fixCommit}` },
    { label: "Rescanned", note: `Similarity now ${pct(SNAP.afterContainment)}, below the threshold` },
    { label: "Resolved", note: "Closed by PoryGen" },
  ];
  return (
    <section className="section record" aria-labelledby="record-title">
      <div className="shell">
        <div ref={ref} className="record-grid reveal">
          <h2 id="record-title" className="display section-title">
            The record builds itself.
          </h2>
          <p className="lede">
            Every check, flag, decision, and fix is kept. When a customer, an investor, or an acquirer asks how you handle
            AI-generated code, you'll have a record instead of a reassurance. A record — not a certificate.
          </p>
        </div>
        <ol className="record-steps" aria-label="A sample resolution history">
          {steps.map((step) => (
            <li className="record-step" key={step.label}>
              <span className="record-mark" aria-hidden="true" />
              <span className="record-label">{step.label}</span>
              <span className="record-note">{step.note}</span>
            </li>
          ))}
        </ol>
        <p className="fine record-caption">From the live demo's sample repository.</p>
      </div>
    </section>
  );
}

function PricingSummary() {
  return (
    <section className="section pricing-summary" aria-labelledby="pricing-summary-title">
      <div className="shell">
        <div className="section-head">
          <h2 id="pricing-summary-title" className="display section-title">
            Start free. Pay when it’s watching every day.
          </h2>
        </div>
        <div className="plan-row">
          {PLANS.map((plan) => (
            <div className={`plan-mini${plan.recommended ? " plan-mini-recommended" : ""}`} key={plan.id}>
              <h3 className="plan-mini-name">{plan.name}</h3>
              <p className="plan-mini-price">
                <span className="display">{plan.priceLabel}</span> <span className="muted">{plan.cadence}</span>
              </p>
              <p className="plan-mini-summary">{plan.summary}</p>
            </div>
          ))}
        </div>
        <p className="pricing-summary-foot">
          {DILIGENCE_PACK.name}: {DILIGENCE_PACK.priceLabel.toLowerCase()}, {DILIGENCE_PACK.cadence} — an optional export for
          buyers and counsel.{" "}
          <Link to="/pricing" className="link-arrow">
            Compare plans <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="final" aria-labelledby="final-title">
      <Picture
        className="final-media"
        landscape={{ name: "desk-window", widths: [960, 1600, 2048] }}
        width={2048}
        height={1152}
        alt="A laptop and an open notebook on a wooden desk by a window, mountains glowing in evening light outside."
      />
      <div className="final-scrim" aria-hidden="true" />
      <div className="shell final-content">
        <h2 id="final-title" className="display final-title">
          Want PoryGen watching your real repo?
        </h2>
        <div className="hero-actions">
          <Link to={user ? "/repositories/new" : "/sign-up"} className="btn btn-primary">
            Scan your repo
          </Link>
          <Link to="/demo" className="btn btn-secondary">
            See the live demo
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Product />
      <FindingShowcase />
      <Protection />
      <Record />
      <PricingSummary />
      <FinalCta />
    </>
  );
}

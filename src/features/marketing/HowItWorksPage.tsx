import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { REFERENCE_CORPUS, REFERENCE_CORPUS_VERSION, SIMILARITY_THRESHOLDS, WINNOW_K, WINNOW_W } from "@porygen/provenance-core";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import "./marketing.css";

const PCT = (n: number) => `${Math.round(n * 100)}%`;

const PROVIDERS = [
  { name: "PoryGen reference corpus", status: "Live", scope: `${REFERENCE_CORPUS.length} original reference implementations (v${REFERENCE_CORPUS_VERSION}), bundled with the scanner.` },
  { name: "Licensed source corpora", status: "Planned", scope: "Larger bodies of public source, licensed for comparison." },
  { name: "Commercial source intelligence", status: "Planned", scope: "Services that already index open source at scale." },
  { name: "GitHub candidate discovery", status: "Planned", scope: "Finding likely candidates among public repositories, then comparing them precisely." },
  { name: "Your private corpus", status: "Planned", scope: "Your own internal code or a client's, for agencies and larger teams." },
];

const CATEGORIES = [
  { name: "Software composition analysis and SBOM tools", question: "Does this code or package resemble known open source, and what license applies?" },
  { name: "Agent attribution tools", question: "Which agent or person introduced this code?" },
  { name: "Technical due diligence", question: "What risk exists in this codebase today, at a point in time?" },
  {
    name: "PoryGen",
    question:
      "Continuously check the code AI-assisted teams ship, show suspicious ancestry and license context, help resolve it, verify the fix, and keep the record.",
  },
];

export function HowItWorksPage() {
  useDocumentTitle("How it works — PoryGen");
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <h1 className="display">How PoryGen checks what your AI wrote.</h1>
          <p className="lede">
            Six steps, one loop. The matching engine is a component; the product is what happens around it — understanding a
            flag, fixing it, and proving the fix held.
          </p>
        </div>
      </section>

      <div className="shell split-rows">
        <section className="split-row" aria-labelledby="hiw-check">
          <div className="split-row-head">
            <span className="step-index">1</span>
            <h2 id="hiw-check">Check</h2>
          </div>
          <div className="prose-block">
            <p>
              Give PoryGen a public GitHub repository. It fetches files over a fixed allowlist of GitHub hosts — never an
              arbitrary URL — and reads them as text. Nothing is executed, installed, or built.
            </p>
            <ul>
              <li>Up to 40 files per scan, 200 KB per file, 2 MB in total. Vendor, build, and dependency folders are skipped.</li>
              <li>Private repositories and automatic checks on every push are in development, through a GitHub App.</li>
            </ul>
          </div>
        </section>

        <section className="split-row" aria-labelledby="hiw-compare">
          <div className="split-row-head">
            <span className="step-index">2</span>
            <h2 id="hiw-compare">Compare</h2>
          </div>
          <div className="prose-block">
            <p>
              Each code file is normalized: identifiers, literals, comments, and whitespace collapse away, leaving structure.
              Renaming every variable or reformatting a file doesn't change the result. The normalized stream is fingerprinted
              with Winnowing (k = {WINNOW_K}, window = {WINNOW_W}) and compared against reference sources by containment — the
              share of a source's fingerprints that appear in your file.
            </p>
            <p>
              Sources come from <strong>similarity providers</strong>. Every finding records which provider produced it and
              what that provider can honestly claim to cover. Swapping or adding providers doesn't change anything you do with a
              finding.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Provider</th>
                    <th scope="col">Status</th>
                    <th scope="col">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {PROVIDERS.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>
                        <span className={`tag ${p.status === "Live" ? "tag-clear" : "tag-quiet"}`}>{p.status}</span>
                      </td>
                      <td>{p.scope}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine">
              Today, a scan compares against the bundled reference corpus only. It is not a search of GitHub, package registries,
              or the open internet, and PoryGen never says otherwise. The deployed scanner uses a lexical normalizer; the same
              package runs full tree-sitter parsing for JavaScript, TypeScript, and Python in workers and local runs.
            </p>
          </div>
        </section>

        <section className="split-row" aria-labelledby="hiw-understand">
          <div className="split-row-head">
            <span className="step-index">3</span>
            <h2 id="hiw-understand">Understand</h2>
          </div>
          <div className="prose-block">
            <p>Every file lands in one of four bands, and every flag shows your code beside the possible source.</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Band</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="tag tag-clear">Clear</span></td>
                    <td>Containment below {PCT(SIMILARITY_THRESHOLDS.report)} against every source checked.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag-common">Common pattern</span></td>
                    <td>A match to a widely re-implemented idiom under a permissive license. Informational.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag-review">Review suggested</span></td>
                    <td>Containment from {PCT(SIMILARITY_THRESHOLDS.report)} up to {PCT(SIMILARITY_THRESHOLDS.strong)}.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag-strong">Strong source match</span></td>
                    <td>Containment of {PCT(SIMILARITY_THRESHOLDS.strong)} or more.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              License context comes with it: the possible source's license, what that family of license usually requires, and
              for dependencies, the license resolved from npm or PyPI. A strong match to a strong-copyleft source is treated as
              blocking until someone decides.
            </p>
          </div>
        </section>

        <section className="split-row" aria-labelledby="hiw-fix">
          <div className="split-row-head">
            <span className="step-index">4</span>
            <h2 id="hiw-fix">Fix</h2>
          </div>
          <div className="prose-block">
            <p>Every flag ends in a decision, and every decision is written down:</p>
            <ul>
              <li>Start a review, so the team knows someone is on it.</li>
              <li>Record a fix after replacing or rewriting the code.</li>
              <li>Dismiss a false positive — a reason is required, and it stays dismissed across rescans.</li>
              <li>Accept the risk — a reason is required, and it's kept with the finding.</li>
            </ul>
          </div>
        </section>

        <section className="split-row" aria-labelledby="hiw-rescan">
          <div className="split-row-head">
            <span className="step-index">5</span>
            <h2 id="hiw-rescan">Rescan</h2>
          </div>
          <div className="prose-block">
            <p>
              Only a scan can close a finding. It resolves when the next scan provably re-checked it and no longer sees it: the
              file was compared again by the same provider, the dependency manifests were evaluated again, or the file is gone
              from the repository. A scan that hit its limits never resolves anything. If a resolved finding comes back, it
              reopens on its own.
            </p>
          </div>
        </section>

        <section className="split-row" aria-labelledby="hiw-protect">
          <div className="split-row-head">
            <span className="step-index">6</span>
            <h2 id="hiw-protect">Stay protected</h2>
          </div>
          <div className="prose-block">
            <p>
              Each finding keeps an append-only resolution history: detected, reviewed, fix recorded, clean rescan, resolved.
              Nobody — including PoryGen's own services — can edit a history entry after it's written.
            </p>
            <p>
              For teams that want finer attribution, an optional VS Code extension records the shape of edits (size and speed,
              never content) as editor attribution. PoryGen works without it: Git history and scans are the universal path.
            </p>
          </div>
        </section>
      </div>

      <section className="section" aria-labelledby="hiw-position">
        <div className="shell">
          <div className="section-head">
            <h2 id="hiw-position" className="display section-title">
              Where PoryGen fits.
            </h2>
            <p className="lede">
              PoryGen didn't invent fingerprinting, SCA, SBOMs, or attribution — each has mature tools. What it adds is the join:
              source similarity and license context, for the code AI-assisted teams actually ship, carried through to a verified
              fix.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">The question it answers</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{c.question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cta-row">
            <Link to="/demo" className="btn btn-primary">
              See live demo
            </Link>
            <Link to="/security" className="link-arrow">
              Where your code goes <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

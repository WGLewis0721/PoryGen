import { useDocumentTitle } from "../../components/useDocumentTitle";
import "./marketing.css";

const STORED = [
  { what: "Scan records", detail: "Repository name, branch, file and dependency counts, risk level, and the scan log." },
  { what: "Findings", detail: "File path, line range, similarity evidence, license context, and — for flagged files only — an excerpt of the matched region, capped at 40 lines." },
  { what: "Resolution history", detail: "Who did what to each finding, when, and why. Append-only." },
  { what: "Dependency inventory", detail: "Package names, versions, and resolved licenses, as a CycloneDX document." },
  { what: "Account", detail: "Email, display name, and — if you pay — your Stripe customer ID. Card details never reach PoryGen." },
];

export function SecurityPage() {
  useDocumentTitle("Security and data — PoryGen");
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <h1 className="display">Where your code goes, and where it doesn’t.</h1>
          <p className="lede">
            A tool that checks for borrowed code has to be careful with yours. Here is exactly what PoryGen reads, keeps, and
            refuses to do — and what it doesn't claim.
          </p>
        </div>
      </section>

      <div className="shell split-rows">
        <section className="split-row" aria-labelledby="sec-read">
          <div className="split-row-head">
            <h2 id="sec-read">What PoryGen reads</h2>
          </div>
          <div className="prose-block">
            <p>
              Public GitHub repositories you submit, fetched only from <code>api.github.com</code> and{" "}
              <code>raw.githubusercontent.com</code>. Repository names are validated before any request; PoryGen never follows
              an arbitrary URL you or anyone else supplies.
            </p>
            <ul>
              <li>At most 40 files, 200 KB each, 2 MB per scan. Dependency, build, and vendor folders are skipped.</li>
              <li>Dependency licenses are looked up on the npm registry and PyPI — only the package name leaves PoryGen.</li>
            </ul>
          </div>
        </section>

        <section className="split-row" aria-labelledby="sec-never">
          <div className="split-row-head">
            <h2 id="sec-never">What it never does</h2>
          </div>
          <div className="prose-block">
            <ul>
              <li>Execute, install, or build anything from your repository. Files are read as text and fingerprinted.</li>
              <li>Train or fine-tune any model on your code.</li>
              <li>Send your code to a third-party AI service.</li>
              <li>Store the contents of files that weren't flagged.</li>
            </ul>
          </div>
        </section>

        <section className="split-row" aria-labelledby="sec-keep">
          <div className="split-row-head">
            <h2 id="sec-keep">What it keeps</h2>
          </div>
          <div className="prose-block">
            <div className="table-scroll">
              <table className="data-table">
                <tbody>
                  {STORED.map((row) => (
                    <tr key={row.what}>
                      <td>{row.what}</td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Deleting a repository deletes its scans, findings, and resolution history. Data lives in a Supabase Postgres
              database with row-level security: every query is scoped to the signed-in account, and a finding's status can only
              change through checked server-side functions.
            </p>
          </div>
        </section>

        <section className="split-row" aria-labelledby="sec-pay">
          <div className="split-row-head">
            <h2 id="sec-pay">Payments</h2>
          </div>
          <div className="prose-block">
            <p>
              Checkout happens on Stripe's hosted page. A plan only changes after PoryGen receives a Stripe webhook whose
              signature it has verified — landing on a success page is never treated as proof of payment. Stripe keys live in
              server-side secrets and never ship to the browser.
            </p>
          </div>
        </section>

        <section className="split-row" id="claims" aria-labelledby="sec-claims">
          <div className="split-row-head">
            <h2 id="sec-claims">What PoryGen doesn’t claim</h2>
          </div>
          <div className="prose-block">
            <ul>
              <li>
                <strong>Not exhaustive.</strong> A clear result means nothing matched the sources that scan compared against —
                today, PoryGen's bundled reference corpus. It is not a search of the entire internet.
              </li>
              <li>
                <strong>Not proof of copying.</strong> Similarity is evidence for a human to review. Independent work can look
                alike.
              </li>
              <li>
                <strong>Not legal advice.</strong> License context describes what a license family usually requires; your
                obligations are for you and your counsel to decide.
              </li>
              <li>
                <strong>Not a certification.</strong> The resolution history is a record of what was checked and decided, not a
                guarantee of originality or non-infringement.
              </li>
              <li>
                <strong>Not an AI detector.</strong> PoryGen doesn't claim to tell whether code was written by a model. The
                optional editor extension records the shape of edits — size and timing, never content — as a heuristic.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

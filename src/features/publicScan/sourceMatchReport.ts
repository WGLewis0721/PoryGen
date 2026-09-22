import type { Finding, Range, ScanResult } from "./types";

export type ScanDecision = { status: "reviewing" | "dismissed"; reason?: string; at: string };
export type FolderSelection = {
  sent: number; excluded: number; omittedDependencies: number;
  omittedBinary: number; omittedTooLarge: number; trimmed: number;
};
export type ReportContext = { completedAt: string; label: string; folder?: FolderSelection };

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);
const lines = (range: Range | null) => range ? `lines ${range.start}–${range.end}` : "line range unavailable";
const list = (items: string[]) => items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : "<p>None recorded.</p>";
const counts = (items: Record<string, number>) => list(Object.entries(items).map(([reason, count]) => `${reason.replaceAll("_", " ")}: ${count}`));
function link(url: string | null | undefined, label: string) {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) {
      return `<a href="${escape(parsed.href)}" rel="noreferrer">${escape(label)}</a>`;
    }
  } catch { /* Missing or unsafe metadata stays plain text. */ }
  return escape(label);
}
function evidence(label: string, excerpt: string) {
  const compact = excerpt.slice(0, 4000);
  return `<div><h4>${label}</h4><pre>${escape(compact || "No excerpt recorded.")}</pre>${excerpt.length > compact.length ? "<p>Excerpt shortened for this report.</p>" : ""}</div>`;
}
function findingHtml(finding: Finding, decision?: ScanDecision) {
  const source = finding.publicSource;
  let url = source?.url;
  if (url && source?.lines) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "github.com") {
        parsed.hash = `L${source.lines.start}-L${source.lines.end}`;
        url = parsed.href;
      }
    } catch { /* link() will render invalid URLs as plain text. */ }
  }
  const status = decision?.status === "dismissed" ? "Dismissed" : decision?.status === "reviewing" ? "In review" : "Open";
  return `<article><h3>${escape(finding.customer.path)} · ${escape(lines(finding.customer.lines))}</h3>
<p><strong>${status}</strong>${decision ? ` · ${escape(decision.at)}${decision.reason ? ` · ${escape(decision.reason)}` : ""}` : ""}</p>
<dl><dt>Likely public source</dt><dd>${source ? link(url, `${source.repository}/${source.path}`) : "Not recorded"}${source ? ` · ${escape(lines(source.lines))}` : ""}</dd>
<dt>Source version / commit</dt><dd class="mono">${escape(source?.commit || "Not recorded")}</dd>
<dt>License metadata</dt><dd>${link(source?.licenseUrl, source?.license || "No license recorded")}</dd></dl>
<p>${escape(finding.explanation)}</p>
${finding.metrics ? `<p>Matched tokens: ${finding.metrics.matchedTokens} · longest contiguous match: ${finding.metrics.contiguousTokens} · affected-code coverage: ${Math.round(finding.metrics.customerCoverage * 100)}% · source coverage: ${Math.round(finding.metrics.sourceCoverage * 100)}%</p>` : ""}
<div class="evidence">${evidence("Affected code", finding.customer.excerpt)}${evidence("Public source", source?.excerpt ?? "")}</div>
<p class="next">Next: inspect the pinned source and license, confirm context, and record your review. Dismissal is a user decision; it does not remove the match evidence.</p></article>`;
}

/** Offline artifact: no scripts, remote assets, storage writes, or source upload. */
export function renderSourceMatchReport(result: ScanResult, decisions: Record<string, ScanDecision>, context: ReportContext, exportedAt = new Date().toISOString()) {
  const upload = result.source?.type === "zip" || result.source?.type === "files";
  const strong = result.findings.filter((f) => f.classification === "strong_match");
  const possible = result.findings.filter((f) => f.classification === "possible_common_pattern");
  const partial = result.scan.partial || result.scan.incompleteSupportedFiles > 0 || (!upload && !result.scan.treeComplete) || result.scan.ingestion?.selectionComplete === false || Boolean(context.folder && (context.folder.trimmed || context.folder.omittedTooLarge));
  const empty = result.scan.checkedFiles.length === 0;
  const heading = empty ? "No eligible files were checked" : partial ? "Partial scan — coverage is incomplete" : "Scan completed within the submitted scope";
  const folder = context.folder;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>Source Match Report — ${escape(context.label)}</title>
<style>
*{box-sizing:border-box}body{font:15px/1.6 system-ui,sans-serif;color:#182b28;background:#f4f6f3;margin:0}main{max-width:1040px;margin:32px auto;padding:40px;background:white;border:1px solid #d5ded8}h1{font:normal 42px/1.15 Georgia,serif;margin:10px 0}h2{font-size:23px;border-bottom:1px solid #ccd7d0;padding-bottom:10px;margin-top:36px}h3{font-size:18px}h4{margin:8px 0}a{color:#15624d}p,li,dd,h3{overflow-wrap:anywhere}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px}.notice{padding:16px;border-left:4px solid #a97d27;background:#faf5e9}dl{display:grid;grid-template-columns:180px 1fr;gap:8px}dt{font-weight:600}dd{margin:0}article{padding:12px 0 24px;border-bottom:1px solid #d5ded8}.evidence{display:grid;grid-template-columns:1fr 1fr;gap:16px}.evidence>div{min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f3;padding:14px;font:12px/1.5 monospace}.mono{font-family:monospace}.next,.muted{color:#52635b;font-size:13px}@media(max-width:640px){main{margin:0;padding:20px}h1{font-size:32px}.evidence{grid-template-columns:1fr}dl{grid-template-columns:1fr}}@media print{@page{margin:16mm}body{background:white;font-size:10pt}main{margin:0;padding:0;border:0;max-width:none}.print-help{display:none}h2,h3,h4{break-after:avoid}pre{font-size:8pt}a{color:inherit}article{break-inside:auto}}
</style></head><body><main><header><p class="eyebrow">PoryGen · Source evidence</p><h1>Source Match Report</h1><p>${escape(context.label)}</p><p class="muted">Scan completed (browser time): ${escape(context.completedAt)}<br>Exported: ${escape(exportedAt)} · Report format v1</p><p class="print-help">Keep this HTML file for an offline report. To save a PDF, open your browser’s Print menu and choose Save as PDF. This file contains code excerpts; share it deliberately.</p></header>
<section><h2>What was scanned</h2><dl><dt>Input</dt><dd>${escape(result.source?.type === "zip" ? "Uploaded ZIP" : result.source?.type === "files" ? "Selected local folder files" : "Public GitHub repository")}</dd><dt>Project</dt><dd>${link(result.repository.url, result.repository.name)}</dd><dt>${upload ? "Content digest (not a Git commit)" : "Git commit"}</dt><dd class="mono">${link(result.repository.commitUrl, result.repository.commit || "Not recorded")}</dd></dl></section>
<section><h2>Coverage and completeness</h2><p class="notice"><strong>${heading}.</strong> ${empty ? "This is not a clean result." : "No match is not proof of originality."}</p><p>${escape(result.coverage.claim.replace(/^This lab searches/, "PoryGen currently searches"))}</p>
<p>${result.scan.checkedFiles.length} files checked · ${result.scan.fetchedFiles} files fetched · ${result.scan.fetchedBytes} source bytes fetched · ${(result.scan.elapsedMs / 1000).toFixed(1)} seconds.</p><p>${result.scan.supportedFilesInTree.length} supported paths observed; ${result.scan.incompleteSupportedFiles} supported files incomplete; ${result.scan.skippedCount} entries skipped by the scanner.</p>
<p>${upload ? "Only submitted files were considered. Uploads do not establish completeness of the original project or prove that absent files were deleted." : result.scan.treeComplete ? "GitHub tree listing was complete. Only supported, eligible files were checked." : "GitHub tree listing was incomplete; additional files may be missing from this report."}</p>
<h3>Incomplete reasons</h3>${counts(result.scan.incompleteReasons ?? {})}
${result.scan.ingestion ? `<h3>Upload ingestion omissions</h3>${counts(result.scan.ingestion.skippedReasons)}` : ""}
${folder ? `<h3>Folder selection before upload</h3><p>${folder.sent} files sent; ${folder.excluded} excluded; ${folder.omittedDependencies} dependency/build files omitted; ${folder.omittedBinary} binary files omitted; ${folder.omittedTooLarge} oversized files omitted; ${folder.trimmed} files omitted at the request limit. These counts are separate from server ingestion counts.</p>` : ""}
<h3>Checked files</h3>${list(result.scan.checkedFiles)}
${result.scan.skipped?.length ? `<h3>Skipped file details (may be capped)</h3>${list(result.scan.skipped.map((item) => `${item.path}: ${item.reason}`))}` : ""}</section>
<section><h2>Exclusions</h2><p>Exact file/folder rules applied before matching. Excluding a path does not resolve an earlier finding.</p>${list(result.scan.exclusions ?? [])}<p>${result.scan.excludedFiles ?? 0} submitted entries excluded by the scanner${folder ? `; ${folder.excluded} additional entries excluded before folder upload` : ""}.</p></section>
<section><h2>Strong findings (${result.summary.strong})</h2><p>${strong.filter((f) => decisions[f.id]?.status !== "dismissed").length} open or in review among the findings included below. Dismissed findings remain in this report.</p>${strong.length ? strong.map((f) => findingHtml(f, decisions[f.id])).join("") : "<p>No strong findings returned within the checked scope.</p>"}${result.summary.strong > strong.length ? `<p>Only ${strong.length} of ${result.summary.strong} strong findings were returned by the scanner.</p>` : ""}</section>
<section><h2>Possible / common patterns (${result.summary.possible})</h2><p>These are weaker similarities and may be common utility code. They are not strong findings. Included: ${possible.length} of ${result.summary.possible}; the scanner may cap returned evidence.</p>${possible.map((f) => findingHtml(f, decisions[f.id])).join("") || "<p>None returned.</p>"}</section>
<section><h2>Limitations</h2><ul><li>Search covers indexed public sources only, not all public or private code.</li><li>Similarity is not proof of copying, provenance, infringement, or originality. This report is not legal advice or a certificate.</li><li>License and version information is recorded source metadata, not a conclusion about your obligations. Missing license metadata does not mean permission to use.</li><li>Unsupported languages, dependency/vendor/build/generated paths, binaries, exclusions, and files outside scan limits are not checked.</li><li>Excerpts are compact evidence, not complete files. Open the source to review full context.</li><li>“In review” records a review action, not completed approval. Dismissals are user decisions, not independent verification.</li><li>This is an editable snapshot of one scan and its current decisions, not a signed audit record. Scan time is the browser’s completion time; source revision/digest identifies the scanned content.</li></ul><p>${escape(result.disclaimer)}</p><p>Insufficient-evidence outcomes recorded by the engine: ${result.summary.insufficient}. These are abstentions, not originality claims.</p></section>
</main></body></html>`;
}

export function downloadSourceMatchReport(result: ScanResult, decisions: Record<string, ScanDecision>, context: ReportContext) {
  const blob = new Blob([renderSourceMatchReport(result, decisions, context)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `porygen-source-match-report-${context.completedAt.slice(0, 10)}.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // MDN blob URLs: release the reference, but allow the download to start first.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

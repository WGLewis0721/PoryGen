import { analyzeRescanResolution } from "./resolution.mjs";

const form = document.querySelector("#scan-form");
const repositoryInput = document.querySelector("#repository-url");
const scanButton = document.querySelector("#scan-button");
const status = document.querySelector("#status");
const progressWrap = document.querySelector("#progress-wrap");
const progressLabel = document.querySelector("#progress-label");
const results = document.querySelector("#results");
const scanMeta = document.querySelector("#scan-meta");
const resolvedBox = document.querySelector("#resolved");
const template = document.querySelector("#finding-template");

const dismissals = new Map();
let previousScan = null;
let lastRepositoryUrl = "";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pct(value) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function lineLabel(range) {
  if (!range) return "No matching line range";
  return range.start === range.end ? `line ${range.start}` : `lines ${range.start}-${range.end}`;
}

function classificationLabel(value) {
  if (value === "strong_match") return "Strong match";
  if (value === "possible_common_pattern") return "Possible / common pattern";
  return "Insufficient evidence";
}

function matchIds(scan) {
  return new Set(
    (scan?.findings ?? [])
      .filter((finding) => finding.classification !== "insufficient_evidence")
      .map((finding) => finding.id),
  );
}

function renderMeta(data) {
  const { repository, scan, coverage, summary } = data;
  scanMeta.hidden = false;
  scanMeta.innerHTML = `
    <div class="meta-grid">
      <span><strong>Repository:</strong> ${escapeHtml(repository.name)}</span>
      <span><strong>Commit:</strong> <a href="${escapeHtml(repository.commitUrl)}" target="_blank" rel="noreferrer">${escapeHtml(repository.commit.slice(0, 12))}</a></span>
      <span><strong>Fetched:</strong> ${scan.fetchedFiles} files / ${Math.round(scan.fetchedBytes / 1024)} KB</span>
      <span><strong>Time:</strong> ${scan.elapsedMs} ms</span>
      <span><strong>Findings:</strong> ${summary.strong} strong, ${summary.possible} possible</span>
    </div>
    <p>${escapeHtml(coverage.claim)}</p>
    ${scan.partial ? `<p class="warning"><strong>Partial scan.</strong> Some files or provider operations were skipped. Skipped: ${scan.skippedCount}; provider errors: ${scan.providerErrors.length}.</p>` : ""}
    ${scan.skipped?.length ? `<details class="warning"><summary>Skipped file details</summary><ul>${scan.skipped.slice(0, 20).map((item) => `<li>${escapeHtml(item.path)}: ${escapeHtml(item.reason)}</li>`).join("")}</ul></details>` : ""}
    ${scan.providerErrors?.length ? `<details class="warning"><summary>Provider errors</summary><ul>${scan.providerErrors.map((item) => `<li>${escapeHtml(item.file ?? "")}: ${escapeHtml(item.message)}</li>`).join("")}</ul></details>` : ""}
    <p><small>${escapeHtml(data.disclaimer)}</small></p>
    <button id="rescan-button" type="button">Rescan current repository</button>
  `;
  document.querySelector("#rescan-button").addEventListener("click", () => runScan(lastRepositoryUrl, true));
}

function renderResolved(data) {
  resolvedBox.hidden = true;
  resolvedBox.innerHTML = "";

  const { resolved, unverified } = analyzeRescanResolution(previousScan, data);
  if (resolved.length === 0 && unverified.length === 0) return;

  const sections = [];
  if (resolved.length > 0) {
    sections.push(`
      <strong>No longer found after rescan</strong>
      <ul>${resolved.map((finding) => `<li>${escapeHtml(finding.customer.path)}</li>`).join("")}</ul>
    `);
  }
  if (unverified.length > 0) {
    sections.push(`
      <strong>Status not changed: file was not successfully rechecked</strong>
      <ul>${unverified.map((finding) => `<li>${escapeHtml(finding.customer.path)}</li>`).join("")}</ul>
    `);
  }

  resolvedBox.hidden = false;
  resolvedBox.innerHTML = sections.join("");
}

function renderFindings(data) {
  results.innerHTML = "";
  const previousIds = matchIds(previousScan);
  const commitChanged = previousScan &&
    previousScan.repository.name === data.repository.name &&
    previousScan.repository.commit !== data.repository.commit;

  for (const finding of data.findings) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".finding");
    card.classList.add(finding.classification);
    if (finding.classification === "insufficient_evidence") card.classList.add("insufficient");

    fragment.querySelector(".classification").textContent = classificationLabel(finding.classification);
    fragment.querySelector(".finding-title").textContent = finding.customer.path;
    fragment.querySelector(".explanation").textContent = finding.explanation;

    const rescanState = fragment.querySelector(".rescan-state");
    if (commitChanged && finding.classification !== "insufficient_evidence") {
      rescanState.textContent = previousIds.has(finding.id) ? "Still present after rescan" : "New on this commit";
    }

    const metrics = fragment.querySelector(".metrics");
    if (finding.metrics) {
      metrics.innerHTML = `
        <span>customer coverage ${pct(finding.metrics.customerCoverage)}</span>
        <span>source coverage ${pct(finding.metrics.sourceCoverage)}</span>
        <span>ordered match ${finding.metrics.matchedTokens} tokens</span>
        <span>contiguous ${finding.metrics.contiguousTokens} tokens</span>
      `;
    }

    fragment.querySelector(".customer-location").textContent =
      `${finding.customer.path} · ${lineLabel(finding.customer.lines)}`;
    fragment.querySelector(".customer-code").textContent = finding.customer.excerpt || "No code excerpt for this classification.";

    if (finding.publicSource) {
      fragment.querySelector(".source-location").textContent =
        `${finding.publicSource.repository}/${finding.publicSource.path} · ${lineLabel(finding.publicSource.lines)}`;
      fragment.querySelector(".source-code").textContent = finding.publicSource.excerpt || "";
      const review = fragment.querySelector(".review-source");
      const lineAnchor = finding.publicSource.lines
        ? `#L${finding.publicSource.lines.start}-L${finding.publicSource.lines.end}`
        : "";
      review.href = finding.publicSource.url + lineAnchor;

      const license = fragment.querySelector(".license");
      license.innerHTML = finding.publicSource.licenseUrl
        ? `License metadata: <a href="${escapeHtml(finding.publicSource.licenseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(finding.publicSource.license)}</a>`
        : `License metadata: ${escapeHtml(finding.publicSource.license)}`;

      const reason = fragment.querySelector(".dismiss-reason");
      const dismissButton = fragment.querySelector(".dismiss-button");
      const dismissedNote = fragment.querySelector(".dismissed-note");

      function applyDismissed() {
        const value = dismissals.get(finding.id);
        if (!value) return;
        card.classList.add("dismissed");
        dismissedNote.hidden = false;
        dismissedNote.textContent = `Dismissed for this browser session: ${value}.`;
        dismissButton.disabled = true;
        reason.disabled = true;
      }

      dismissButton.addEventListener("click", () => {
        dismissals.set(finding.id, reason.options[reason.selectedIndex].text);
        applyDismissed();
      });
      applyDismissed();
    }

    results.appendChild(fragment);
  }
}

async function runScan(repositoryUrl, isRescan = false) {
  const url = String(repositoryUrl || "").trim();
  if (!url) return;

  lastRepositoryUrl = url;
  scanButton.disabled = true;
  progressWrap.hidden = false;
  progressLabel.textContent = isRescan
    ? "Fetching the repository's current commit and rescanning…"
    : "Fetching repository, retrieving candidates, and verifying matches…";
  status.textContent = "Scan in progress.";
  if (!isRescan) {
    results.innerHTML = "";
    scanMeta.hidden = true;
    resolvedBox.hidden = true;
  }

  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({ repositoryUrl: url }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scan failed.");

    renderResolved(data);
    renderMeta(data);
    renderFindings(data);

    const changed = previousScan &&
      previousScan.repository.name === data.repository.name &&
      previousScan.repository.commit !== data.repository.commit;
    status.textContent = changed
      ? `Rescan complete on new commit ${data.repository.commit.slice(0, 12)}.`
      : `Scan complete on commit ${data.repository.commit.slice(0, 12)}.`;

    previousScan = data;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Scan failed.";
  } finally {
    scanButton.disabled = false;
    progressWrap.hidden = true;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runScan(repositoryInput.value, false);
});

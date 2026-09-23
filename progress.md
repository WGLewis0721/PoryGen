# Progress

## Recent release train — latest 10 merged commits

1. `e883d51` / PR #13 — added versioned clickwrap Terms and scan trust fixes.
2. `0fd4baa` / PR #14 — fixed issues found in live user testing on the public scan flow.
3. `612bb98` / PR #15 — refreshed project facts for the shipped corpus and current limits.
4. `48c600e` / PR #16 — refreshed the roadmap around the current MVP and PoryGen Engine state.
5. `ac5dfe7` / PR #17 — added transient ZIP/folder ingestion through the existing Engine.
6. `188563f` / PR #18 — added ZIP/folder upload to the public scanner.
7. `8fed6d7` / PR #19 — refreshed documentation for the multi-input roadmap and architecture.
8. `a80a94c` / PR #21 — fixed founding-repository source-match, zero-file and partial-scan regressions.
9. `acef6da` / PR #22 — refreshed docs for the latest source-match production state.
10. `117e4af` / PR #20 — merged the downloadable Source Match Report while preserving PR #21 regression behavior.

PR #23 is merged and deployed at `a051093`. Empty GitHub repositories are now an explicit known-empty revision state rather than an ambiguous provider error.

## 2026-09-23 — Source Match Report shipped; all-public smoke exposed one edge case

PR #20 is merged at `117e4af`. The live scan flow now offers **Download Source Match Report** after GitHub, ZIP, or folder scans. The report is a self-contained local HTML artifact with browser Print/PDF support, current review/dismissal state, coverage/completeness, exclusions, source metadata, matched lines and explicit limitations. It adds no hosted report persistence.

An all-public-repository production smoke covered 30 public WGLewis0721 repositories. Twenty-nine scans completed and their downloaded HTML reports were verified against the visible scan state. Three were partial scans and three were zero-file scans. One repository, `Obby-CyberTruck`, failed because it has no commits and GitHub returns an explicit 409 `Git Repository is empty.` response.

PR #23 is now production. It maps only the exact empty-repository 409 into a known-empty state, keeps unrelated 409/404/rate-limit/malformed-success/provider failures as unknown/errors, propagates a tagged revision state through the API/report, and leaves matcher behavior unchanged. Final CI passed Source Search tests, live GitHub fixture, ingestion tests, public scan/report tests, build, and Vercel deployment.

## 2026-09-22 — regression hardening shipped

PR #21 is merged and deployed at commit `a80a94c` (including `6c6f372`). It closes the three founding-repository regressions found after the multi-input release:

- conventional one-line/common code is demoted unless stronger source-specific evidence exists;
- zero eligible files produce the explicit **No eligible source files were scanned** state;
- partial scans are clearly labeled, expose unchecked-file counts/reasons when available, and limit no-match language to files actually checked.

Final production smoke:

- Apex: **PASS**
- `itsm-tier1-agent` zero-file repository: **PASS**
- PoryGen partial repository: **PASS**

## 2026-09-22 — multi-input source scanning live

PoryGen is live at **https://porygen.vercel.app**.

The current customer path is:

\`\`\`
/scan
→ choose public GitHub / ZIP / local folder
→ Scan
→ PoryGen Engine
→ source-match result
→ evidence
→ review / dismiss
\`\`\`

### Shipped

- Public no-account scanner at /scan.
- Public GitHub repository ingestion.
- Secure ZIP project ingestion.
- Browser-selected local folder ingestion.
- One shared source-ingestion seam feeding the existing PoryGen Engine.
- JavaScript / TypeScript / Python support.
- Starter/template/boilerplate exclusions applied before matching.
- Strong / possible-common / abstention reporting.
- Source-specific evidence required for strong findings.
- Public-source links, exact line ranges, excerpts, and license metadata.
- Partial/incomplete-scan disclosure.
- GitHub review, dismiss, reopen and safe-rescan behavior.
- Uploaded source/results kept transient and out of browser persistence.
- Production ZIP security limits and structured errors.
- Backend and UI merged to main.
- Production deployment READY.
- One real ZIP end-to-end HTTP gate returned a real strong match through the existing Engine.

### Engine/corpus baseline

Offline corpus:

- 50,633 files
- 1,017 packages/projects
- 48,711 unique blobs
- 48,633 deduplicated clusters

Production corpus pack:

- 1,000 canonical package-source files
- 199 popular npm/PyPI packages

### Current boundaries

- connected private GitHub repositories are not yet supported;
- JS / TS / Python only;
- 150 matched files;
- 100 KB/file;
- 2 MB accepted source;
- ZIP limit 2.9 MB compressed;
- synchronous bounded request path;
- only a subset of the offline corpus is served in production;
- GitHub decisions are browser-local;
- uploaded results intentionally are not durable;
- Source Match Report is live as a local HTML/Print-PDF export; hosted history/private sharing are not built;
- no MCP or CLI;
- no automatic push/PR scans;
- no production customer entitlement enforcement.

## Next

See [ROADMAP.md](ROADMAP.md).

Net-new product order:

1. PoryGen MCP
2. PoryGen CLI
3. PoryGen CLI
4. PoryGen Engine / corpus scale-up
5. connected GitHub + continuous monitoring

Hardening, rate limiting, monitoring, privacy/secret hygiene and counsel review continue in parallel.

Do not resume open-ended matcher research unless real production behavior exposes a specific failure.

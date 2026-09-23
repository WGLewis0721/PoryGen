# Progress

## 2026-09-22 — regression hardening shipped; Source Match Report in flight

PR #21 is merged and deployed at commit `a80a94c` (including `6c6f372`). It closes the three founding-repository regressions found after the multi-input release:

- conventional one-line/common code is demoted unless stronger source-specific evidence exists;
- zero eligible files produce the explicit **No eligible source files were scanned** state;
- partial scans are clearly labeled, expose unchecked-file counts/reasons when available, and limit no-match language to files actually checked.

Final production smoke:

- Apex: **PASS**
- `itsm-tier1-agent` zero-file repository: **PASS**
- PoryGen partial repository: **PASS**

PR #20 implements the Source Match Report as a self-contained local HTML export with Print/PDF support, coverage/completeness, exclusions, strong/possible findings, matched lines, pinned source/license/version metadata, compact evidence, review/dismissal state and explicit limitations. It is **open, not merged, and not deployed**; it must be reconciled with main after PR #21.

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
- Source Match Report is implemented in open PR #20 but is not production yet;
- no MCP or CLI;
- no automatic push/PR scans;
- no production customer entitlement enforcement.

## Next

See [ROADMAP.md](ROADMAP.md).

Net-new product order:

1. Finish Source Match Report PR #20: reconcile → merge → deploy → production smoke test
2. PoryGen MCP
3. PoryGen CLI
4. PoryGen Engine / corpus scale-up
5. connected GitHub + continuous monitoring

Hardening, rate limiting, monitoring, privacy/secret hygiene and counsel review continue in parallel.

Do not resume open-ended matcher research unless real production behavior exposes a specific failure.

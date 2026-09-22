# PoryGen

**Move fast. Keep it yours.**

PoryGen checks code for meaningful similarity to indexed public source and shows where that code may have come from.

The code can be handwritten, copied or adapted from public sources, AI-assisted, AI-generated, inherited, or some mixture of all of those. PoryGen checks the artifact; it does not require knowing how the code was created.

**Live:** https://porygen.vercel.app  
**Scanner:** https://porygen.vercel.app/scan  
**Guided sample demo:** https://porygen.vercel.app/demo

## Core question

> **Does this code meaningfully resemble code that exists somewhere else, and where might it have come from?**

PoryGen is not an AI detector. License context and downstream review workflows are useful consequences of finding a possible source, but they do not replace the core source-match problem.

## Current MVP

The live /scan experience accepts:

1. a public GitHub repository URL;
2. a ZIP project upload;
3. a browser-selected local folder.

All three paths feed the same PoryGen Engine and use the same strong / possible-common / abstention semantics.

A visitor can scan without creating an account.

### Findings can include

- affected customer file and matched lines;
- possible public source;
- pinned public-source location when available;
- source/license/version metadata;
- side-by-side excerpts;
- why PoryGen surfaced the match;
- review / dismiss / reopen actions.

A result of **No strong source match** means only that no sufficiently specific match was found in the sources and files PoryGen actually checked. It does not prove originality.

## Input flow

### Public GitHub

public GitHub URL  
→ resolve latest default-branch commit  
→ inspect supported source files  
→ PoryGen Engine  
→ source-match evidence

### ZIP

ZIP bytes  
→ safe in-memory archive validation/extraction  
→ supported source selection  
→ PoryGen Engine  
→ source-match evidence

### Local folder

browser-selected files  
→ safe path/source filtering  
→ supported source selection  
→ PoryGen Engine  
→ source-match evidence

Starter/template/boilerplate files or folders can be explicitly excluded before matching.

## Supported source

- JavaScript
- TypeScript
- Python

Common scan budgets:

- up to **150 matched files**;
- up to **100 KB per source file**;
- up to **2 MB accepted source per scan**;
- bounded request-time processing.

ZIP uploads additionally use:

- **2.9 MB compressed ZIP limit**;
- **1,000 archive-entry limit**;
- **10 MB declared/expanded archive budget**;
- no recursive nested-archive extraction.

See [docs/ZIP_SCAN_API.md](docs/ZIP_SCAN_API.md) for the authoritative upload contract.

## Source coverage

The PoryGen Engine has an offline corpus pipeline containing:

- **50,633 files**
- **1,017 packages/projects**
- **48,711 unique blobs**
- **48,633 deduplicated clusters**

The current production corpus pack serves **1,000 canonical package-source files from 199 popular npm/PyPI packages**. A small pinned V2 reference set remains for documented fixture/regression behavior.

Production coverage is deliberately disclosed as limited. A customer scan does not crawl the internet.

## Reporting philosophy

Retrieval can be broad; customer-facing reporting stays conservative.

Normalized structure helps retrieve candidates, but ordinary same-shape code should not become a strong attribution by itself. Strong findings require source-specific evidence.

PoryGen may abstain entirely. Abstention is a valid scan outcome.

## Privacy behavior

Public GitHub source is processed transiently server-side. The browser may keep GitHub scan/review state locally to support manual rescans.

Uploaded ZIP/folder source, excerpts, and upload scan results are not intentionally persisted server-side and are not written to browser localStorage/sessionStorage by the upload flow.

No customer code is sent to a runtime LLM.

## What PoryGen does not claim

- **Not exhaustive.** Coverage is limited to indexed sources and actually checked files.
- **Not proof of copying.**
- **Not proof of infringement or license violation.**
- **Not proof of AI authorship.**
- **Not proof of originality.**
- **Not legal advice.**
- **Not a certification.**

## What is next

The next net-new product addition is the **Source Match Report**: a clean exportable artifact showing what matched, where it matched, the evidence, coverage and exclusions.

The net-new sequence after that is:

**Source Match Report → MCP → CLI → Engine/corpus scale-up → connected GitHub + continuous monitoring.**

Operational hardening continues in parallel.

See [ROADMAP.md](ROADMAP.md).

## Local development

\`\`\`bash
npm install
npm run dev
\`\`\`

For the scan API during local development:

\`\`\`bash
npm --prefix labs/source-search-lab start
\`\`\`

Vite proxies /api to that server.

Quality commands:

\`\`\`bash
npm test
npm run build
npm run lint
\`\`\`

## Production configuration

The live scanner can use a server-side GITHUB_TOKEN to increase GitHub API capacity. It is never sent to the browser.

The production endpoint is api/scan.mjs. Stable source matching remains in the existing Source Search V2/PoryGen Engine path rather than a separate matcher for uploads.

## Documentation

- [ROADMAP.md](ROADMAP.md) — current product state and net-new execution order
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — current multi-input architecture and evolution path
- [docs/SCANNER.md](docs/SCANNER.md) — matching, ingestion, coverage and limits
- [docs/ZIP_SCAN_API.md](docs/ZIP_SCAN_API.md) — ZIP/folder API contract and security bounds
- [docs/SECURITY.md](docs/SECURITY.md) — scan boundary, secrets and retention
- [docs/DEMO_FLOW.md](docs/DEMO_FLOW.md) — live customer flows
- [docs/OPUS_HANDOFF.md](docs/OPUS_HANDOFF.md) — current implementation handoff
- [IMPLEMENTATION_SOURCES.md](IMPLEMENTATION_SOURCES.md) — external implementation references

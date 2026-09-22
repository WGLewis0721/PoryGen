# Architecture

## Product shape

PoryGen is a source-match discovery product.

Core question:

> **Does this code meaningfully resemble code that exists somewhere else, and where might it have come from?**

The origin of the customer code is not an input to the matcher. It may be handwritten, copied/adapted, AI-assisted, AI-generated, inherited, or mixed.

The live product loop is:

**GitHub / ZIP / local folder → Scan → evidence → review**

All input types converge on the same PoryGen Engine.

## Live architecture

\`\`\`
Browser
  React 19 / Vite / React Router
        │
        │ POST /api/scan
        ▼
Vercel serverless function
  api/scan.mjs
        │
        ├─ sourceType: github
        │    └─ safe GitHub fetcher
        │         api.github.com
        │         raw.githubusercontent.com
        │
        ├─ sourceType: zip
        │    └─ bounded in-memory ZIP ingestion worker
        │
        └─ sourceType: files
             └─ bounded browser-selected file ingestion
        │
        ▼
Shared source-file abstraction
        │
        ▼
PoryGen Engine / Source Search V2
  labs/source-search-lab/lib/scan-service.mjs
        │
        ├─ tokenizer + preserving/normalized representations
        ├─ Winnowing fingerprints
        ├─ corpus-frequency / rarity signals
        ├─ bounded candidate retrieval
        ├─ ordered/contiguous verification
        ├─ likely-source/canonical metadata
        └─ conservative reporting gate
             │
             ▼
Production corpus pack + pinned reference fixtures
             │
             ▼
JSON ScanResult
             │
             ▼
/scan UI
  strong findings
  possible/common patterns
  abstention
  source/line evidence
  source/license metadata
  review/dismiss
  exclusions/completeness
\`\`\`

No third-party LLM is in the runtime scan path.

## Input contract

POST /api/scan accepts exactly one source representation:

### GitHub

- optional sourceType: github;
- repositoryUrl;
- optional exclusions;
- Terms acceptance fields.

The server validates the GitHub repository reference, resolves the current default-branch commit/tree, selects supported source, and fetches source without executing repository code.

### ZIP

- sourceType: zip;
- canonical archiveBase64;
- optional exclusions;
- Terms acceptance fields.

The archive is validated and processed in memory. It is not recursively unpacked and is not written to a customer-source store.

### Browser-selected files

- sourceType: files;
- project-relative path/content pairs;
- optional exclusions;
- Terms acceptance fields.

The server remains authoritative for paths, limits, supported source and exclusions.

See [ZIP_SCAN_API.md](ZIP_SCAN_API.md).

## Source selection

Current supported languages:

- JavaScript
- TypeScript
- Python

Dependency/vendor/build/generated paths are skipped using existing scanner conventions.

User exclusions are applied before matching and are auditable in result metadata.

## Retrieval and reporting

The Engine deliberately separates two questions.

### Retrieval

> Which indexed sources are worth checking closely?

Normalized and preserving lexical representations plus fingerprint postings retrieve a bounded candidate set.

### Reporting

> Is the evidence specific enough to name this public source?

Generic structural similarity alone cannot create a strong source attribution.

Strong results require substantial structural overlap plus source-specific evidence such as preserving-token continuity and/or rare preserving fingerprints.

Weak/generic evidence becomes possible/common or abstention.

## Corpus

The offline source-index pipeline currently contains:

- 50,633 files;
- 1,017 packages/projects;
- 48,711 unique blobs;
- 48,633 deduplicated clusters.

The current production corpus pack serves:

- 1,000 canonical package-source files;
- 199 popular npm/PyPI packages.

A small pinned V2 reference set remains for documented fixtures/regression behavior.

A customer scan never crawls the web to build its corpus.

## Scan bounds

Common source budgets:

- 150 matched files;
- 100 KB/file;
- 2 MB accepted source;
- bounded request duration.

ZIP additionally enforces:

- 2.9 MB compressed bytes;
- 1,000 entries;
- 10 MB declared/expanded archive budget;
- path/symlink/special-file/duplicate/range/integrity protections;
- bounded worker deadline/concurrency.

When coverage is incomplete, ScanResult reports that explicitly.

## State and retention

### Public GitHub

The browser may persist the latest public GitHub scan and review/dismiss state locally for manual rescan behavior.

### ZIP/folder

Uploaded source and upload results/excerpts are not intentionally persisted server-side and are not written to browser localStorage/sessionStorage by the upload flow.

The upload repository envelope uses a deterministic content digest, not a Git commit.

A missing upload file cannot prove deletion from the real project.

## Rescan safety

A GitHub finding that disappears is only considered resolved when:

- its file was successfully rechecked; or
- a complete Git tree proves deletion.

Excluding a file does not resolve an earlier finding.

Upload scans do not infer durable resolution from files that are absent in a later manual selection.

## Existing application groundwork

The repository also contains:

- Supabase Auth;
- Postgres/RLS migrations;
- scan/finding/history tables;
- resolution functions;
- Stripe/APEX groundwork;
- older provenance/history UI.

Reuse those components when they fit later durable/connected features. Do not put account creation back in front of first scan value.

## Evolution path

Net-new sequence:

1. Source Match Report;
2. PoryGen MCP;
3. PoryGen CLI;
4. larger scalable Engine/corpus retrieval;
5. connected GitHub + durable state + continuous monitoring;
6. larger-scan workers when scale requires them;
7. monetization, teams and distribution.

Operational hardening continues in parallel.

See [../ROADMAP.md](../ROADMAP.md).

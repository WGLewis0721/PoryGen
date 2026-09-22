# Security

## Live scan boundary

POST /api/scan accepts exactly one supported source representation:

- public GitHub repository;
- uploaded ZIP;
- browser-selected project files.

All inputs converge on the same scanner. Customer code is analyzed, not executed.

Responses use Cache-Control: no-store.

## GitHub ingestion

The GitHub path:

- accepts validated public GitHub repository references;
- constructs approved GitHub API/raw-content URLs server-side;
- never executes repository scripts;
- never runs package installation/build/shell commands.

GITHUB_TOKEN is a server-side capacity credential only and must never reach browser code or documentation.

## ZIP/folder ingestion

Upload security is defense-in-depth.

The server enforces:

- bounded JSON request size;
- 2.9 MB compressed ZIP limit;
- 1,000 archive-entry limit;
- 10 MB declared/expanded archive budget;
- 100 KB/source file;
- 150 matched files;
- 2 MB accepted source;
- safe relative paths;
- no traversal/absolute paths;
- no symlinks/devices/special entries;
- duplicate/overlap/integrity rejection;
- suspicious compression rejection;
- bounded worker time/concurrency;
- no recursive nested-archive extraction;
- binary/invalid UTF-8 skipping;
- dependency/vendor/build/generated filtering.

The detailed contract is [ZIP_SCAN_API.md](ZIP_SCAN_API.md).

Client-side checks improve UX; server-side validation is authoritative.

## Source execution

PoryGen does not:

- execute uploaded or fetched code;
- install customer dependencies;
- run customer builds/tests/scripts;
- evaluate customer source with eval or a shell;
- send customer code to a runtime LLM.

## Retention

### Server

Customer source is held transiently for the scan.

The live anonymous scan path does not intentionally persist ZIP/folder source or uploaded scan results in a database/object store/cache.

### Browser

Public GitHub results/review decisions may be stored in localStorage to support manual rescan/history on that browser.

ZIP/folder source, excerpts and complete upload scan results must not be written to localStorage/sessionStorage.

A future Source Match Report must not weaken this boundary merely for convenience. If private sharing later requires persistence, retention must be deliberate and disclosed.

## Source reference corpus

Reference source is prepared independently of customer requests.

A customer scan does not crawl the web or build a new corpus.

Production currently serves a 1,000-file canonical package-source pack from 199 popular npm/PyPI packages, plus the small pinned V2 fixture/reference set.

Coverage remains limited and must be disclosed.

## Resolution integrity

A GitHub finding that disappears is only resolved when its file was actually rechecked or a complete tree proves deletion.

A file that is intentionally excluded is not resolved.

Uploads have treeComplete=false because a manual selection cannot prove deletion from the actual project.

## Authenticated application groundwork

Older Supabase Auth/Postgres/RLS/history/billing code remains in the repository for later durable/connected features.

When durable state becomes primary:

- server-authoritative writes remain mandatory;
- RLS boundaries must remain tested;
- account state must not become a prerequisite for the first useful scan.

## Current priorities

Continue in parallel with product work:

1. abuse/rate limiting;
2. operational monitoring;
3. canonical Privacy/data-handling statement;
4. secret hygiene/credential rotation;
5. counsel review before meaningful paid usage;
6. repository privacy before adding materially deeper proprietary Engine logic;
7. preserve transient-source behavior unless a deliberate product feature requires otherwise.

## Claims

PoryGen does not claim that a scan proves:

- originality;
- copying;
- infringement;
- license compliance;
- AI authorship.

A result is bounded by the sources and files actually checked.

# Architecture

## Product shape

PoryGen is source-risk protection for AI-assisted development.

The live MVP is intentionally simple:

**public repo → Scan → evidence → action**

The matching engine is only one part of the product. The customer-facing loop is:

**detect → understand → review/dismiss → rescan → resolve**

## Live MVP architecture

```
Browser
  React 19 / Vite / React Router
        │
        │ POST /api/scan
        ▼
Vercel serverless function
  api/scan.mjs
        │
        ▼
Source Search V2 service
  labs/source-search-lab/lib/scan-service.mjs
        │
        ├─ GitHub fetcher
        │    api.github.com
        │    raw.githubusercontent.com
        │
        ├─ tokenizer + dual representations
        ├─ Winnowing fingerprint retrieval
        ├─ bounded candidate shortlist
        ├─ ordered/contiguous verification
        └─ conservative reporting gate
             │
             ▼
Bundled reference index
  labs/source-search-lab/data/reference-index.json
             │
             ▼
JSON scan result
        │
        ▼
/scan UI
  strong findings
  possible/common patterns
  abstention
  source links
  excerpts
  license
  review/dismiss
  rescan
```

The Vercel function bundles the reference index explicitly through `vercel.json`.

## Public scan request

The public scanner does not require an account.

`POST /api/scan` accepts one public GitHub repository URL.

The server:

1. validates that the URL is an HTTPS `github.com/<owner>/<repo>` URL;
2. resolves repository metadata;
3. resolves the current default-branch commit;
4. reads the complete Git tree when GitHub can provide it;
5. selects supported JS/TS/Python files;
6. fetches source from `raw.githubusercontent.com`;
7. compares source against the prebuilt index;
8. returns evidence and completeness metadata.

The scanner does not clone or execute customer repositories.

## Why the live path uses Source Search V2

The repository contains an older, broader authenticated application architecture built around Supabase, `packages/provenance-core`, persistence, billing, and resolution history.

That work remains useful groundwork, but it is **not required for the live MVP scan**.

The shortest path to a working product was to expose the validated Source Search V2 engine directly behind a Vercel function and make `/scan` the primary CTA.

Future integration should reuse useful persistence/auth components without putting them back in front of the first useful scan.

## Retrieval and reporting

The live engine deliberately separates two questions.

### Retrieval

> Which indexed sources are worth checking closely?

For each customer region the engine uses two lexical representations and a prebuilt inverted fingerprint index to retrieve a bounded candidate set.

### Reporting

> Is the evidence specific enough to show this source to a customer?

A candidate does not become a strong match from generic normalized structure alone.

Strong reporting requires structural evidence plus source-specific evidence such as preserving-token overlap or rare preserving fingerprints.

If evidence is weak or generic, the result is possible/common-pattern or no reportable source.

This is why the system can retrieve broadly while still abstaining.

## Current reference index

The bundled V2 index contains 6 pinned files from 3 real public repositories:

- `sindresorhus/yocto-queue`
- `date-fns/date-fns`
- `psf/requests`

The index is prebuilt outside the customer request path.

A scan never crawls the web to build its corpus.

The current corpus is an MVP limitation, not a claim of exhaustive search.

## Scan completeness

The repository fetcher separately records whether supported files were actually checked.

Current limits:

- 40 files;
- 100 KB per file;
- 750 KB total;
- bounded scan duration;
- generated/vendor/build directories excluded.

Incomplete reasons are tracked independently from the capped UI detail list.

A partial scan is reported as partial.

## Rescan safety

A finding that disappears on a later scan is only treated as resolved when:

- the affected customer file was successfully fetched and compared; or
- a complete Git tree proves the file was deleted.

A partial rescan that simply fails to revisit the file cannot silently resolve it.

## Client-side state

The public MVP stores review/dismiss decisions in browser local storage.

That is sufficient for the anonymous MVP, but it is not durable workspace history.

The existing Supabase data model and RLS work can support the later connected-account product.

## Existing authenticated stack

The repository still includes:

- Supabase Auth;
- Postgres/RLS migrations;
- scan/finding/history tables;
- resolution functions;
- Stripe groundwork;
- APEX dogfood work;
- evidence/history UI.

Those are not currently the critical path for `/scan`.

The next connected-product phase should add GitHub App identity and durable state without removing the anonymous first scan.

## Evolution path

The intended evolution is:

1. harden the public endpoint;
2. move stabilized production scanner code out of the `labs/` namespace;
3. connect GitHub App + durable user/workspace state;
4. expand the source index/providers;
5. add async workers for larger repositories;
6. add push/PR-triggered scans and GitHub Check Runs;
7. enforce paid repository entitlements through Stripe + APEX.

See [ROADMAP.md](../ROADMAP.md).

## External systems used by the live MVP

- Vercel — frontend + serverless scan function;
- GitHub REST API — repository metadata, commit and tree;
- raw.githubusercontent.com — source file contents;
- server-side `GITHUB_TOKEN` — optional authenticated GitHub API capacity.

No third-party LLM is in the runtime scan path.

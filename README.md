# PoryGen

**Move fast. Keep it yours.**

PoryGen checks public GitHub repositories for suspicious similarity to indexed public source code so a developer can inspect the source, understand the license context, and decide what to do before shipping.

> If AI-assisted coding becomes normal, checking what the AI gave you should become normal too.

**Live:** https://porygen.vercel.app  
**Real public-repo scanner:** https://porygen.vercel.app/scan  
**Guided sample demo:** https://porygen.vercel.app/demo

## MVP status

PoryGen is now a working public MVP.

A visitor can:

1. paste a public GitHub repository URL;
2. click **Scan** with no account;
3. have PoryGen fetch the latest commit;
4. compare supported JavaScript, TypeScript, and Python files against the current reference index;
5. see strong matches, possible/common patterns, or a clean abstention;
6. inspect matched line ranges, source excerpts, commit-pinned GitHub links, and license metadata;
7. review or dismiss a finding;
8. push a change and rescan to see whether the finding is still present.

The current production path is **real repo → Scan → real result → evidence → action**.

## What happens during a scan

```
public GitHub URL
  → resolve latest default-branch commit
  → read repository tree
  → fetch bounded JS / TS / Python source
  → normalize + fingerprint
  → retrieve candidate public sources
  → verify source-specific similarity
  → classify strong / possible-common / insufficient
  → show exact source, lines, license and evidence
```

The production endpoint is `api/scan.mjs`, a Vercel serverless function using the Source Search V2 engine under `labs/source-search-lab/lib/`.

### Current scan limits

- public GitHub repositories only;
- JavaScript, TypeScript, and Python;
- up to 40 supported files;
- up to 100 KB per file;
- up to 750 KB of source per scan;
- bounded request-time execution;
- build/vendor/generated directories are skipped.

When a scan cannot cover every supported file, the UI reports a **partial scan** rather than silently implying complete coverage.

## Current source coverage

The matching engine is real; the source corpus is intentionally small.

The bundled V2 reference index currently contains **6 pinned files from 3 public repositories**:

- `sindresorhus/yocto-queue`
- `date-fns/date-fns`
- `psf/requests`

Every source is pinned to a commit and documented with its license.

A result of **No strong source match** means only that no sufficiently specific match was found in the sources PoryGen currently indexes. It does **not** mean the repository is original or free of license risk.

## Reporting philosophy

Retrieval is broad; reporting is conservative.

Normalized structural similarity is useful for finding candidates, but structure alone cannot create a strong attribution. A **Strong match** also requires source-specific evidence such as exact identifier/literal overlap or rare preserving fingerprints.

Possible/common patterns are separated from strong findings so ordinary implementation patterns do not read like accusations.

PoryGen may return no source finding at all. Abstention is a successful scan outcome.

## Actions and persistence

The public MVP currently supports:

- **Review source** — opens the exact commit-pinned source and matched lines;
- **Dismiss** — records a reason in browser local storage;
- **Reopen** — restores a dismissed finding;
- **Rescan latest commit** — fetches the current repository state again;
- **Safe resolution** — a disappeared finding is only called resolved when its file was actually rechecked or a complete repository tree proves the file was deleted.

Public-scan decisions are currently browser-local. Durable account/workspace history is a later product phase.

## Sample demo

`/demo` remains a guided fictional walkthrough. It is useful for learning the workflow, but it is not the same thing as the live scanner.

The real product path is `/scan`.

## What is not built yet

- private repository scanning;
- GitHub App installation and repository picker;
- automatic push / pull-request monitoring;
- GitHub Check Runs;
- durable cloud persistence for public-scan review/dismiss decisions;
- team/workspace controls;
- broad internet-scale source coverage;
- async scanning for large repositories;
- production customer billing/entitlement enforcement;
- GitHub Marketplace distribution.

The repository still contains the earlier Supabase-authenticated application and billing groundwork. The public MVP no longer requires that stack to perform a real scan.

## What PoryGen does not claim

- **Not exhaustive.** Coverage is limited to the indexed sources.
- **Not proof of copying.** Similarity is evidence for a human to review.
- **Not proof of AI authorship.**
- **Not legal advice.**
- **Not a certification of originality.**

## Local development

```bash
npm install
npm run dev
```

For the real public scan API during local development, run the isolated scan server in another terminal:

```bash
npm --prefix labs/source-search-lab start
```

Vite proxies `/api` to that server.

Quality commands:

```bash
npm test
npm run build
npm run lint
```

## Production configuration

The live scanner can use a server-side `GITHUB_TOKEN` to increase GitHub API capacity. It is never sent to the browser.

The public scan fetcher uses GitHub REST for repository metadata, commit, and tree resolution, then uses `raw.githubusercontent.com` for source contents so a normal scan consumes only a few GitHub API requests.

The Vercel function bundles the prebuilt reference index through `vercel.json`.

## Documentation

- [ROADMAP.md](ROADMAP.md) — current product state and next execution phases
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — live MVP architecture and evolution path
- [docs/SCANNER.md](docs/SCANNER.md) — Source Search V2 retrieval, verification, coverage and limits
- [docs/SECURITY.md](docs/SECURITY.md) — public scan boundary, secrets and retention
- [docs/DEMO_FLOW.md](docs/DEMO_FLOW.md) — real public scan and sample demo flows
- [docs/LIVE_QA_2026-09-22.md](docs/LIVE_QA_2026-09-22.md) — live QA history and final MVP retest
- [docs/OPUS_HANDOFF.md](docs/OPUS_HANDOFF.md) — current implementation handoff
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — existing authenticated-app persistence model
- [docs/PROVENANCE.md](docs/PROVENANCE.md) — earlier provenance/history capabilities
- [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md) — existing billing groundwork
- [DESIGN.md](DESIGN.md) · [VISUAL-PLAN.md](VISUAL-PLAN.md) — visual system

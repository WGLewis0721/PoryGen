# Handoff — live MVP

## Current state

PoryGen is no longer only a demo or isolated scanner lab.

The production site now supports the real MVP loop:

**real public repo → Scan → real result → evidence → action**

Live site: https://porygen.vercel.app  
Scanner: https://porygen.vercel.app/scan

## What landed

- PR #5: Vercel SPA deep-link rewrites and test-runner cleanup.
- Real public `/scan` page with no-account access.
- Vercel `/api/scan` function.
- Source Search V2 shared through `scan-service.mjs`.
- GitHub repository ingestion optimized to use raw GitHub content for files.
- Production `GITHUB_TOKEN` support.
- Bundled V2 reference index in the Vercel function.
- Strong/possible/abstention UI.
- Side-by-side evidence, pinned source lines, and license metadata.
- Review/dismiss/reopen actions in browser-local state.
- Safe rescan resolution.
- Real production scans successfully exercised.

## Live scanner boundaries

- public GitHub only;
- JavaScript, TypeScript, Python;
- 40 files;
- 100 KB per file;
- 750 KB total;
- current index: 6 pinned files from 3 public repos.

## Important architectural note

The production scanner still lives under `labs/source-search-lab` because it was promoted directly from the validated V2 lab.

That is acceptable for the MVP.

Do not rewrite it merely to make the directory name prettier. Move it into a production package when there is an actual reason to touch the boundary.

## Existing Supabase application

The earlier authenticated app, RLS model, persistent resolution history, billing groundwork, and APEX work remain in the repository.

They should be reused selectively for the connected-product phase.

Do **not** put signup back in front of the first public scan.

## Next priorities

1. Harden the public endpoint: secrets, rate limiting/abuse control, monitoring, privacy/legal basics.
2. GitHub App + repository picker + private repos + durable state.
3. Broader source coverage.
4. Async scanning for larger repos.
5. Push/PR automation and GitHub checks.
6. Repo-based paid expansion with Stripe + APEX.

## Do not do next

- another open-ended similarity research program;
- large new benchmark work without a specific matcher change;
- team administration before GitHub connection;
- billing before the durable repo model;
- visual redesign that does not improve the scan loop.

See [ROADMAP.md](../ROADMAP.md).

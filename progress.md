# Progress

## 2026-09-22 — live MVP shipped

PoryGen is now a working public MVP on **https://porygen.vercel.app**.

The real customer path is:

```
/scan
→ paste public GitHub repo
→ Scan
→ real result
→ evidence
→ review / dismiss
→ rescan
```

### Shipped

- Public no-account scanner at `/scan`.
- Vercel serverless scan endpoint at `api/scan.mjs`.
- Source Search V2 wired into production.
- Public GitHub repository ingestion.
- JavaScript / TypeScript / Python support.
- Latest default-branch commit pinning.
- Bounded source fetching through GitHub REST + raw.githubusercontent.com.
- Reference index bundled into the Vercel function.
- Strong / possible-common / abstention reporting.
- Source-specific evidence required for strong findings.
- Commit-pinned source links, exact line ranges, excerpts, and license metadata.
- Partial-scan disclosure.
- Review, dismiss, reopen, and rescan actions.
- Browser-local decision persistence.
- Safe rescan resolution.
- SPA deep-link fixes.
- Main build/deploy green.

### Human-style production checks

Real live scans completed successfully for:

- `sindresorhus/yocto-queue`
- `psf/requests`
- `expressjs/cors`

Observed scan times were about 1–3 seconds for those examples.

### Current reference coverage

The V2 index contains 6 pinned files from:

- `sindresorhus/yocto-queue`
- `date-fns/date-fns`
- `psf/requests`

This remains the biggest product limitation. The engine is live; the source universe is still small.

## Current MVP boundaries

- public GitHub repositories only;
- JS / TS / Python only;
- 40 files maximum;
- 100 KB maximum per file;
- 750 KB maximum source per scan;
- review/dismiss state is browser-local;
- no private repositories;
- no GitHub App;
- no automatic push/PR scans;
- no customer billing enforcement;
- no broad source corpus;
- no async large-repository worker.

## Next

See [ROADMAP.md](ROADMAP.md).

Immediate focus:

1. harden the public endpoint and operational setup;
2. add GitHub App + durable state/private repo support;
3. broaden source coverage;
4. scale scans;
5. automate push/PR checks;
6. monetize repo expansion through Stripe + APEX.

Do not resume open-ended matcher research unless real production scans expose a specific failure.

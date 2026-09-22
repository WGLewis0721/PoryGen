# Security

## Live public scanner

The MVP scan path is intentionally narrow.

`POST /api/scan` accepts a public GitHub repository URL and runs server-side on Vercel.

The scanner:

- accepts only HTTPS `github.com/<owner>/<repo>` URLs;
- validates owner/repository names;
- contacts only GitHub API and raw GitHub hosts for source ingestion;
- never executes repository code;
- never runs package installation, builds, scripts, or shell commands from the repository;
- returns no-store responses.

## Server-side GitHub credential

`GITHUB_TOKEN` is a server-side production secret.

It is used only to increase GitHub REST API capacity and is not bundled into the browser.

The token should remain minimum-scope and should be rotated if exposed outside the secret store.

## Ingestion limits

Current public-scan limits:

- 40 supported files;
- 100 KB per file;
- 750 KB total source;
- bounded fetch duration;
- build/vendor/generated/dependency directories excluded.

The scanner tracks incompleteness explicitly and shows partial-scan warnings.

## Public-scan retention

The live public scanner fetches source for analysis in request memory.

The public MVP does not persist customer repository contents, scan findings, or source excerpts server-side.

The browser stores the most recent scan result and review/dismiss decisions in local storage so the anonymous user can rescan and preserve decisions on that browser.

No customer code is sent to a runtime LLM.

## Source reference data

The V2 reference index is prebuilt and bundled into the Vercel function.

A customer scan does not crawl the web or build a new reference corpus.

## Authenticated application security

The repository also contains the earlier Supabase-authenticated application.

That stack uses Row Level Security and includes persistent repositories, scans, findings, tracked findings, resolution history, and billing tables.

Those controls remain relevant for the future connected/private-repository product, but they are not required for the current anonymous `/scan` flow.

When durable user state is reintroduced into the primary experience, server-authoritative scan writes and the existing RLS tests should remain mandatory.

## Resolution integrity

The public scanner's browser-side resolution helper follows the same conservative rule as the V2 lab:

A finding that disappears is only considered resolved when the affected file was successfully rechecked, or a complete Git tree confirms deletion.

A partial scan cannot resolve a finding merely because it failed to revisit the file.

## Current security priorities

Before broad public or paid launch:

1. keep production secrets only in Vercel/server-side secret stores;
2. rotate any credential that has been pasted into non-secret communication;
3. add abuse/rate-limit controls for the anonymous scan endpoint;
4. add operational monitoring for GitHub quota and serverless failures;
5. publish Privacy Policy and Terms;
6. keep the repository private before adding materially more proprietary scanner intelligence;
7. preserve the no-source-retention design as features evolve.

## Claims

PoryGen does not claim that a scan proves originality, copying, or AI authorship.

A clean result is bounded by the sources and files actually checked.

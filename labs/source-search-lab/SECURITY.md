# Security and Code Safety — Source Search Lab V2

V2 treats repository source as scan input, not product data to retain.

## Customer-code handling

For this lab:

- only public `https://github.com/owner/repo` repository URLs are accepted;
- GitHub API URLs are constructed by the server after validating owner/repository names;
- supported blobs are read directly into process memory;
- repository code is never executed;
- dependencies are never installed;
- repository scripts are never invoked;
- customer source is not written to disk, a database, object storage, a queue, analytics, or ordinary application logs;
- customer-derived fingerprints are created in memory and discarded with the scan request;
- customer source is not sent to Google, Bing, Brave, another public search engine, or an LLM provider.

The prebuilt reference index contains **public reference code only**.

## HTTP protections retained from PR #3

The V2 API is:

```http
POST /api/scan
Cache-Control: no-store
Pragma: no-cache
Expires: 0
Referrer-Policy: no-referrer
```

Repository input is carried in the POST body rather than a URL query parameter.

References:

- OWASP ASVS 5.0, General Data Protection: https://cornucopia.owasp.org/taxonomy/asvs-5.0/14-data-protection/02-general-data-protection
- MDN Cache-Control: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
- OWASP MASWE-0005, sensitive data in logs: https://mas.owasp.org/MASWE/MASVS-STORAGE/MASWE-0005/

## Network boundary

Customer scanning talks only to GitHub's repository API for this V2 lab.

The fetcher:

1. validates the user-supplied URL is `https://github.com`;
2. resolves repository metadata and the current default-branch commit;
3. requests the commit tree;
4. fetches only selected supported blobs from `api.github.com`.

The implementation does not accept arbitrary fetch URLs from the customer.

## Resource limits

Current defaults:

- 40 source files;
- 100,000 bytes per source file;
- 750,000 total source bytes;
- 15-second GitHub retrieval budget;
- 32 KB API request body;
- generated/vendor/build directories skipped.

Limit hits and provider failures make the scan visibly partial instead of silently claiming full coverage.

## Retention claim

The accurate V2 statement is:

> Customer code is processed transiently for the active scan and is not durably retained by the lab.

This is not a claim of cryptographic RAM erasure. JavaScript garbage collection does not provide that guarantee.

A future production service could also use a short-lived isolated workspace or ephemeral clone if operational needs require it, provided the lifecycle and deletion policy are documented. V2 does not need that complexity because it reads bounded public blobs directly into memory.

## Browser/session actions

Dismissal reasons live only in an in-memory `Map` in the current browser page.

They are not stored in:

- localStorage;
- sessionStorage;
- cookies;
- PoryGen databases.

Refreshing the page clears them.

## Security tests

The test suite verifies:

- POST-only scan requests;
- `no-store` responses;
- strict GitHub repository URL parsing;
- bounded file/byte behavior;
- skipped/partial scan reporting;
- the repository fetch path only calls `api.github.com`;
- no Google/Bing/Brave search provider is called;
- unrelated code can return insufficient evidence.

## Production boundary

This lab is not production PoryGen. It does not modify production authentication, billing, APEX entitlements, database schemas, or the existing scanner provider implementation.

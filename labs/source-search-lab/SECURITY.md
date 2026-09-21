# Security and Code-Safety Rules

This lab is teaching the search fundamentals PoryGen will need. For customer source code, privacy is part of the search architecture, not an add-on.

## Zero-retention target

Customer source code must be:

- processed only for the active request;
- sent in an HTTP request body, never in the URL/query string;
- excluded from application logs, analytics, tracing payloads, and error messages;
- excluded from HTTP/browser/CDN caches;
- never written to disk, object storage, databases, queues, or temporary files;
- never sent to a third-party public search engine by default;
- released from application references as soon as the request completes.

The honest guarantee is **no durable retention and transient-memory processing only**. A managed language such as JavaScript cannot prove that every physical RAM byte is immediately overwritten after garbage collection, so PoryGen should not market this as cryptographic memory erasure.

## Why the lab changed from GET to POST

The first version used `/api/search?q=...`. Sensitive material in URLs can appear in browser history, access logs, and referrer data. The current version accepts search input only through `POST /api/search` with JSON in the request body.

Reference:
- OWASP ASVS 5.0 V14.2.1: https://cornucopia.owasp.org/taxonomy/asvs-5.0/14-data-protection/02-general-data-protection
- OWASP Application Security FAQ: https://community.owasp.org/OWASP_Application_Security_FAQ

Code mapping:
- `server.mjs:96-120`
- `server.mjs:200-219`
- `public/app.js:53-64`
- `public/index.html:6`

## Cache policy

Dynamic search responses send:

```http
Cache-Control: no-store
Pragma: no-cache
Expires: 0
```

`no-store` is the important directive: it tells private and shared HTTP caches not to store the response.

References:
- MDN Cache-Control: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
- OWASP ASVS 5.0 V14.2.2: https://cornucopia.owasp.org/taxonomy/asvs-5.0/14-data-protection/02-general-data-protection

Code mapping:
- `server.mjs:79-94`
- `server.mjs:178-197`
- `public/app.js:55-64`

## External web search

The lab retains a Brave Search fallback only as an educational/public-demo feature. It is **off by default** and requires explicit opt-in.

Private customer code must not be sent to Brave, Google, Bing, an LLM vendor, or any other external search provider just to discover candidate matches.

Reference:
- OWASP ASVS 5.0 V14.2.3: https://cornucopia.owasp.org/taxonomy/asvs-5.0/14-data-protection/02-general-data-protection

Code mapping:
- `server.mjs:117-167`
- `public/index.html:23-26`
- `public/app.js:60-63`

## Logging

The server never logs `query` or request bodies.

Reference:
- OWASP MASWE-0005, Insertion of Sensitive Data into Logs: https://mas.owasp.org/MASWE/MASVS-STORAGE/MASWE-0005/

Startup logging at `server.mjs:225-228` contains only the local address, corpus size, and privacy-mode status.

## Production direction

1. PoryGen builds or uses its own index of public code.
2. Customer code is fetched transiently.
3. PoryGen computes temporary code fingerprints in memory.
4. Those fingerprints query PoryGen's own index.
5. Candidate public sources are retrieved and ranked.
6. Customer-derived query material is discarded after the request.
7. Durable findings contain source URLs, scores, line ranges, license metadata, and decisions, but not retained customer source snippets or fingerprints.

## Tests

`npm test` includes privacy checks for:

- POST-only search;
- `Cache-Control: no-store`;
- private mode blocking the external web provider;
- no query echo in successful responses;
- explicit opt-in before web fallback;
- request-size limits.

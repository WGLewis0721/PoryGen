# PoryGen Source Search Lab

A deliberately small search-engine prototype used to learn the fundamentals PoryGen will eventually need for source discovery.

It is **not production PoryGen code** and is not wired into the live product.

## What it does

1. A user types a query into one search bar.
2. The browser sends the query in a POST body, not the URL.
3. The server tokenizes the query.
4. It searches the 10 text sources in `public/sources/`.
5. Local sources are ranked with a simple weighted word-count score:
   - title matches = 5 points
   - tag matches = 3 points
   - body matches = 1 point
   - results matching more query terms get a small coverage boost
6. If local sources match, the best local results are returned.
7. If nothing matches, **private mode stops**. An external Brave Search fallback is retained only as an explicit public-demo opt-in and returns at most 5 results.

This is intentionally a CS-undergrad/high-school-level project: load → tokenize → retrieve → rank → return results.

## Privacy rule

Private mode is the default.

Search requests and responses use `Cache-Control: no-store`. Queries are not placed in URLs, not echoed in successful responses, and are not sent to the web provider unless the public-demo checkbox is explicitly enabled.

For the production PoryGen direction, customer source code must never be sent to a public search engine. PoryGen should query its own public-code index with temporary in-memory fingerprints and retain no customer source or customer-derived fingerprints after the request.

See [SECURITY.md](./SECURITY.md).

## Run

Requires Node 20+.

```bash
cd labs/source-search-lab
npm start
```

Open: http://localhost:3000

## Optional public-demo web fallback

Set a Brave Search API key before starting:

```bash
export BRAVE_SEARCH_API_KEY="your-key"
npm start
```

Then explicitly check the public-demo web-fallback box in the UI. Do **not** use this mode with private source code.

## Test

```bash
npm test
```

The current suite covers ranking fundamentals plus privacy behavior such as POST-only search, `no-store`, blocked third-party fallback by default, query non-echo, and request-size limits.

## Why this exists

PoryGen's production scanner already knows how to fingerprint and compare code. What it lacks is a broad candidate-discovery layer: the equivalent of a search engine's crawl/index/retrieve/rank loop.

This lab isolates the simplest possible version of that idea before we build code-specific indexing.

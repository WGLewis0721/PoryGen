# PoryGen Source Search Lab

A deliberately small search-engine prototype used to learn the fundamentals PoryGen will eventually need for source discovery.

It is **not production PoryGen code** and is not wired into the live product.

## What it does

1. A user types a query into one search bar.
2. The server tokenizes the query.
3. It searches the 10 text sources in `public/sources/`.
4. Local sources are ranked with a simple weighted word-count score:
   - title matches = 5 points
   - tag matches = 3 points
   - body matches = 1 point
   - results matching more of the query terms get a small coverage boost
5. If at least one local source matches, the best local results are returned.
6. If **nothing** in the local corpus matches, the server asks Brave Search for 5 web results.

This is intentionally the level of a CS undergrad/high-school search project: crawl/load → tokenize → index/search → rank → return results.

## Run

Requires Node 20+.

```bash
cd labs/source-search-lab
npm start
```

Open: http://localhost:3000

### Optional web fallback

Set a Brave Search API key before starting:

```bash
export BRAVE_SEARCH_API_KEY="your-key"
npm start
```

The API key stays server-side. Never put it in `public/app.js`.

Without the key, local search still works. A query with no local match will show a clear message that web fallback is not configured.

## Test

```bash
npm test
```

## Why this exists

PoryGen's production scanner already knows how to fingerprint and compare code. What it lacks is a broad candidate-discovery layer: the equivalent of a search engine's crawl/index/retrieve/rank loop.

This lab isolates the simplest possible version of that idea before we build code-specific indexing.

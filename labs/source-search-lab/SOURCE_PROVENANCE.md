# Source Provenance — PoryGen Source Search Lab

This file records the concepts, pages, and existing PoryGen design that informed the lightweight search-engine lab, and maps them to the exact lines of code or teaching content in the lab.

## Provenance statement

**No third-party source code was copied into this lab.**

The first implementation was written from:
1. standard computer-science/search-engine concepts already known to the implementation agent,
2. the existing PoryGen architecture and its candidate-discovery/provider model, and
3. the Brave Search API contract as the intended external fallback.

After the initial implementation, the external references below were checked to create an exact, auditable bibliography. Therefore this document distinguishes:

- **Direct internal precedent** — existing PoryGen design that directly shaped the lab.
- **API contract** — external documentation that defines an API the lab calls.
- **Concept reference / validation** — an authoritative source for a standard concept used in or described by the lab. These references validate the concept; the code was not copied from them.
- **Original lab heuristic** — logic created specifically for this experiment and not taken from a cited algorithm.

Line mappings below are against the lab snapshot at commit `95e85b15f779e7adec7127f4e0523f11e529285d`. Adding this provenance file does not change those mapped files.

---

## 1. Tokenization and stop words

### Reference

Christopher D. Manning, Prabhakar Raghavan, Hinrich Schütze, *Introduction to Information Retrieval*.

- Tokenization: https://nlp.stanford.edu/IR-book/html/htmledition/tokenization-1.html
- Stop words: https://nlp.stanford.edu/IR-book/html/htmledition/dropping-common-terms-stop-words-1.html

Relevant concepts:
- tokenization converts character sequences into tokens;
- document and query text should use consistent tokenization;
- common low-information terms may be removed with a stop list.

### Lab mapping

**Concept reference / validation**

- `lib/search.mjs:1-5` — small stop-word set.
- `lib/search.mjs:7-14` — lowercasing, punctuation cleanup, splitting, trimming, and stop-word removal.

### Important note

The exact regular expression, the exact stop-word list, and the implementation are original to this lab. They were not copied from the Stanford text.

---

## 2. Basic retrieval and ranking

### Reference

Manning, Raghavan, Schütze, *Introduction to Information Retrieval*.

- Building an inverted index: https://nlp.stanford.edu/IR-book/html/htmledition/a-first-take-at-building-an-inverted-index-1.html
- TF-IDF / overlap scoring: https://nlp.stanford.edu/IR-book/html/htmledition/tf-idf-weighting-1.html

Relevant concepts:
- collect documents;
- tokenize/normalize them;
- retrieve documents matching query terms;
- score/rank candidate documents;
- a simple overlap score can sum occurrences of query terms.

### Lab mapping

**Concept reference / validation**

- `lib/search.mjs:16-22` — count exact term occurrences.
- `lib/search.mjs:24-52` — tokenize the query/documents, calculate a score, remove zero-score documents, and sort descending.
- `server.mjs:27-34` — load the local document collection.
- `server.mjs:90-105` — retrieve/rank local matches and return the top 10.

### Original lab heuristic

The actual ranking formula is **not TF-IDF**.

These lines were created specifically for this experiment:

- `lib/search.mjs:30-32` — split searchable content into title, tag, and body zones.
- `lib/search.mjs:43` — title = 5 points, tag = 3 points, body = 1 point.
- `lib/search.mjs:46-47` — query-term coverage boost.
- `lib/search.mjs:52` — deterministic score/title sort.

Those weights are intentionally simple teaching heuristics, not a published ranking algorithm.

---

## 3. Existing PoryGen candidate-discovery architecture

### Internal reference

`docs/ARCHITECTURE.md:56-78`

Relevant existing PoryGen design:

- `discoverCandidates(...)` performs the cheaper candidate-discovery stage.
- `compareCandidate(...)` performs more precise comparison.
- the current static provider uses an in-memory fingerprint index;
- future source providers plug into the same interface.

### Lab mapping

**Direct internal precedent**

- `server.mjs:90-105` — local corpus is searched first for candidates.
- `server.mjs:108-116` — if local candidate retrieval returns nothing, another provider (the web search fallback) is invoked.
- `README.md` — describes this lab as an isolated experiment for the broader source-discovery layer PoryGen still needs.

The lab is deliberately text-search based. It does **not** yet implement PoryGen's production code-fingerprint search.

---

## 4. Brave Search web fallback

### Reference

Brave Search API — Web Search endpoint:

https://api-dashboard.search.brave.com/api-reference/web/search/post

The API documentation defines:
- the web search endpoint;
- the `q` query parameter;
- the `country` and `search_lang` parameters;
- the `X-Subscription-Token` authentication header.

### Lab mapping

**API contract**

- `server.mjs:36-43` — server-side API key lookup and unconfigured state.
- `server.mjs:45-49` — Brave endpoint and query parameters.
- `server.mjs:55-61` — HTTP request and `X-Subscription-Token` header.
- `server.mjs:67-75` — parse Brave results and keep at most five.
- `server.mjs:108-116` — invoke web search only after local search returns no matches.

No Brave SDK or source code was copied. The lab makes a direct HTTP request using the documented API contract.

---

## 5. Node.js HTTP server

### Reference

Node.js HTTP documentation:

https://nodejs.org/api/http.html

Relevant concept:
- `http.createServer(requestListener)` creates an HTTP server and invokes the listener for requests.

### Lab mapping

**API contract / concept validation**

- `server.mjs:1` — import Node's built-in `node:http` module.
- `server.mjs:151-164` — create the server and route requests.
- `server.mjs:166-169` — listen on the configured port.

The routing structure and static-file implementation are original lab code.

---

## 6. Browser Fetch API

### Reference

MDN — Using the Fetch API:

https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

Relevant concepts:
- `fetch()` makes an HTTP request;
- it returns a Promise containing a `Response`;
- response data can be parsed as JSON;
- HTTP error statuses should be checked explicitly.

### Lab mapping

**API contract / concept validation**

- `public/app.js:40-49` — submit the query and call the lab's `/api/search` endpoint.
- `public/app.js:50-51` — parse JSON and check `response.ok`.
- `public/app.js:53-57` — render local-vs-web status and results.

---

# Educational corpus provenance

The 10 files under `public/sources/` are **synthetic teaching documents written for this lab**. They are not copied excerpts. Each file summarizes one concept so the local search engine has a small corpus to search.

## 7. Winnowing

### Teaching file

`public/sources/01-winnowing.txt:1-4`

### Reference

Saul Schleimer, Daniel S. Wilkerson, Alex Aiken, **“Winnowing: Local Algorithms for Document Fingerprinting.”**

https://theory.stanford.edu/~aiken/publications/papers/sigmod03.pdf

**Concept reference / validation:** document fingerprinting, hashes/fingerprints, and detecting partial similarity.

The teaching paragraph is an original summary, not a quotation.

---

## 8. Inverted indexes

### Teaching file

`public/sources/02-inverted-index.txt:1-4`

### Reference

Manning, Raghavan, Schütze, **“A first take at building an inverted index.”**

https://nlp.stanford.edu/IR-book/html/htmledition/a-first-take-at-building-an-inverted-index-1.html

**Concept reference / validation:** map terms to the documents in which they occur so retrieval does not require re-reading the entire collection.

The current lab does not build a persisted inverted index; its tiny 10-document corpus is intentionally searched in memory.

---

## 9. PageRank

### Teaching file

`public/sources/03-pagerank.txt:1-4`

### Reference

Manning, Raghavan, Schütze, **“PageRank.”**

https://nlp.stanford.edu/IR-book/html/htmledition/pagerank-1.html

**Concept reference / validation:** link analysis can contribute an authority signal when ranking web pages.

PageRank is teaching content only. **No PageRank algorithm is implemented in the lab.**

---

## 10. TF-IDF

### Teaching file

`public/sources/04-tfidf.txt:1-4`

### Reference

Manning, Raghavan, Schütze, **“Tf-idf weighting.”**

https://nlp.stanford.edu/IR-book/html/htmledition/tf-idf-weighting-1.html

**Concept reference / validation:** combine term frequency and inverse document frequency to weight discriminative terms.

TF-IDF is teaching content only. **The current ranker does not implement TF-IDF.**

---

## 11. Hash tables

### Teaching file

`public/sources/05-hash-tables.txt:1-4`

### Reference

NIST Dictionary of Algorithms and Data Structures — **“hash table.”**

https://xlinux.nist.gov/dads/HTML/hashtab.html

**Concept reference / validation:** a dictionary structure that maps keys to positions using a hash function.

Hash tables are teaching content only. The lab does not implement its own hash table.

---

## 12. HTTP / API requests

### Teaching file

`public/sources/06-rest-api.txt:1-4`

### Reference

MDN — **Overview of HTTP**

https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview

**Concept reference / validation:** HTTP uses a client/server request-response model and is commonly used by programmatic APIs.

The source file uses “REST API” as an introductory label; the lab itself only requires ordinary HTTP/JSON behavior and does not depend on a formal REST architecture.

---

## 13. GitHub Apps

### Teaching file

`public/sources/07-github-apps.txt:1-4`

### References

GitHub Docs — **Installing a GitHub App from a third party**

https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party

GitHub Docs — **Choosing permissions for a GitHub App**

https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app

GitHub Docs — **REST API endpoints for GitHub Apps / installation access tokens**

https://docs.github.com/en/rest/apps/apps

**Concept reference / validation:** selected-repository installation, narrowly scoped permissions, and installation access tokens.

GitHub Apps are teaching content only in this lab. The lab does not authenticate to customer repositories.

---

## 14. SPDX identifiers

### Teaching file

`public/sources/08-spdx.txt:1-4`

### Reference

SPDX — **SPDX License List**

https://spdx.org/licenses/

**Concept reference / validation:** SPDX provides standardized short identifiers for commonly found licenses and exceptions.

SPDX is teaching content only in this lab.

---

## 15. Small Node HTTP server

### Teaching file

`public/sources/09-node-server.txt:1-4`

### Reference

Node.js HTTP documentation:

https://nodejs.org/api/http.html

**Concept reference / validation:** Node provides a built-in low-level HTTP server API.

This concept is also actually used by `server.mjs:1` and `server.mjs:151-169`.

---

## 16. Syntax trees / AST-style structural analysis

### Teaching file

`public/sources/10-ast.txt:1-4`

### Reference

Tree-sitter — **Introduction**

https://tree-sitter.github.io/tree-sitter/

Tree-sitter documents that it builds a concrete syntax tree representing source code.

### PoryGen-specific interpretation

The teaching file's statement that syntax-tree structure can be useful for code-similarity analysis is a **PoryGen design hypothesis / standard program-analysis concept**, not a claim taken verbatim from Tree-sitter documentation.

No syntax-tree comparison is implemented in this lab.

---

# User-specified behavior

Several important design decisions came directly from the experiment requirements rather than an external source:

- exactly **10 local sources**;
- local search happens first;
- web search happens only if local search returns no match;
- web fallback returns **5** results;
- intentionally simple HTML page with one search bar;
- deliberately undergrad/high-school complexity.

Code implementing those requirements:

- `server.mjs:90-116`
- `public/app.js:40-57`
- `public/index.html` (search UI)

---

# What is original to this lab

The following implementation choices are original and should not be attributed to the external references above:

- the 5/3/1 title/tag/body weighting;
- the query-term coverage multiplier;
- loading the 10 source files directly into memory at process startup;
- local-first/web-fallback control flow;
- the HTML/CSS visual design;
- the result-card rendering;
- the eight-second Brave request timeout;
- the synthetic wording of all 10 teaching documents;
- the tests and test fixtures.

---

# Relationship to future PoryGen work

This lab demonstrates only the fundamental retrieval loop:

```
query
→ normalize/tokenize
→ search a known corpus
→ score candidates
→ rank candidates
→ fall back to a broader search source
→ return the best matches
```

A future PoryGen source-search subsystem would replace ordinary word tokens with code-aware signals such as fingerprints, token sequences, syntax structures, rarity statistics, and repository/file metadata. It would also need a much larger indexed corpus and stronger evaluation.

This lab should therefore remain an educational experiment until its concepts are reimplemented and benchmarked for source-code retrieval.

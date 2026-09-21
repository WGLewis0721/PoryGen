# Scanner

## Pipeline

```
ingest → index → normalize (AST or lexical) → fingerprint (winnow) → license scan → provenance summary
```

Every phase writes `scans.status` as it happens, so the client's poll loop shows genuine
progress rather than a canned animation.

## Tree-sitter support (reference implementation)

`packages/provenance-core/src/scanner/treeSitterNormalize.ts` uses real `web-tree-sitter`
+ the `tree-sitter-wasms` grammar bundle for **JavaScript, TypeScript, and Python**. It
walks the real syntax tree: each named node becomes a `node:<type>` token
(`node:function_declaration`, `node:if_statement`, ...), identifier leaves collapse to
`ID`, literal leaves collapse to `LIT`. This is genuinely AST-shape-based — proven by
`packages/provenance-core/test/treeSitterNormalize.test.ts`, which parses real source,
renames every identifier and reformats the whitespace, and asserts the resulting
fingerprint set is unchanged.

This path is Node-only (it reads `.wasm` grammar files from disk via `node:fs`), so it
runs in the test suite and in `scripts/seed-lattice.ts` for fixture generation — not in
the Deno Edge Function.

## Lexical normalizer (deployed path)

`packages/provenance-core/src/scanner/lexicalNormalize.ts` is what actually runs inside
`scan-repository`. It's a dependency-free regex tokenizer: comments and exact
string/number values vanish, non-keyword identifiers collapse to `ID`, and
keywords/punctuation survive verbatim because they carry the structural shape. Renaming a
variable or reformatting a file does not change its normalized token stream — proven by
`lexicalNormalize.test.ts`.

**Why this instead of tree-sitter in production**: `web-tree-sitter` needs its own WASM
runtime plus a per-language grammar file (500 KB–2.3 MB each). Bundling those into a
Deno Edge Function deploy payload, or fetching them from a CDN on every cold start, is a
real cost/reliability tradeoff this build didn't take on. The lexical normalizer is
honest about being simpler than full parsing, but it feeds the *same* winnowing/
fingerprinting/corpus-matching pipeline as the tree-sitter path — the novel part of the
technique is identical in both; only the tokenization front-end differs. Swapping in a
WASM-served tree-sitter path later is a contained change (`scan-repository/index.ts`'s
`normalize` call), not an architecture change.

## Winnowing

`packages/provenance-core/src/scanner/winnow.ts` implements Schleimer, Wilkerson &
Aiken's Winnowing algorithm (2003) directly: `k`-gram hashing (`k = 5` normalized
tokens, FNV-1a) followed by a sliding window (`w = 4`) that keeps the minimum hash per
window (rightmost on ties), guaranteeing every substring of length ≥ `k + w - 1` has at
least one fingerprint selected. `hashKGrams` / `winnow` are exported and unit-tested
independently of the tokenizer.

## Reference corpus

`packages/provenance-core/src/scanner/corpus.ts` bundles four small, original utility
implementations (`debounce`, `deepClone`, `quicksort`, `withRetry`) written for this
corpus — not copied from any specific real project — each tagged with a license so
matches carry a plausible license signal. **The scanner compares only against this
configured corpus.** Product copy says exactly that
("Structural fingerprint match against configured reference corpus") and never implies a
search of public repositories or the open internet. Containment threshold: 0.55
(`CORPUS_MATCH_THRESHOLD`).

## License scanner

Inspects `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `COPYING`, `NOTICE` by text signature,
and parses dependencies from `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`
(lockfiles are in the recognized-file list; only manifests are actually parsed for
dependency names in this build — lockfile-only projects fall back to `Unknown` for
unlisted transitive deps). Recognizes MIT, Apache-2.0, BSD-2/3-Clause, ISC, MPL-2.0,
LGPL-2.1/3.0, GPL-2.0/3.0, AGPL-3.0, Unlicense, Unknown. Policy mapping
(`policyForLicense`): permissive → `CLEAR`, weak copyleft → `REVIEW`, strong copyleft →
`BLOCKING`, unrecognized → `UNKNOWN`.

In the Edge Function, dependency licenses are resolved via **real** registry lookups
(`registry.npmjs.org`, `pypi.org`) — fixed hosts, 3s timeout, license field only, falling
back to `Unknown` on any failure so a flaky registry never fails the scan.

## Limitations

- Lockfile parsing (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) is recognized as a
  present file but not parsed for a full transitive dependency tree in this build —
  direct dependencies from the manifest are what get evaluated.
- The reference corpus is intentionally tiny (4 entries). It demonstrates the mechanism,
  not production-scale clone detection — see the Enterprise-preview roadmap in
  [ARCHITECTURE.md](ARCHITECTURE.md).
- No binary/compiled-language support (only text source in the languages listed above).

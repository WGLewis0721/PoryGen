# Source Search Lab V2 — Validation Results

## Local validation

Environment: isolated Node 20-compatible runtime with outbound internet disabled.

Command:

```bash
node --test test/*.test.mjs
```

Measured result:

- tests discovered: 18
- passed: 17
- failed: 0
- skipped: 1
- measured suite duration: about 206 ms

The one skipped case is the live-network GitHub fixture. It is intentionally separated so the ordinary suite remains reproducible without internet access.

## Cases covered locally

Passed validations include:

1. strict public GitHub URL parsing;
2. commit/tree/blob repository retrieval using a deterministic mock provider;
3. explicit partial-scan behavior when file limits are reached;
4. committed public reference-index metadata;
5. identifier-preserving vs identifier-normalized tokens;
6. exact source match;
7. identifier renaming;
8. formatting/comment changes;
9. partial code fragments;
10. mixed-file matching;
11. common fingerprint patterns softened to possible/common-pattern;
12. source absent from index returns insufficient evidence;
13. bounded candidate shortlist;
14. separate customer/source coverage;
15. POST-only API;
16. `Cache-Control: no-store`;
17. one request performs repository fetch → retrieval → verification → result;
18. unrelated repository input can abstain.

The GitHub-provider test also verifies its fetch destinations are `api.github.com` and do not contain Google, Bing, or Brave search-provider hosts.

## Live public fixture

Fixture:

```text
https://github.com/sindresorhus/yocto-queue
```

Command:

```bash
npm run test:public
```

Expected assertion:

- resolve the repository's current commit;
- fetch its public source through the GitHub API;
- include `index.js`;
- find a **strong match** against the pinned `yocto-queue/index.js` document in the prebuilt reference index.

This test is also included in the path-scoped `.github/workflows/source-search-lab-v2.yml` workflow so it can run in a networked GitHub-hosted environment without deploying the lab.

## Interpretation

The V2 validation demonstrates the mechanics of:

```
click Scan
→ fetch bounded source
→ retrieve from a prebuilt code index
→ confirm an ordered region
→ return evidence
→ review / dismiss / rescan
```

It does **not** validate web-scale recall or the experimental thresholds.

The current corpus is only six files from three repositories. Accuracy numbers derived from such a corpus would be misleading.

## Remaining validation gates

Before treating this as production search technology:

- build a much larger held-out public corpus;
- measure top-k candidate recall at corpus scale;
- calibrate the strong/possible/abstain thresholds;
- measure false positives on real boilerplate/framework code;
- measure end-to-end latency on medium repositories;
- compare the dependency-free structural verifier against Tree-sitter/AST confirmation;
- decide whether public-code index lookup should remain self-hosted or use a licensed source-intelligence corpus.

V2 is a functional search-engine lab, not a production coverage claim.

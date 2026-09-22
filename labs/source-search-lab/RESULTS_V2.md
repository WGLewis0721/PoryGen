# Source Search Lab V2 — Validation Results

## V2.1 — Reporting precision pass

This pass addressed a reporting-precision problem: normalized structural
similarity (same code *shape*) was, by itself, enough to reach `strong_match`.
Common implementation structure — loops, guard clauses, common framework
idioms — is shared by huge amounts of unrelated code, so that gate produced
strong matches that were not actually tied to any specific indexed source.

**External 250-case validation harness:** not present in this repository or
this working environment. No search of the repository, its history, or the
filesystem found it. The precision/recall figures for that harness quoted in
the originating task description (reporting precision 0.0468, 2,320 incorrect
strong matches, etc.) are **not reproduced here** — they are not fabricated,
and they are not claimed to be current, because the harness that produced
them is unavailable in this environment. What follows is the repo-local
benchmark only, clearly labeled as such.

### What changed

`verifyCandidate` in `lib/search.mjs` now requires two independent kinds of
evidence before a candidate can become a `strong_match`, instead of one:

1. **Structural evidence** (unchanged): identifier-normalized ordered/contiguous
   token overlap and coverage — same as before.
2. **Specific evidence** (new): the ordered/contiguous overlap of only the
   identifier and literal tokens (exact spelling, not normalized), or a
   minimum number of rare preserving-representation fingerprints that are not
   common across the indexed corpus.

A candidate is a `strong_match` only when it clears **both** bars and is not
dominated by corpus-common fingerprints. Each candidate document is still
judged independently — nothing prevents two or more sources from
independently qualifying as strong matches on the same file. See
`README.md` → "Reporting gate" for the full rule.

### Repo-local before/after (illustrative, not the external harness)

Using a small synthetic index (`test/search-v2.test.mjs` fixtures), a case
with identical control-flow shape but completely different identifiers and
literals — the exact failure mode described above:

| | Before this change | After this change |
|---|---|---|
| Structural overlap | 45/45 ordered tokens, 100% coverage | 45/45 ordered tokens, 100% coverage (unchanged; still just "same shape") |
| Classification | `strong_match` (false positive) | `possible_common_pattern` |

Against the real committed 6-file reference corpus, scanning each indexed
file against itself (an exact-copy sanity check) still correctly resolves as
`strong_match` for all 6 files — the new specific-evidence bar does not
suppress genuine matches, only unsupported ones. (This also caught a real
bug during implementation: the committed `data/reference-index.json` had to
be rebuilt so its stored `settings` object carries the new threshold fields;
`npm run build:index` picks these up automatically for any future rebuild.)

### Local validation (this pass)

```bash
npm test
```

- tests discovered: 34
- passed: 33
- failed: 0
- skipped: 1 (the live-network GitHub fixture; separated so the suite stays
  reproducible without internet access)

New regression tests added: literal-only changes, an independently written
implementation of the same algorithm, the normalized-high/preserving-low
false-positive case above, and overlapping-scan-window de-duplication over a
single source. All previously existing tests (exact match, identifier
rename, formatting, partial fragment, mixed multi-source file, common
fingerprint softening, absent source, bounded shortlist, Python operators,
scan completeness/rescan/deletion resolution, GitHub provider limits) still
pass unchanged.

The live-network GitHub fixture (`npm run test:public`) could not be run in
this working environment — outbound requests to the GitHub API were
rejected (`401`/`403`) by this session's network policy — but it is
unchanged in behavior and is exercised automatically by
`.github/workflows/source-search-lab-v2.yml` on push to `lab/source-search-v2`.

## Original V2 local validation

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

The one locally skipped case is the live-network GitHub fixture. It is separated so the ordinary suite remains reproducible without internet access.

## Networked validation

GitHub Actions run `35670197356` completed successfully on current V2 head commit `767fb88f180a5aa1224af26de17cdec08e1bf26f`.

Both validation steps passed:

- **Unit and integration tests**
- **Live public GitHub fixture**

The live fixture scanned:

```text
https://github.com/sindresorhus/yocto-queue
```

and verified that the current public repository can be fetched from GitHub and its `index.js` produces a strong match against the pinned public reference entry.

## Cases covered

Validated behavior includes:

1. strict public GitHub URL parsing;
2. commit/tree/blob repository retrieval;
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
18. unrelated repository input can abstain;
19. a real public GitHub repository can complete the full fetch-and-match path.

The GitHub-provider test also verifies its fetch destinations are `api.github.com` and do not contain Google, Bing, or Brave search-provider hosts.

## Interpretation

V2 demonstrates the mechanics of:

```
click Scan
→ fetch bounded source
→ retrieve from a prebuilt code index
→ confirm an ordered region
→ return evidence
→ review / dismiss / rescan
```

It does **not** validate web-scale recall or the experimental thresholds.

The current corpus is only six files from three repositories. Accuracy percentages derived from such a corpus would be misleading.

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

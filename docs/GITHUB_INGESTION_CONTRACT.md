# GitHub ingestion state contract

## Purpose

PoryGen must translate GitHub provider behavior into domain facts without turning provider ambiguity into a stronger customer claim.

This contract is intentionally independent of the matcher. It governs only repository resolution, completeness, and the facts downstream scan/report consumers may rely on.

## Core invariant

> External failure, truncation, ambiguity, or absence of evidence must never increase the strength or completeness of a PoryGen conclusion.

In particular:

- **known empty** is not the same state as **unknown**;
- a provider failure must not become a zero-file/clean result;
- a missing Git revision must not be invented;
- a no-match statement may describe only the scope PoryGen positively established and checked.

## Provider boundary

GitHub exposes transport/provider observations such as HTTP status, response body, rate-limit headers, commit objects, and tree objects.

The PoryGen adapter translates those observations before the scanner consumes them.

```text
GitHub HTTP/API
    ↓
GitHub adapter
    ↓
repository/revision domain state
    ↓
source-file abstraction
    ↓
PoryGen Engine
    ↓
UI / Source Match Report / future MCP / future CLI
```

Only the GitHub adapter should interpret GitHub-specific HTTP semantics.

## Revision model

A GitHub source has one of two positively established revision states in the current synchronous adapter:

```text
{ kind: "git_commit", sha, treeSha, url? }

or

{ kind: "none", reason: "empty_repository" }
```

Repository state is correspondingly:

- `revision_resolved`
- `empty_repository`

The existing `commit` / `commitUrl` fields remain as compatibility fields for current consumers. New consumers should prefer the tagged `revision` field.

The adapter must not use a missing/empty revision value as hidden control flow.

## Commit-resolution state machine

```text
repository metadata
    │
    ├─ inaccessible/private/invalid ──────────> failure
    │
    ▼
resolve default-branch commit
    │
    ├─ 2xx + valid commit/tree ───────────────> revision_resolved
    │
    ├─ 409 + exact GitHub
    │   "Git Repository is empty." ───────────> empty_repository
    │
    └─ any other failure/ambiguity ───────────> failure / unknown
```

After a resolved revision:

```text
resolve tree
    │
    ├─ incomplete/truncated ──────────────────> partial
    │
    ▼
select supported source
    │
    ├─ zero eligible files ───────────────────> completed zero-file scan
    │
    ▼
scan
```

`empty_repository` and `zero eligible files` may share customer-facing zero-file language, but they remain distinct internal facts.

## Empty-repository contract

Precondition:

- repository metadata establishes that the repository exists and is public; and
- commit resolution returns GitHub's explicit HTTP 409 body with message exactly `Git Repository is empty.`.

Postconditions:

- `repositoryState === "empty_repository"`
- `revision.kind === "none"`
- `revision.reason === "empty_repository"`
- no Git commit SHA or URL is invented
- `files.length === 0`
- `fetchedFiles === 0`
- `supportedFilesInTree.length === 0`
- `treeComplete === true`
- `partial === false`
- `incompleteSupportedFiles === 0`

`treeComplete === true` here means PoryGen has complete knowledge of the relevant repository state: there is no commit/tree to enumerate. It does not claim that a historical tree exists.

## Unknown/failure contract

The following must **not** be converted to `empty_repository`:

- an unrelated HTTP 409;
- HTTP 404;
- HTTP 403/429 rate limiting;
- HTTP 5xx;
- timeout/abort;
- malformed or missing response body;
- a successful response missing the required commit SHA/tree SHA.

These remain failures or incomplete states. Unknown cannot be promoted to known empty.

## Information-ordering rule

For review purposes, reason about repository knowledge as:

```text
unknown
  ├─> known empty
  └─> known revision
```

A transition from unknown to either known state requires positive provider evidence.

A failure may reduce available knowledge; it may never increase certainty.

## Testing strategy

Use equivalence partitioning for commit resolution:

1. valid commit;
2. explicit empty-repository 409;
3. unrelated 409;
4. 404;
5. rate-limited 403/429;
6. 5xx;
7. timeout;
8. malformed JSON/body;
9. 2xx missing required commit/tree fields.

Boundary/state-transition tests should cover:

- zero commits → first commit;
- zero eligible files → one eligible file;
- complete → partial tree;
- resolved revision → provider failure on a later request.

Downstream report/UI tests must verify that an empty repository renders an explicit no-revision statement and never fabricates a commit link.

## Engineering sources

This design is derived from:

- HTTP semantics: RFC 9110, especially the general meaning of 409 Conflict;
- GitHub REST/Git database behavior for empty repositories;
- Ports-and-Adapters separation between provider-specific behavior and application/domain semantics;
- algebraic/tagged state modeling to make mutually exclusive states explicit;
- Design by Contract and invariant-based testing;
- equivalence partitioning, boundary-value analysis, and state-transition testing.

No external repository implementation is required for this design. The source of truth is the provider contract plus PoryGen's own domain invariants.

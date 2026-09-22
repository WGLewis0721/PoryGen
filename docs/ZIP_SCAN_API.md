# ZIP/folder scan contract for the UI

`POST /api/scan`, `Content-Type: application/json`, response `Cache-Control: no-store`.
Existing GitHub bodies still work. The Terms gate is unchanged: every source
requires `termsVersion: "2026-09-22-v1"` and a parseable `termsAcceptedAt` timestamp.

## Requests

```json
{
  "sourceType": "zip",
  "archiveBase64": "<canonical base64 ZIP bytes, no data URL prefix>",
  "exclusions": ["export/src/starter", "export/src/template.ts"],
  "termsVersion": "2026-09-22-v1",
  "termsAcceptedAt": "2026-09-22T12:00:00Z"
}
```

```json
{
  "sourceType": "files",
  "files": [{ "path": "src/app.ts", "content": "export const app = 1;" }],
  "exclusions": ["src/starter"],
  "termsVersion": "2026-09-22-v1",
  "termsAcceptedAt": "2026-09-22T12:00:00Z"
}
```

GitHub: `sourceType: "github"` (optional), `repositoryUrl`, optional `exclusions`,
and the same Terms fields. Never send multiple source representations together.
Folder paths should use `webkitRelativePath` or a deliberate project-relative
path. ZIP root folders are **not stripped**. Exclusions match submitted paths,
case-sensitively, after NFC normalization; exact files and directory prefixes
only, no globs. A rule `src/template` does not exclude `src/template-old`.

## Bounds

- JSON request/response: 4,000,000 bytes. ZIP: 2,900,000 compressed bytes.
- All archive entries (including ignored ones): 1,000 entries and 10,000,000
  declared expanded bytes. Actual expanded accepted source is checked too.
- Existing source limits: 100,000 bytes/file, 150 matched files, 2,000,000 source
  bytes. Exceeding these source budgets produces explicit partial metadata.
- ZIP compression ratio above 1000:1 is rejected. No encrypted archives,
  symlinks, devices, duplicate/unsafe paths or overlapping entry ranges.
- 10-second request-read timeout, 20-second upload worker deadline, at most two
  upload workers per warm instance. Deployment-wide abuse controls remain the
  hosting layer's responsibility; this is not an account quota system.
- UTF-8 JS/JSX/TS/TSX/MJS/CJS and Python as recognized by the existing engine.
  Binary/invalid UTF-8 source is skipped and counted as incomplete. Nested
  archives and unsupported extensions are ignored, never unpacked.

Avoid sending dependencies, build outputs or binary files from folder selection.
Server-side validation is authoritative. Requests above Vercel's own 4.5 MB
ceiling can be rejected by the platform before our structured JSON handler.

## Responses

Findings, coverage, classifications, thresholds and summary keep the existing
`ScanResult` semantics. Additive fields:

- `source: { type: "github" | "zip" | "files", transient?: true }`
- `scan.exclusions`: sorted, deduplicated rules applied before retrieval
- `scan.excludedFiles`: count of entries omitted by user rules
- `scan.ingestion` (uploads): `entries`, `declaredBytes`, `extractedBytes`,
  `skippedReasons`, `selectionComplete`, `empty`
- `scan.skipped`: bounded details, including `user_excluded`, `nested_archive`,
  `binary`; aggregate counts are not capped with the details.

Upload `repository` is a compatibility envelope: `name: "Local project"`,
`url: null`, `commitUrl: null`, `defaultBranch: null`. `commit` is a deterministic
content digest, **not a Git commit**. Do not construct GitHub customer links.
Public-source links remain pinned to the indexed source commits as before.

`treeComplete` is false for uploads: an uploaded selection cannot prove that a
missing file was deleted from the actual project. `partial` reflects skipped
supported source/budgets/comparison errors, not intentional exclusions. An empty
selection returns 200 with `ingestion.empty: true`; say "No eligible source files
were scanned", not "Your project is clear". Always disclose exclusions.

Only successful rechecks can support rescan resolution. Do not mark findings
resolved just because they are now excluded. No durable source, uploaded-file
history, sharing, or reports are introduced. UI must not persist uploaded source
or excerpts in localStorage/sessionStorage or send them to analytics.

Errors retain a renderable string and add machine-readable fields:

```json
{"error":"The expanded project exceeds the size limit.","code":"EXTRACTED_SIZE_LIMIT","retryable":false}
```

400: `INVALID_JSON`, `INVALID_REQUEST`, `INVALID_FILES`, `INVALID_SOURCE_TYPE`,
`AMBIGUOUS_SOURCE`, `INVALID_EXCLUSIONS`, `UNSAFE_PATH`, `UNSAFE_ENTRY`,
`DUPLICATE_PATH`, `INVALID_ARCHIVE`, `UNSUPPORTED_ARCHIVE`, `SUSPICIOUS_ARCHIVE`.
413: `UPLOAD_TOO_LARGE`, `EXTRACTED_SIZE_LIMIT`, `TOO_MANY_FILES`, `RESULT_TOO_LARGE`.
415: `UNSUPPORTED_MEDIA_TYPE`. 428: `TERMS_REQUIRED`.
408: `PROCESSING_TIMEOUT`; 429: `SCAN_BUSY` (both retryable).
500: sanitized `SCAN_FAILED`. Existing GitHub provider errors are unchanged.

Run `npm run test:ingestion` for the narrow contract/security suite. No matcher
benchmark is part of this addition.

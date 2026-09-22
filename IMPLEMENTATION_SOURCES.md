# Implementation sources

ZIP/folder ingestion, consulted 2026-09-22. No matcher/corpus changes.

| URL | Owner / title | Decision informed | Affected files |
| --- | --- | --- | --- |
| https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html | OWASP / File Upload Cheat Sheet | Defense in depth: allowlisted source types, untrusted filenames, compressed and expanded limits, no extraction into a filesystem, no recursive archive processing. | `labs/source-search-lab/lib/upload-source.mjs`, `ingestion-policy.mjs` |
| https://github.com/thejoshwolfe/yauzl | yauzl maintainers / README | Pin 3.4.0; sequential lazy entries, strict filename handling, validate actual expanded sizes. Library does not check CRC, so check it separately. | `package.json`, `package-lock.json`, `labs/source-search-lab/lib/upload-source.mjs` |
| https://nodejs.org/api/zlib.html#zlibcrc32data-value | Node.js / Zlib CRC32 | Incremental checksum validation for source entries, without buffering an unbounded expanded archive. Requires Node 20.15+ (production supports Node 24). | `labs/source-search-lab/lib/upload-source.mjs`, `scripts/test-zip-ingestion.mjs` |
| https://nodejs.org/api/worker_threads.html#workerterminate | Node.js / Worker threads | Terminate the upload ingestion/matching worker at a fixed wall-clock deadline; a Promise race around synchronous matching cannot interrupt it. Bound worker heap and concurrent uploads per instance. | `labs/source-search-lab/lib/upload-service.mjs`, `upload-worker.mjs`, `vercel.json` |
| https://vercel.com/docs/functions/limitations#request-body-size | Vercel / Functions limits | 4 MB JSON envelope and response cap below documented 4.5 MB ceiling; ZIP bytes limited to 2.9 MB to allow base64 overhead. No Blob upload because uploaded source must not be persisted. | `api/scan.mjs`, `labs/source-search-lab/lib/upload-source.mjs` |

Ignored entries are not decompressed. Their declared sizes still count against
the archive budget; entry paths, flags, modes, overlapping compressed ranges and
compression ratios are validated even when excluded. Accepted source entries
receive actual-size and CRC checks. No uploaded code is executed, installed,
written to disk, sent to an LLM, or retained in a cache.

## Public scan ZIP and folder UI

Public `/scan` ZIP and folder upload, consulted 2026-09-22. No matcher, corpus, billing, or API changes. Limits and error codes follow `docs/ZIP_SCAN_API.md` on `feature/zip-scan-ingestion` (`b755e1a789e54df82ec8df918a9d53b1d53dfcb4`).

| URL | Owner / title | Decision informed | Affected files |
| --- | --- | --- | --- |
| https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory | MDN / `HTMLInputElement.webkitdirectory` | Folder scans use the directory picker on `<input type="file" webkitdirectory multiple>`, not drag-and-drop and not the File System Access API, so the control stays a labelled native input. | `src/features/publicScan/PublicScanPage.tsx` |
| https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath | MDN / `File.webkitRelativePath` | Submitted folder paths are `webkitRelativePath` (the selected folder name is the first segment). Exclusions must match that path; ZIP roots are not stripped either. | `src/features/publicScan/scanRequest.ts` |
| https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa | MDN / `btoa()` | Canonical ZIP `archiveBase64` is standard base64 with `=` padding and no data-URL prefix. `btoa` rejects code points above 255, so bytes are encoded directly instead of being passed through a Unicode string. | `src/features/publicScan/scanRequest.ts` |
| https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64 | MDN / `Uint8Array.prototype.toBase64()` | Where the method exists, call it with `{ alphabet: "base64", omitPadding: false }` so the payload matches Node’s canonical base64. Otherwise use the local encoder, which is tested against `Buffer.toString("base64")`. | `src/features/publicScan/scanRequest.ts` |

## Pre-launch report actions

Action-oriented report layered on the ZIP/folder scan UI, consulted 2026-09-22.
No matcher, corpus, intake or API changes.

| URL | Owner / title | Decision informed | Affected files |
| --- | --- | --- | --- |
| https://spdx.org/licenses/ | Linux Foundation / SPDX License List | License consequences are keyed to SPDX identifiers, grouped permissive / weak copyleft / strong copyleft, with `-or-later` and `+` suffixes normalized so `GPL-3.0-or-later` is not misread as unknown. An unrecognized or missing identifier is UNKNOWN and never treated as permissive. | `src/features/publicScan/licenseGuidance.ts` |
| https://www.gnu.org/licenses/agpl-3.0.html | Free Software Foundation / GNU AGPL v3 | AGPL's §13 network clause is why hosted SaaS is called out separately from distribution in the strong-copyleft wording: for a founder about to launch a web product, "you never ship binaries" is not the end of the question. | `src/features/publicScan/licenseGuidance.ts` |

All wording stays conditional ("may require", "may create obligations"). PoryGen
does not certify originality, decide authorship, or give legal advice, and the
report says so next to the findings.

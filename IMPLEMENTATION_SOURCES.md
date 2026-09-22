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

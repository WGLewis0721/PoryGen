#!/usr/bin/env node
// Copies the browser/Node-safe subset of packages/provenance-core/src into
// supabase/functions/scan-repository/_shared, rewriting the NodeNext-style
// `.js` relative import extensions to `.ts` (Deno resolves TS imports by
// their real on-disk extension). This keeps the Edge Function's copy of the
// scanner honestly derived from the same tested source rather than a
// hand-diverged fork — re-run after touching any file listed below.
//
// Deliberately excluded: treeSitterNormalize.ts (Node-only, uses node:fs) and
// provenance/events.ts + sigstore.ts (not needed by a one-shot repo scan;
// see docs/SCANNER.md for the lexical-vs-tree-sitter boundary this encodes).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "packages/provenance-core/src");
const dest = join(root, "supabase/functions/scan-repository/_shared");

const FILES = [
  "types.ts",
  "fingerprint.ts",
  "sbom.ts",
  "scanner/lexicalNormalize.ts",
  "scanner/winnow.ts",
  "scanner/corpus.ts",
  "scanner/license.ts",
];

for (const relPath of FILES) {
  const from = join(src, relPath);
  const to = join(dest, relPath);
  mkdirSync(dirname(to), { recursive: true });
  const content = readFileSync(from, "utf8").replace(/from\s+"([./][^"]+)\.js"/g, 'from "$1.ts"');
  writeFileSync(to, content);
  console.log(`synced ${relPath}`);
}

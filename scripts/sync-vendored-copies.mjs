#!/usr/bin/env node
// PoryGen's scanner/provenance logic has exactly one source of truth —
// packages/provenance-core/src — but it's consumed by three runtimes with
// incompatible module resolution: the Vite app (bundler/ESM, workspace
// symlink, no copy needed), the scan-repository Deno Edge Function (needs
// real on-disk .ts files with .ts-extension imports, deployed standalone),
// and the VS Code extension (compiles to CommonJS for the extension host).
// This script regenerates the latter two copies from provenance-core so
// they never hand-drift from the tested source. Re-run after touching any
// listed file, before deploying the Edge Function or packaging the
// extension.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "packages/provenance-core/src");

// ---- scan-repository Edge Function (Deno) ----------------------------------
// Excludes treeSitterNormalize.ts (Node-only, uses node:fs) and
// provenance/events.ts + sigstore.ts (a one-shot repo scan doesn't need the
// hash chain — see docs/SCANNER.md).
{
  const dest = join(root, "supabase/functions/scan-repository/_shared");
  const FILES = [
    "types.ts",
    "fingerprint.ts",
    "sbom.ts",
    "scanner/lexicalNormalize.ts",
    "scanner/winnow.ts",
    "scanner/corpus.ts",
    "scanner/license.ts",
    "scanner/similarity.ts",
    "scanner/pipeline.ts",
    "scanner/providers/types.ts",
    "scanner/providers/staticCorpus.ts",
    "scanner/providers/referenceCorpus.ts",
  ];
  for (const relPath of FILES) {
    const from = join(src, relPath);
    const to = join(dest, relPath);
    mkdirSync(dirname(to), { recursive: true });
    const content = readFileSync(from, "utf8").replace(/from\s+"([./][^"]+)\.js"/g, 'from "$1.ts"');
    writeFileSync(to, content);
    console.log(`[edge function] synced ${relPath}`);
  }
}

// ---- VS Code extension (CommonJS) ------------------------------------------
// Only the classifier — the extension never needs the scanner.
{
  const dest = join(root, "packages/vscode-extension/src");
  const classifierSrc = readFileSync(join(src, "provenance/classifier.ts"), "utf8")
    .replace(/from\s+"\.\.\/types\.js"/g, 'from "./types"')
    .replace(
      /^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*\n/,
      "// Synced from packages/provenance-core/src/provenance/classifier.ts by\n" +
        "// scripts/sync-vendored-copies.mjs — do not hand-edit; re-run the sync\n" +
        "// script after touching the source. Vendored rather than workspace-imported\n" +
        "// because this package compiles to CommonJS for the VS Code extension host,\n" +
        "// while provenance-core targets ESM/bundler resolution for the Vite app and\n" +
        "// Deno edge functions.\n\n",
    );
  writeFileSync(join(dest, "classifier.ts"), classifierSrc);
  console.log("[vscode-extension] synced classifier.ts");
  // types.ts for the extension is a hand-maintained subset (adds
  // CapturedProvenanceEvent, which has no provenance-core equivalent) —
  // intentionally not overwritten here.
}

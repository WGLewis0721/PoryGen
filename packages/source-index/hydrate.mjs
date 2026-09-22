#!/usr/bin/env node
// Build-time step: turn the committed corpus manifest into the corpus pack the
// scan function loads, by downloading the exact pinned release archives from
// npm/PyPI and extracting the listed files. Third-party source never enters git.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exactContentHash } from "./lib/content.mjs";
import { fetchArchive, verifyIntegrity } from "./lib/registries.mjs";
import { readTar, stripRoot } from "./lib/tar.mjs";

const data = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "labs", "source-search-lab", "data");
const manifestPath = path.join(data, "corpus-manifest.json");
const packPath = path.join(data, "corpus-pack.json");

if (!existsSync(manifestPath)) {
  console.log("hydrate: no corpus manifest, scanner will use the pinned reference index only");
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const byArchive = new Map();
for (const doc of manifest.documents) {
  if (!byArchive.has(doc.archiveUrl)) byArchive.set(doc.archiveUrl, []);
  byArchive.get(doc.archiveUrl).push(doc);
}

const hydrated = [];
const failures = [];
const archives = [...byArchive.entries()];
let next = 0;

async function worker() {
  while (next < archives.length) {
    const [url, docs] = archives[next++];
    try {
      const archive = await fetchArchive(url);
      if (!archive || !verifyIntegrity(archive, docs[0].archiveIntegrity)) throw new Error("archive missing or integrity mismatch");
      const wanted = new Map(docs.map((d) => [d.path, d]));
      for (const entry of readTar(archive, { maxEntryBytes: 100_000 })) {
        const doc = wanted.get(stripRoot(entry.path));
        if (!doc) continue;
        const source = entry.content.toString("utf8");
        if (exactContentHash(source) !== doc.exactHash) { failures.push(`${doc.id}: content hash mismatch`); continue; }
        hydrated.push({ ...doc, source });
        wanted.delete(doc.path);
      }
      for (const doc of wanted.values()) failures.push(`${doc.id}: not found in archive`);
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: 12 }, worker));

const missingRatio = 1 - hydrated.length / manifest.documents.length;
console.log(`hydrate: ${hydrated.length}/${manifest.documents.length} files from ${archives.length} archives in ${((Date.now() - started) / 1000).toFixed(1)}s`);
for (const failure of failures.slice(0, 10)) console.log(`  skipped ${failure}`);
if (missingRatio > 0.1) {
  console.error("hydrate: more than 10% of the corpus could not be fetched; refusing to ship a degraded corpus");
  process.exit(1);
}

const order = new Map(manifest.documents.map((d, i) => [d.id, i]));
hydrated.sort((a, b) => order.get(a.id) - order.get(b.id));
const packages = new Set(hydrated.map((d) => `${d.ecosystem}:${d.repository.replace(/@[^@]+$/, "")}`));
writeFileSync(packPath, JSON.stringify({
  ...manifest,
  format: "porygen-corpus-pack/1",
  coverage: {
    ...manifest.coverage,
    files: hydrated.length,
    packages: packages.size,
    claim: `PoryGen currently searches ${hydrated.length.toLocaleString("en-US")} canonical source files from ${packages.size.toLocaleString("en-US")} popular npm and PyPI packages.`,
  },
  documents: hydrated,
}));

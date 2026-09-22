#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { openCorpus } from "./lib/db.mjs";
import { computeFrequencies, downloads, exportPack, fetchProjects, rankUpstreams, seed, stats, toManifest } from "./lib/stages.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: "string", default: path.join(here, "data", "corpus.db") },
    npm: { type: "string", default: "3000" },
    pypi: { type: "string", default: "1500" },
    "target-files": { type: "string", default: "50000" },
    concurrency: { type: "string", default: "6" },
    documents: { type: "string", default: "1000" },
    "stop-preserving": { type: "string", default: "30" },
    "stop-normalized": { type: "string", default: "8" },
    out: { type: "string", default: path.join(here, "..", "..", "labs", "source-search-lab", "data", "corpus-pack.json") },
    manifest: { type: "string", default: path.join(here, "..", "..", "labs", "source-search-lab", "data", "corpus-manifest.json") },
  },
});

const USAGE = `usage: node cli.mjs <stage> [options]

stages (run in order; "build" runs all of them):
  seed        load popular npm + PyPI project lists           --npm 3000 --pypi 1500
  fetch       download releases, select + dedupe source files --target-files 50000 --concurrency 6
  downloads   fill npm monthly download counts (authority signal)
  frequencies global fingerprint frequencies per cluster/project
  rank        choose the likely upstream occurrence per cluster
  export      write the corpus pack + committable manifest                    --documents 1000 --stop-preserving 30 --stop-normalized 8
  stats       print corpus statistics
  build       seed → fetch → downloads → frequencies → rank → export`;

const stage = positionals[0];
if (!stage) { console.log(USAGE); process.exit(1); }

mkdirSync(path.dirname(values.db), { recursive: true });
const db = openCorpus(values.db);
const n = (key) => Number(values[key]);

const stages = {
  seed: () => seed(db, { npm: n("npm"), pypi: n("pypi") }),
  fetch: () => fetchProjects(db, { targetFiles: n("target-files"), concurrency: n("concurrency") }),
  downloads: () => downloads(db),
  frequencies: () => computeFrequencies(db),
  rank: () => rankUpstreams(db),
  export: () => {
    const pack = exportPack(db, { documents: n("documents"), stopPreserving: n("stop-preserving"), stopNormalized: n("stop-normalized") });
    writeFileSync(values.out, JSON.stringify(pack));
    writeFileSync(values.manifest, JSON.stringify(toManifest(pack)));
    console.log(`wrote ${values.out} and ${values.manifest}: ${pack.coverage.claim}`);
    console.log(`stoplist: ${pack.stoplist.preserving.length} preserving, ${pack.stoplist.normalized.length} normalized fingerprints`);
  },
  stats: () => console.log(JSON.stringify(stats(db), null, 2)),
};

const order = stage === "build" ? ["seed", "fetch", "downloads", "frequencies", "rank", "export", "stats"] : [stage];
for (const name of order) {
  if (!stages[name]) { console.log(USAGE); process.exit(1); }
  await stages[name]();
}
db.close();

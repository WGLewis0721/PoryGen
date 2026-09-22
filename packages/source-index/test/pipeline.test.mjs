import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readTar, stripRoot } from "../lib/tar.mjs";
import { normalizeLicense } from "../lib/license.mjs";
import { rankCluster } from "../lib/rank.mjs";
import { analyze, selectFile } from "../lib/content.mjs";
import { referenceIndexFromPack } from "../../../labs/source-search-lab/lib/corpus-pack.mjs";

function tarEntry(name, body, type = "0") {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0);
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write(type, 156);
  const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  Buffer.from(body).copy(padded);
  return Buffer.concat([header, padded]);
}

test("tar reader handles gzip, pax long paths and strips the archive root", () => {
  const long = `package/${"deep/".repeat(30)}index.js`;
  const pax = `${long.length + 7 + String(long.length + 7).length} path=${long}\n`;
  const archive = gzipSync(Buffer.concat([
    tarEntry("PaxHeader", pax, "x"), tarEntry("ignored", "export const a = 1;"),
    tarEntry("package/lib/b.js", "export const b = 2;"), Buffer.alloc(1024),
  ]));
  const files = [...readTar(archive)].map((f) => [stripRoot(f.path), f.content.toString()]);
  assert.deepEqual(files[0], [long.replace(/^package\//, ""), "export const a = 1;"]);
  assert.deepEqual(files[1], ["lib/b.js", "export const b = 2;"]);
});

test("licenses normalize to SPDX with the right risk family", () => {
  assert.deepEqual(normalizeLicense("MIT"), { spdx: "MIT", raw: "MIT", family: "permissive" });
  assert.equal(normalizeLicense({ type: "Apache License, Version 2.0" }).spdx, "Apache-2.0");
  assert.equal(normalizeLicense(["License :: OSI Approved :: GNU General Public License v3 (GPLv3)"]).family, "copyleft");
  assert.equal(normalizeLicense("(MIT OR GPL-3.0-only)").family, "permissive");
  assert.equal(normalizeLicense("MIT AND GPL-2.0-only").family, "copyleft");
  assert.equal(normalizeLicense("SEE LICENSE IN LICENSE.md").family, "unknown");
});

test("ranking prefers the original package over a vendored or build copy", () => {
  const base = { downloads: 1000, licenseSpdx: "MIT" };
  const ranked = rankCluster([
    { ...base, id: 1, name: "setuptools", path: "setuptools/_vendor/packaging/_elffile.py", firstPublished: "2006-01-01", downloads: 9e8 },
    { ...base, id: 2, name: "packaging", path: "src/packaging/_elffile.py", firstPublished: "2014-01-01", downloads: 8e8 },
    { ...base, id: 3, name: "packaging", path: "dist/packaging/_elffile.py", firstPublished: "2014-01-01", downloads: 8e8 },
  ]);
  assert.equal(ranked[0].id, 2);
  assert.ok(ranked[0].probability > 0.5);
  assert.equal(ranked.at(-1).features.derived + ranked.find((o) => o.id === 1).features.vendored, 2);
});

test("dedup keys ignore formatting and comments but not identifiers", () => {
  const a = analyze("function add(a, b) {\n  // sum\n  return a + b;\n}", "javascript");
  const b = analyze("function add(a,b){return a+b;}", "javascript");
  const c = analyze("function sum(x, y) { return x + y; }", "javascript");
  assert.equal(a.shapeHash, b.shapeHash);
  assert.notEqual(a.exactHash, b.exactHash);
  assert.notEqual(a.shapeHash, c.shapeHash);
  assert.equal(selectFile("dist/app.min.js", Buffer.from("x")).keep, false);
  assert.equal(selectFile("src/types.d.ts", Buffer.from("x")).keep, false);
});

test("a corpus pack loads into the existing matcher format with the stoplist applied", () => {
  const source = "export function clamp(value, min, max) {\n  if (value < min) return min;\n  if (value > max) return max;\n  return value;\n}\n";
  const doc = { id: "npm:x@1:src/clamp.js", repository: "x@1", commit: "1", path: "src/clamp.js", language: "javascript", license: "MIT", sourceUrl: "https://unpkg.com/x@1/src/clamp.js", source };
  const full = referenceIndexFromPack({ coverage: { claim: "PoryGen currently searches 1 canonical source files from 1 popular npm and PyPI packages." }, stoplist: {}, documents: [doc] });
  const someHash = Object.keys(full.postings.preserving)[0];
  const pruned = referenceIndexFromPack({ coverage: full.coverage, stoplist: { preserving: [Number(someHash)] }, documents: [doc] });
  assert.equal(full.documents.length, 1);
  assert.ok(full.documents[0].tokens.preserving.length > 10);
  assert.equal(pruned.postings.preserving[someHash], undefined);
  assert.match(full.coverage.claim, /^PoryGen currently searches 1 canonical/);
});

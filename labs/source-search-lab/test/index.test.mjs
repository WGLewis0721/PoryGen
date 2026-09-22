import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReferenceIndex } from "../lib/search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("committed reference index has documented pinned public-code coverage", async () => {
  const index = JSON.parse(await readFile(path.join(__dirname, "..", "data", "reference-index.json"), "utf8"));
  assert.equal(index.version, 2);
  assert.equal(index.coverage.files, 6);
  assert.deepEqual(new Set(index.coverage.languages), new Set(["javascript", "typescript", "python"]));
  assert.deepEqual(
    new Set(index.coverage.repositories),
    new Set(["sindresorhus/yocto-queue", "date-fns/date-fns", "psf/requests"]),
  );
  assert.ok(index.documents.every((doc) => /^[0-9a-f]{40}$/.test(doc.commit)));
  assert.ok(index.documents.every((doc) => doc.sourceUrl.includes(`/blob/${doc.commit}/`)));
  assert.ok(index.documents.every((doc) => doc.license && doc.license !== "Unknown"));
});


test("committed reference index matches rebuilding with the current tokenizer", async () => {
  const index = JSON.parse(await readFile(path.join(__dirname, "..", "data", "reference-index.json"), "utf8"));
  const documents = index.documents.map(({ tokens, ...document }) => document);
  const rebuilt = buildReferenceIndex(documents, index.settings);

  assert.deepEqual(rebuilt.documents.map((doc) => doc.tokens), index.documents.map((doc) => doc.tokens));
  assert.deepEqual(rebuilt.postings, index.postings);
});

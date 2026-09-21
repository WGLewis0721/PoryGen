import test from "node:test";
import assert from "node:assert/strict";
import { rankDocuments, tokenize } from "../lib/search.mjs";

const docs = [
  { title: "Winnowing fingerprints", tags: ["code", "similarity"], body: "Winnowing selects fingerprints from token hashes." },
  { title: "REST APIs", tags: ["http"], body: "APIs let programs exchange data over HTTP." }
];

test("tokenize removes common filler words", () => {
  assert.deepEqual(tokenize("How does the code search work?"), ["does", "code", "search", "work"]);
});

test("ranking puts the strongest match first", () => {
  const results = rankDocuments("winnowing code fingerprints", docs);
  assert.equal(results[0].title, "Winnowing fingerprints");
  assert.ok(results[0].score > 0);
});

test("no matching terms returns no local results", () => {
  const results = rankDocuments("quantum pancakes", docs);
  assert.equal(results.length, 0);
});

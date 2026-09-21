import test from "node:test";
import assert from "node:assert/strict";
import { makeSnippet, rankDocuments, tokenize } from "../lib/search.mjs";

const docs = [
  { title: "Winnowing fingerprints", tags: ["code", "similarity"], body: "Winnowing selects fingerprints from token hashes.", url: "/w" },
  { title: "REST APIs", tags: ["http"], body: "APIs let programs exchange data over HTTP.", url: "/r" },
  { title: "Search basics", tags: ["retrieval"], body: "A search system can rank candidate documents.", url: "/s" }
];

test("tokenize removes common filler words", () => {
  assert.deepEqual(tokenize("How does the code search work?"), ["does", "code", "search", "work"]);
});

test("tokenization is case-insensitive", () => {
  assert.deepEqual(tokenize("GitHub GITHUB github"), ["github", "github", "github"]);
});

test("tokenization keeps programming markers like +, #, dot and dash", () => {
  assert.deepEqual(tokenize("C++ C# node.js source-map"), ["c++", "c#", "node.js", "source-map"]);
});

test("ranking puts the strongest match first", () => {
  const results = rankDocuments("winnowing code fingerprints", docs);
  assert.equal(results[0].title, "Winnowing fingerprints");
  assert.ok(results[0].score > 0);
});

test("title matches outrank body-only matches", () => {
  const results = rankDocuments("search", docs);
  assert.equal(results[0].title, "Search basics");
});

test("more query-term coverage produces a stronger score", () => {
  const candidates = [
    { title: "Code fingerprints", tags: [], body: "code fingerprints similarity", url: "/a" },
    { title: "Code notes", tags: [], body: "code only", url: "/b" }
  ];
  const results = rankDocuments("code fingerprints similarity", candidates);
  assert.equal(results[0].url, "/a");
});

test("no matching terms returns no local results", () => {
  const results = rankDocuments("quantum pancakes", docs);
  assert.equal(results.length, 0);
});

test("snippet is bounded", () => {
  const body = "x ".repeat(200) + "fingerprint target " + "y ".repeat(200);
  const snippet = makeSnippet(body, "fingerprint", 90);
  assert.ok(snippet.length <= 92);
  assert.match(snippet, /fingerprint/);
});

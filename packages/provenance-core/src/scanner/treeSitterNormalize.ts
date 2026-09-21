// Reference AST-based normalizer, backed by real Tree-sitter grammars
// (web-tree-sitter + the tree-sitter-wasms grammar bundle). Node-only: it
// reads .wasm grammar files from disk, so it runs in the test suite and the
// `npm run seed` fixture generator, not in the Deno Edge Function (see
// lexicalNormalize.ts for that path, and docs/SCANNER.md for the boundary).
//
// This is what proves the winnowing/fingerprint pipeline in this repository
// is genuinely AST-shape-based, not just string matching: each source node
// (function/class/if/for/call/...) becomes a token; identifier and literal
// leaves collapse to generic markers exactly as in the lexical path, so both
// normalizers plug into the same `fingerprintTokens` pipeline.
//
// web-tree-sitter's public types model `Language`/`SyntaxNode` as members of
// a `Parser` namespace rather than named exports, which doesn't play well
// with strict standalone typing here — this file uses targeted `any` at the
// tree-sitter boundary and stays fully typed (`NormToken[]`) at its own
// exported surface.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Parser from "web-tree-sitter";
import type { NormToken, SupportedLanguage } from "../types.js";

const require = createRequire(import.meta.url);

let initPromise: Promise<void> | null = null;
const languageCache = new Map<string, any>();

const GRAMMAR_FILES: Record<Exclude<SupportedLanguage, "unknown">, string> = {
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  python: "tree-sitter-python.wasm",
};

/** Leaf node types whose text is developer-chosen and must collapse for rename/format invariance. */
const IDENTIFIER_NODE_TYPES = new Set([
  "identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "type_identifier",
]);
const LITERAL_NODE_TYPES = new Set([
  "string",
  "string_fragment",
  "number",
  "integer",
  "float",
  "template_string",
]);

async function getLanguage(language: Exclude<SupportedLanguage, "unknown">): Promise<any> {
  const cached = languageCache.get(language);
  if (cached) return cached;

  if (!initPromise) {
    const runtimeWasmPath = require.resolve("web-tree-sitter/tree-sitter.wasm");
    const wasmBinary = await readFile(runtimeWasmPath);
    initPromise = Parser.init({ wasmBinary });
  }
  await initPromise;

  const grammarPath = require.resolve(`tree-sitter-wasms/out/${GRAMMAR_FILES[language]}`);
  const grammarBytes = await readFile(grammarPath);
  const loaded = await (Parser as any).Language.load(new Uint8Array(grammarBytes));
  languageCache.set(language, loaded);
  return loaded;
}

function walk(node: any, tokens: NormToken[]) {
  const line = node.startPosition.row + 1;

  if (node.childCount === 0) {
    if (IDENTIFIER_NODE_TYPES.has(node.type)) {
      tokens.push({ kind: "ID", line });
    } else if (LITERAL_NODE_TYPES.has(node.type)) {
      tokens.push({ kind: "LIT", line });
    } else if (node.type !== "comment" && node.isNamed === false && node.text.trim()) {
      // Anonymous leaf token, e.g. punctuation/keyword text emitted verbatim by the grammar.
      tokens.push({ kind: node.text, line });
    } else if (node.isNamed) {
      tokens.push({ kind: `node:${node.type}`, line });
    }
    return;
  }

  if (node.type !== "comment") {
    tokens.push({ kind: `node:${node.type}`, line });
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, tokens);
  }
}

export async function treeSitterNormalize(
  source: string,
  language: Exclude<SupportedLanguage, "unknown">,
): Promise<NormToken[]> {
  const lang = await getLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  if (!tree) return [];
  const tokens: NormToken[] = [];
  walk(tree.rootNode, tokens);
  parser.delete();
  return tokens;
}

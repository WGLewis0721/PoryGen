// Dependency-free structural normalizer.
//
// This is the normalizer that actually runs inside the `scan-repository` Edge
// Function (Deno, cold-start sensitive, no bundled multi-megabyte WASM
// grammars). It is intentionally simpler than full AST parsing: it tokenizes
// source text, strips content that varies without changing program structure
// (comments, whitespace, exact string/number values), and collapses developer
// identifier choices to a single class marker. Renaming a variable or
// reformatting a file therefore does not change its normalized token stream,
// while control-flow and call structure survive intact.
//
// `treeSitterNormalize.ts` is the heavier, genuinely-AST-based sibling used
// for the reference/test path and Lattice seed generation. See
// docs/SCANNER.md for exactly which path runs where and why.

import type { NormToken, SupportedLanguage } from "../types.ts";

const KEYWORDS: Record<Exclude<SupportedLanguage, "unknown">, Set<string>> = {
  javascript: new Set([
    "function", "return", "if", "else", "for", "while", "do", "switch", "case",
    "break", "continue", "class", "extends", "new", "this", "super", "try",
    "catch", "finally", "throw", "const", "let", "var", "import", "export",
    "default", "from", "async", "await", "yield", "typeof", "instanceof",
    "in", "of", "delete", "void", "null", "undefined", "true", "false",
    "static", "get", "set",
  ]),
  typescript: new Set([
    "function", "return", "if", "else", "for", "while", "do", "switch", "case",
    "break", "continue", "class", "extends", "new", "this", "super", "try",
    "catch", "finally", "throw", "const", "let", "var", "import", "export",
    "default", "from", "async", "await", "yield", "typeof", "instanceof",
    "in", "of", "delete", "void", "null", "undefined", "true", "false",
    "static", "get", "set", "interface", "type", "enum", "implements",
    "public", "private", "protected", "readonly", "namespace", "declare",
    "as", "is", "keyof", "infer",
  ]),
  python: new Set([
    "def", "return", "if", "elif", "else", "for", "while", "break", "continue",
    "class", "try", "except", "finally", "raise", "import", "from", "as",
    "with", "lambda", "yield", "async", "await", "in", "is", "not", "and",
    "or", "pass", "global", "nonlocal", "assert", "del", "None", "True",
    "False", "self",
  ]),
};

/** Coarse language detection from a repository-relative file path. */
export function detectLanguage(path: string): SupportedLanguage {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (ext === ".ts" || ext === ".tsx" || ext === ".mts" || ext === ".cts") return "typescript";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".py") return "python";
  return "unknown";
}

const PUNCTUATION = new Set([
  "{", "}", "(", ")", "[", "]", ";", ",", ".", ":", "?", "=>", "=", "==",
  "===", "!=", "!==", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "&&",
  "||", "!", "&", "|", "^", "~", "++", "--", "+=", "-=", "*=", "/=", "...",
]);

const TOKEN_PATTERN =
  /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|\b\d+(?:\.\d+)?\b|[A-Za-z_$][A-Za-z0-9_$]*|=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|\.\.\.|[{}()\[\];,.:?=<>+\-*/%&|!^~]/g;

/**
 * Tokenizes and normalizes source text into a rename- and format-invariant
 * token stream: comments vanish, string/number literals collapse to `LIT`,
 * non-keyword identifiers collapse to `ID`, and keywords/punctuation survive
 * verbatim because they carry the program's structural shape.
 */
export function lexicalNormalize(source: string, language: SupportedLanguage): NormToken[] {
  const keywords = language === "unknown" ? new Set<string>() : KEYWORDS[language];
  const tokens: NormToken[] = [];
  let line = 1;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(source))) {
    // Count newlines consumed since the previous token to keep line numbers real.
    for (let i = lastIndex; i < match.index; i++) {
      if (source.charCodeAt(i) === 10) line++;
    }
    lastIndex = TOKEN_PATTERN.lastIndex;

    const raw = match[0];
    const newlines = raw.match(/\n/g);
    const tokenStartLine = line;
    if (newlines) line += newlines.length;

    if (raw.startsWith("//") || raw.startsWith("#") || raw.startsWith("/*")) {
      continue; // comments carry no structural signal
    }
    if (raw[0] === '"' || raw[0] === "'" || raw[0] === "`") {
      tokens.push({ kind: "LIT", line: tokenStartLine });
      continue;
    }
    if (/^\d/.test(raw)) {
      tokens.push({ kind: "LIT", line: tokenStartLine });
      continue;
    }
    if (PUNCTUATION.has(raw)) {
      tokens.push({ kind: raw, line: tokenStartLine });
      continue;
    }
    if (keywords.has(raw)) {
      tokens.push({ kind: `kw:${raw}`, line: tokenStartLine });
      continue;
    }
    // Identifier (variable, function, class, or property name).
    tokens.push({ kind: "ID", line: tokenStartLine });
  }

  return tokens;
}

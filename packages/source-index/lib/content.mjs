import { createHash } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  detectLanguage,
  fingerprintTokens,
  tokenizeSource,
} from "../../../labs/source-search-lab/lib/search.mjs";

export { detectLanguage };

export const FILE_LIMITS = Object.freeze({ maxBytes: 100_000, minTokens: 40 });

const SKIP_PATH = /(^|\/)(node_modules|vendor|third_party|__pycache__|\.git)(\/|$)|\.d\.[cm]?ts$|\.min\.[cm]?js$|[.-]bundle\.[cm]?js$/i;

/** Tests, examples, benchmarks and tooling: indexed, but never preferred as the upstream. */
export const AUXILIARY_PATH =
  /(^|\/)(tests?|__tests__|spec|specs|e2e|bench(mark)?s?|examples?|demos?|docs?|scripts?|tools?)(\/|$)|\.(test|spec|bench)\.[a-z]+$|(^|\/)(test_[^/]*|[^/]*_test)\.py$|(^|\/)(conftest|setup|noxfile)\.py$/i;

/** Build output that re-ships another file's code (dist/, build/, umd/, cjs/ copies). */
export const DERIVED_PATH = /(^|\/)(dist|build|umd|cjs|esm|lib-cov|out|bundle|compiled)(\/|$)/i;

export function isMinified(source) {
  const lines = source.split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return longest > 1000 || source.length / Math.max(1, lines.length) > 250;
}

/** Whether a file from a release archive should enter the corpus at all. */
export function selectFile(path, content) {
  if (SKIP_PATH.test(path)) return { keep: false, reason: "excluded_path" };
  const language = detectLanguage(path);
  if (language === "unknown") return { keep: false, reason: "unsupported_type" };
  if (content.length > FILE_LIMITS.maxBytes) return { keep: false, reason: "too_large" };
  if (content.includes(0)) return { keep: false, reason: "binary" };
  const source = content.toString("utf8");
  if (/^\s*\/\/ *@generated|^\s*# *(generated|auto-generated)|DO NOT EDIT/m.test(source.slice(0, 600))) {
    return { keep: false, reason: "generated" };
  }
  if (isMinified(source)) return { keep: false, reason: "minified" };
  return { keep: true, language, source };
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export const exactContentHash = (source) => sha256(source.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, ""));

const SEPARATOR = String.fromCharCode(1);

/**
 * Two identities per file:
 *  - exactHash: byte content with line endings and trailing space normalized
 *    (the same file re-published verbatim).
 *  - shapeHash: the full token stream with comments and layout dropped (the
 *    same code reformatted or re-commented). Files sharing it form one dedup
 *    cluster. Identifiers and literals stay in: normalizing them merges
 *    genuinely different small files (import shims, data tables). Renamed
 *    copies are still linked at match time through normalized fingerprints.
 */
export function analyze(source, language, settings = DEFAULT_SETTINGS) {
  const preserving = tokenizeSource(source, language);
  const normalized = tokenizeSource(source, language, { normalizeIdentifiers: true });
  const exactHash = exactContentHash(source);
  const shapeHash = sha256(preserving.map((t) => t.kind).join(SEPARATOR));
  const fingerprints = {
    preserving: [...new Set(fingerprintTokens(preserving, settings).map((f) => f.hash))],
    normalized: [...new Set(fingerprintTokens(normalized, settings).map((f) => f.hash))],
  };
  return { exactHash, shapeHash, tokenCount: preserving.length, fingerprints };
}

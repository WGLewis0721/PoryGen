// A small, explicit reference corpus for structural fingerprint comparison.
//
// This is intentionally tiny and bundled with the app. It backs the
// `porygen-reference-corpus` similarity provider (providers/referenceCorpus.ts),
// which is the only provider wired into real scans today. Product copy must
// say exactly what that covers — "checks against known reference source" —
// and never imply a search of GitHub or the open internet.
//
// Entries are common, unattributed utility patterns written for this corpus
// (not copied from any specific project) so the demo has real, deterministic
// matches to find without reproducing anyone's licensed source.

import type { CorpusEntry, CorpusMatch, Fingerprint, SupportedLanguage } from "../types.ts";
import { lexicalNormalize } from "./lexicalNormalize.ts";
import { fingerprintTokens } from "./winnow.ts";

interface RawCorpusEntry {
  id: string;
  title: string;
  license: string;
  language: SupportedLanguage;
  sample: string;
  commonIdiom?: boolean;
}

/** Bump when entries change so findings record which corpus revision produced them. */
export const REFERENCE_CORPUS_VERSION = "2026.1";

const RAW_CORPUS: RawCorpusEntry[] = [
  {
    id: "ref-debounce-js",
    commonIdiom: true,
    title: "debounce(fn, wait) reference implementation",
    license: "MIT",
    language: "javascript",
    sample: `function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}`,
  },
  {
    id: "ref-deepclone-js",
    commonIdiom: true,
    title: "deepClone(value) reference implementation",
    license: "MIT",
    language: "javascript",
    sample: `function deepClone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  const result = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = deepClone(value[key]);
    }
  }
  return result;
}`,
  },
  {
    id: "ref-quicksort-py",
    commonIdiom: true,
    title: "quicksort(items) reference implementation",
    license: "AGPL-3.0",
    language: "python",
    sample: `def quicksort(items):
    if len(items) <= 1:
        return items
    pivot = items[len(items) // 2]
    left = [x for x in items if x < pivot]
    middle = [x for x in items if x == pivot]
    right = [x for x in items if x > pivot]
    return quicksort(left) + middle + quicksort(right)`,
  },
  {
    id: "ref-retry-ts",
    commonIdiom: true,
    title: "withRetry(fn, attempts) reference implementation",
    license: "Apache-2.0",
    language: "typescript",
    sample: `async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 2 ** i * 100));
    }
  }
  throw lastError;
}`,
  },
];

function buildCorpus(): CorpusEntry[] {
  return RAW_CORPUS.map((entry) => {
    const tokens = lexicalNormalize(entry.sample, entry.language);
    return {
      id: entry.id,
      title: entry.title,
      license: entry.license,
      language: entry.language,
      sample: entry.sample,
      commonIdiom: entry.commonIdiom,
      fingerprints: fingerprintTokens(tokens),
    };
  });
}

/** Precomputed once per process; the corpus is static and small. */
export const REFERENCE_CORPUS: CorpusEntry[] = buildCorpus();

/** Containment threshold: a probe must share this fraction of a corpus entry's fingerprints to be a match. Mirrors SIMILARITY_THRESHOLDS.report. */
export const CORPUS_MATCH_THRESHOLD = 0.55;

export function matchAgainstCorpus(
  probeFingerprints: Fingerprint[],
  corpus: CorpusEntry[] = REFERENCE_CORPUS,
): CorpusMatch[] {
  const probeHashes = new Set(probeFingerprints.map((f) => f.hash));
  const matches: CorpusMatch[] = [];

  for (const entry of corpus) {
    if (entry.fingerprints.length === 0) continue;
    const entryHashes = new Set(entry.fingerprints.map((f) => f.hash));
    let shared = 0;
    for (const hash of entryHashes) if (probeHashes.has(hash)) shared++;
    const containment = shared / entryHashes.size;
    if (containment >= CORPUS_MATCH_THRESHOLD) {
      matches.push({
        entryId: entry.id,
        entryTitle: entry.title,
        entryLicense: entry.license,
        containment,
        sharedFingerprints: shared,
        corpusFingerprints: entryHashes.size,
      });
    }
  }

  return matches.sort((a, b) => b.containment - a.containment);
}

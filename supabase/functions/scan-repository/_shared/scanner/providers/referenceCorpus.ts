// The bundled reference corpus as a SimilarityProvider — the only provider
// wired into real scans today. Coverage is stated plainly: a handful of
// original reference implementations, not GitHub, not package registries, not
// the open internet.

import type { CorpusEntry } from "../../types.ts";
import { REFERENCE_CORPUS, REFERENCE_CORPUS_VERSION } from "../corpus.ts";
import { createStaticCorpusProvider } from "./staticCorpus.ts";
import type { NormalizeFn, NormalizerId, SimilarityProvider } from "./types.ts";

export const REFERENCE_CORPUS_PROVIDER_ID = "porygen-reference-corpus";

export interface ReferenceCorpusProviderOptions {
  /** Extra normalizers (e.g. tree-sitter on Node). Lexical is always available. */
  normalizers?: Partial<Record<NormalizerId, NormalizeFn>>;
  /** Override the corpus (tests). */
  corpus?: CorpusEntry[];
}

export function createReferenceCorpusProvider(options: ReferenceCorpusProviderOptions = {}): SimilarityProvider {
  const corpus = options.corpus ?? REFERENCE_CORPUS;
  return createStaticCorpusProvider({
    id: REFERENCE_CORPUS_PROVIDER_ID,
    providerName: "PoryGen reference corpus",
    corpusName: "Bundled reference implementations",
    corpusVersion: REFERENCE_CORPUS_VERSION,
    scope: "bundled-reference",
    claim: `Compared against PoryGen's bundled reference corpus (${corpus.length} reference implementations, v${REFERENCE_CORPUS_VERSION}). This is not a search of GitHub, package registries, or the open internet.`,
    limitations: [
      "Code that resembles a project outside this corpus will not be flagged.",
      "Matches are structural similarity evidence, not proof of copying.",
      "Reference entries are original implementations written for PoryGen and carry an assigned reference license.",
    ],
    redistributable: true,
    normalizers: options.normalizers,
    entries: corpus.map((entry) => ({
      id: entry.id,
      title: entry.title,
      license: entry.license,
      language: entry.language,
      source: entry.sample,
      commonIdiom: entry.commonIdiom,
      origin: {
        kind: "reference-corpus",
        label: "PoryGen reference corpus — original reference implementation",
        repository: null,
        path: entry.id,
        url: null,
      },
    })),
  });
}

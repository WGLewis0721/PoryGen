import { buildReferenceIndex, DEFAULT_SETTINGS } from "./search.mjs";

/**
 * Turn a corpus pack (packages/source-index export) plus any pinned legacy
 * index into the reference index the matcher already consumes. Tokens and
 * postings are rebuilt here by the unchanged matcher code; the pack's global
 * stoplist then removes fingerprints common across the whole public corpus,
 * which a small served subset cannot see on its own.
 */
export function referenceIndexFromPack(pack, legacyIndex = null, settings = legacyIndex?.settings ?? DEFAULT_SETTINGS) {
  const legacyDocs = (legacyIndex?.documents ?? []).map(({ tokens: _tokens, ...doc }) => doc);
  const seen = new Set();
  const documents = [...legacyDocs, ...pack.documents].filter((doc) => !seen.has(doc.id) && seen.add(doc.id));
  const index = buildReferenceIndex(documents, settings);

  for (const representation of ["preserving", "normalized"]) {
    for (const hash of pack.stoplist?.[representation] ?? []) delete index.postings[representation][String(hash)];
  }

  const files = index.documents.length;
  index.coverage = {
    ...index.coverage,
    ...pack.coverage,
    files,
    claim: pack.coverage.claim.replace(/searches [\d,]+ canonical/, `searches ${files.toLocaleString("en-US")} canonical`),
  };
  index.corpus = pack.corpus;
  return index;
}

// A SimilarityProvider over a fixed, in-memory set of source files. It backs
// the bundled reference corpus in real scans and the fictional sample corpus in
// the public demo, and it's the natural shape for a customer's private corpus
// later. Discovery uses an inverted fingerprint index (hash → entries), the way
// a large corpus would; comparison is exact containment over winnowed
// fingerprints. Candidates are fingerprinted with whichever normalizer produced
// the probe, so lexical (edge) and tree-sitter (worker/local) paths each
// compare like with like.

import type { SupportedLanguage } from "../../types.ts";
import { lexicalNormalize } from "../lexicalNormalize.ts";
import { compareFingerprinted, type FingerprintedSource } from "../similarity.ts";
import { fingerprintTokens } from "../winnow.ts";
import type {
  CandidateOrigin,
  CoverageScope,
  NormalizeFn,
  NormalizerId,
  ProbeFile,
  ProviderCoverage,
  SimilarityCandidate,
  SimilarityEvidence,
  SimilarityProvider,
} from "./types.ts";

export interface StaticCorpusEntry {
  id: string;
  title: string;
  license: string;
  language: SupportedLanguage;
  source: string;
  origin: CandidateOrigin;
  commonIdiom?: boolean;
}

export interface StaticCorpusConfig {
  id: string;
  providerName: string;
  corpusName: string;
  corpusVersion: string;
  scope: CoverageScope;
  claim: string;
  limitations: string[];
  entries: StaticCorpusEntry[];
  /** Whether candidate source may be shown side by side. False for corpora we can't redistribute. */
  redistributable: boolean;
  normalizers?: Partial<Record<NormalizerId, NormalizeFn>>;
}

export function createStaticCorpusProvider(config: StaticCorpusConfig): SimilarityProvider {
  const normalizers: Partial<Record<NormalizerId, NormalizeFn>> = { lexical: lexicalNormalize, ...config.normalizers };
  const byId = new Map(config.entries.map((entry) => [entry.id, entry]));
  const fingerprintCache = new Map<string, FingerprintedSource>();
  const indexCache = new Map<NormalizerId, Map<number, Set<string>>>();

  async function fingerprinted(entry: StaticCorpusEntry, normalizerId: NormalizerId): Promise<FingerprintedSource | null> {
    const key = `${normalizerId}:${entry.id}`;
    const cached = fingerprintCache.get(key);
    if (cached) return cached;
    const normalize = normalizers[normalizerId];
    if (!normalize) return null;
    const tokens = await normalize(entry.source, entry.language);
    const result = { tokens, fingerprints: fingerprintTokens(tokens) };
    fingerprintCache.set(key, result);
    return result;
  }

  async function indexFor(normalizerId: NormalizerId): Promise<Map<number, Set<string>> | null> {
    const cached = indexCache.get(normalizerId);
    if (cached) return cached;
    if (!normalizers[normalizerId]) return null;
    const index = new Map<number, Set<string>>();
    for (const entry of config.entries) {
      const source = await fingerprinted(entry, normalizerId);
      if (!source) continue;
      for (const fp of source.fingerprints) {
        let ids = index.get(fp.hash);
        if (!ids) index.set(fp.hash, (ids = new Set()));
        ids.add(entry.id);
      }
    }
    indexCache.set(normalizerId, index);
    return index;
  }

  const languages = Array.from(new Set(config.entries.map((entry) => entry.language)));

  return {
    id: config.id,

    describeCoverage(): ProviderCoverage {
      return {
        providerId: config.id,
        providerName: config.providerName,
        corpusName: config.corpusName,
        corpusVersion: config.corpusVersion,
        scope: config.scope,
        entryCount: config.entries.length,
        languages,
        claim: config.claim,
        limitations: config.limitations,
      };
    },

    async discoverCandidates(probe: ProbeFile): Promise<SimilarityCandidate[]> {
      const index = await indexFor(probe.normalizer);
      if (!index) return [];
      const hits = new Set<string>();
      for (const fp of probe.fingerprints) {
        const ids = index.get(fp.hash);
        if (ids) for (const id of ids) hits.add(id);
      }
      const candidates: SimilarityCandidate[] = [];
      for (const id of hits) {
        const entry = byId.get(id);
        if (!entry) continue;
        candidates.push({
          providerId: config.id,
          candidateId: entry.id,
          title: entry.title,
          license: entry.license,
          language: entry.language,
          commonIdiom: entry.commonIdiom,
          origin: entry.origin,
        });
      }
      return candidates;
    },

    async compareCandidate(probe: ProbeFile, candidate: SimilarityCandidate): Promise<SimilarityEvidence | null> {
      const entry = byId.get(candidate.candidateId);
      if (!entry) return null;
      const source = await fingerprinted(entry, probe.normalizer);
      if (!source) return null;
      return {
        providerId: config.id,
        candidateId: entry.id,
        ...compareFingerprinted(probe, source),
        candidateExcerpt: config.redistributable ? entry.source : null,
      };
    },
  };
}

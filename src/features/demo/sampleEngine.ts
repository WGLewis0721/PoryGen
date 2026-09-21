// Runs PoryGen's real scan pipeline over the demo's fictional repository,
// against a fictional sample corpus. Same normalizer, same Winnowing, same
// similarity bands as a real scan — only the inputs are sample data.

import {
  createStaticCorpusProvider,
  detectLanguage,
  fingerprintTokens,
  lexicalNormalize,
  runScanPipeline,
  type PipelineResult,
  type SimilarityProvider,
} from "@porygen/provenance-core";
import { SAMPLE_CORPUS, SAMPLE_FILES_AFTER, SAMPLE_FILES_BEFORE } from "./sampleRepo";

export const SAMPLE_PROVIDER_ID = "sample-corpus";

export function createSampleProvider(): SimilarityProvider {
  return createStaticCorpusProvider({
    id: SAMPLE_PROVIDER_ID,
    providerName: "Sample corpus (demo only)",
    corpusName: "Fictional public-source projects",
    corpusVersion: "demo",
    scope: "sample",
    claim:
      "Demo only: three fictional open-source files written for this walkthrough. Real scans compare against PoryGen's reference corpus — never the entire internet.",
    limitations: ["Sample data. Nothing in this demo describes a real repository or a real project."],
    redistributable: true,
    entries: SAMPLE_CORPUS,
  });
}

/**
 * Containment of one file against one sample source, even below the reporting
 * threshold — so the demo can show the rescan score instead of just "gone".
 */
export async function compareToSample(path: string, content: string, candidateId: string): Promise<number> {
  const provider = createSampleProvider();
  const language = detectLanguage(path);
  const tokens = lexicalNormalize(content, language);
  const probe = { path, language, source: content, tokens, fingerprints: fingerprintTokens(tokens), normalizer: "lexical" as const };
  const candidate = (await provider.discoverCandidates(probe)).find((c) => c.candidateId === candidateId);
  if (!candidate) return 0;
  return (await provider.compareCandidate(probe, candidate))?.containment ?? 0;
}

export type SampleRevision = "before" | "after";

export function runSampleScan(revision: SampleRevision, provider: SimilarityProvider = createSampleProvider()): Promise<PipelineResult> {
  return runScanPipeline({
    repositoryName: "lattice-app (sample)",
    files: revision === "before" ? SAMPLE_FILES_BEFORE : SAMPLE_FILES_AFTER,
    providers: [provider],
  });
}

import { fetchPublicGitHubRepository, isAuxiliaryPath } from "./github-source.mjs";
import { scanSourceFiles } from "./search.mjs";

const ok = (payload) => ({ status: 200, payload });

export async function scanRepository(repositoryUrl, {
  referenceIndex,
  repositoryFetcher = fetchPublicGitHubRepository,
  exclusions = [],
}) {
  if (!repositoryUrl) return { status: 400, payload: { error: "Enter a public GitHub repository URL." } };
  const started = Date.now();
  try {
    const fetched = await repositoryFetcher(repositoryUrl, { exclusions });
    return scanIngestedSource(fetched, referenceIndex, started);
  } catch (error) {
    return { status: 502, payload: { error: error instanceof Error ? error.message : "Scan failed." } };
  }
}

// Both source adapters converge here; retrieval, verification and reporting stay unchanged.
export function scanIngestedSource(fetched, referenceIndex, started = Date.now()) {
    const compared = scanSourceFiles(fetched.files, referenceIndex, referenceIndex.settings);
    // Reporting filter, not a matcher change: weak shape-only similarity in tests,
    // benchmarks and tooling is overwhelmingly scaffolding, so it is not surfaced.
    compared.findings = compared.findings.filter((f) =>
      !(f.classification === "possible_common_pattern" && isAuxiliaryPath(f.customer.path)));

    const strong = compared.findings.filter((f) => f.classification === "strong_match").length;
    const possible = compared.findings.filter((f) => f.classification === "possible_common_pattern").length;
    const insufficient = compared.findings.filter((f) => f.classification === "insufficient_evidence").length;
    const comparisonErrorFiles = new Set(compared.errors.map((error) => error.file));
    const successfullyCheckedFiles = fetched.files
      .map((file) => file.path)
      .filter((path) => !comparisonErrorFiles.has(path));

    return ok({
      repository: {
        name: fetched.repository,
        url: fetched.repositoryUrl,
        commit: fetched.commit,
        commitUrl: fetched.commitUrl,
        defaultBranch: fetched.defaultBranch,
      },
      coverage: referenceIndex.coverage,
      source: fetched.source ?? { type: 'github' },
      scan: {
        exclusions: fetched.stats.exclusions ?? [],
        excludedFiles: fetched.stats.excludedFiles ?? 0,
        ingestion: fetched.stats.ingestion ?? null,
        elapsedMs: Date.now() - started,
        fetchedFiles: fetched.stats.fetchedFiles,
        fetchedBytes: fetched.stats.fetchedBytes,
        partial: fetched.partial || compared.errors.length > 0,
        checkedFiles: successfullyCheckedFiles,
        supportedFilesInTree: fetched.stats.supportedFilesInTree ?? fetched.files.map((file) => file.path),
        treeComplete: fetched.stats.treeComplete ?? fetched.stats.treeTruncated !== true,
        incompleteSupportedFiles: fetched.stats.incompleteSupportedFiles ?? 0,
        incompleteReasons: fetched.stats.incompleteReasons ?? {},
        treeTruncated: fetched.stats.treeTruncated,
        stoppedForLimit: fetched.stats.stoppedForLimit,
        skippedCount: fetched.stats.skippedCount,
        skipped: fetched.skipped,
        providerErrors: compared.errors,
      },
      summary: { strong, possible, insufficient, total: compared.findings.length },
      // Weak matches are a long tail on big repos; return the strongest few and keep the true count.
      findings: [
        ...compared.findings.filter((f) => f.classification !== "possible_common_pattern"),
        ...compared.findings
          .filter((f) => f.classification === "possible_common_pattern")
          .sort((a, b) => (b.metrics?.contiguousTokens ?? 0) - (a.metrics?.contiguousTokens ?? 0))
          .slice(0, 25),
      ],
      disclaimer:
        "Similarity is evidence to review, not proof of copying or AI authorship. No match means only that nothing sufficiently strong was found in this lab's indexed sources.",
    });
}

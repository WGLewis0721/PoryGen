export interface Range { start: number; end: number }

export interface Finding {
  id: string;
  classification: "strong_match" | "possible_common_pattern" | "insufficient_evidence";
  customer: { path: string; lines: Range | null; excerpt: string };
  publicSource: {
    repository: string;
    commit: string;
    path: string;
    url: string;
    lines: Range | null;
    excerpt: string;
    license: string;
    licenseUrl?: string;
  } | null;
  metrics?: { customerCoverage: number; sourceCoverage: number; matchedTokens: number; contiguousTokens: number };
  explanation: string;
}

export interface ScanResult {
  repository: { name: string; url: string; commit: string; commitUrl: string; defaultBranch: string };
  coverage: { claim: string };
  scan: {
    elapsedMs: number;
    fetchedFiles: number;
    fetchedBytes: number;
    partial: boolean;
    checkedFiles: string[];
    supportedFilesInTree: string[];
    treeComplete: boolean;
    skippedCount: number;
    incompleteSupportedFiles: number;
    incompleteReasons: Record<string, number>;
  };
  summary: { strong: number; possible: number; insufficient: number; total: number };
  findings: Finding[];
  disclaimer: string;
}

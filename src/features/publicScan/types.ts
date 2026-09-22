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

export interface UploadIngestion {
  entries: number;
  declaredBytes: number;
  extractedBytes: number;
  skippedReasons: Record<string, number>;
  selectionComplete: boolean;
  empty: boolean;
}

export interface ScanResult {
  repository: {
    name: string;
    url: string | null;
    commit: string;
    commitUrl: string | null;
    defaultBranch: string | null;
  };
  /** Present once the ZIP/folder contract is live. Older GitHub responses omit it. */
  source?: { type: "github" | "zip" | "files"; transient?: boolean };
  coverage: { claim: string };
  scan: {
    exclusions?: string[];
    excludedFiles?: number;
    ingestion?: UploadIngestion | null;
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
    skipped?: { path: string; reason: string }[];
  };
  summary: { strong: number; possible: number; insufficient: number; total: number };
  findings: Finding[];
  disclaimer: string;
}

export interface ScanErrorBody {
  error?: string;
  code?: string;
  retryable?: boolean;
}

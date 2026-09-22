import { describe, expect, it, vi } from "vitest";
import type { Finding, ScanResult } from "./types";
import {
  SCAN_LIMITS,
  buildGitHubScanRequest,
  buildZipScanRequest,
  encodeCanonicalBase64,
  formatScanFailure,
  pathExcluded,
  persistPublicScan,
  prepareFilesSource,
  projectRelativePath,
  resolvedSince,
  scanHeadline,
  uploadHasNoEligibleFiles,
} from "./scanRequest";

const terms = { version: "2026-09-22-v1", acceptedAt: "2026-09-22T12:00:00.000Z" };

function finding(path: string, id = path): Finding {
  return {
    id,
    classification: "strong_match",
    customer: { path, lines: { start: 1, end: 2 }, excerpt: "const secret = 1;" },
    publicSource: {
      repository: "example/lib",
      commit: "abc1234",
      path: "src/lib.js",
      url: "https://github.com/example/lib/blob/abc1234/src/lib.js",
      lines: { start: 4, end: 5 },
      excerpt: "const secret = 1;",
      license: "MIT",
    },
    explanation: "Source-specific evidence is substantial enough to justify surfacing this public source for review.",
  };
}

function scan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    repository: { name: "owner/repo", url: "https://github.com/owner/repo", commit: "aaa", commitUrl: "https://github.com/owner/repo/commit/aaa", defaultBranch: "main" },
    source: { type: "github" },
    coverage: { claim: "This lab searches indexed public sources." },
    scan: {
      exclusions: [],
      excludedFiles: 0,
      ingestion: null,
      elapsedMs: 10,
      fetchedFiles: 1,
      fetchedBytes: 20,
      partial: false,
      checkedFiles: ["src/app.ts"],
      supportedFilesInTree: ["src/app.ts"],
      treeComplete: true,
      skippedCount: 0,
      incompleteSupportedFiles: 0,
      incompleteReasons: {},
    },
    summary: { strong: 1, possible: 0, insufficient: 0, total: 1 },
    findings: [finding("src/app.ts")],
    disclaimer: "Similarity is evidence to review.",
    ...overrides,
  };
}

describe("GitHub scan requests", () => {
  it("keeps the existing body when there are no exclusions", () => {
    expect(buildGitHubScanRequest("https://github.com/owner/repo", [], terms)).toEqual({
      repositoryUrl: "https://github.com/owner/repo",
      termsVersion: terms.version,
      termsAcceptedAt: terms.acceptedAt,
    });
  });

  it("sends exact exclusion paths and no upload fields", () => {
    const request = buildGitHubScanRequest("https://github.com/owner/repo", ["src/starter/", "src/template.ts"], terms);
    expect(request).toEqual({
      sourceType: "github",
      repositoryUrl: "https://github.com/owner/repo",
      exclusions: ["src/starter", "src/template.ts"],
      termsVersion: terms.version,
      termsAcceptedAt: terms.acceptedAt,
    });
    expect(request).not.toHaveProperty("files");
    expect(request).not.toHaveProperty("archiveBase64");
  });
});

describe("ZIP scan requests", () => {
  it("sends canonical archiveBase64 and nothing else that identifies another source", () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x10]);
    const request = buildZipScanRequest(bytes, ["export/src/starter"], terms);
    expect(request.sourceType).toBe("zip");
    expect(request.archiveBase64).toBe("UEsDBAD/EA==");
    expect(request.archiveBase64.startsWith("data:")).toBe(false);
    expect(request.archiveBase64.length % 4).toBe(0);
    expect(request.exclusions).toEqual(["export/src/starter"]);
    expect(request).not.toHaveProperty("files");
    expect(request).not.toHaveProperty("repositoryUrl");
  });

  it("rejects an oversized archive before encoding a request", () => {
    const bytes = new Uint8Array(SCAN_LIMITS.maxArchiveBytes + 1);
    bytes.set([0x50, 0x4b, 0x03, 0x04]);
    expect(() => buildZipScanRequest(bytes, [], terms)).toThrow(/upload size limit/i);
  });
});

describe("canonical base64", () => {
  it("matches standard padded base64, including bytes above 127", () => {
    expect(encodeCanonicalBase64(new Uint8Array([104, 101, 108, 108, 111]))).toBe("aGVsbG8=");
    expect(encodeCanonicalBase64(new Uint8Array([255]))).toBe("/w==");
    expect(encodeCanonicalBase64(new Uint8Array([255, 239]))).toBe("/+8=");
    expect(encodeCanonicalBase64(new Uint8Array([255, 239, 1]))).toBe("/+8B");
    expect(encodeCanonicalBase64(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x10]))).toBe("UEsDBAD/EA==");
  });
});

describe("folder scan requests", () => {
  it("uses webkitRelativePath, drops dependencies, and applies exact exclusions", async () => {
    const read = vi.fn(async (text: string) => new TextEncoder().encode(text));
    const starter = vi.fn(async () => new TextEncoder().encode("export const starter = 1;\n"));
    const prepared = await prepareFilesSource([
      { path: "export/node_modules/left-pad/index.js", size: 12, read: () => read("nope") },
      { path: "export/src/template/App.tsx", size: 20, read: starter },
      { path: "export/src/template-old/app.ts", size: 24, read: () => read("export const old = 1;\n") },
      { path: "export/src/app.ts", size: 22, read: () => read("export const app = 1;\n") },
      { path: "export/README.md", size: 8, read: () => read("nope") },
      { path: "export/dist/app.js", size: 8, read: () => read("nope") },
    ], ["export/src/template"], terms);

    expect(starter).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalledWith("nope");
    expect(prepared.excluded).toBe(1);
    expect(prepared.omittedDependencies).toBe(2);
    expect(prepared.request).toEqual({
      sourceType: "files",
      files: [
        { path: "export/src/app.ts", content: "export const app = 1;\n" },
        { path: "export/src/template-old/app.ts", content: "export const old = 1;\n" },
      ],
      exclusions: ["export/src/template"],
      termsVersion: terms.version,
      termsAcceptedAt: terms.acceptedAt,
    });
    expect(prepared.request).not.toHaveProperty("archiveBase64");
    expect(prepared.request).not.toHaveProperty("repositoryUrl");
    expect(pathExcluded("export/src/template-old/app.ts", prepared.request.exclusions ?? [])).toBe(false);
    expect(pathExcluded("export/src/template/App.tsx", prepared.request.exclusions ?? [])).toBe(true);
  });

  it("keeps the selected folder name from webkitRelativePath", () => {
    const file = { name: "app.ts", webkitRelativePath: "my-app/src/app.ts" };
    expect(projectRelativePath(file)).toBe("my-app/src/app.ts");
  });
});

describe("private upload persistence", () => {
  it("does not write upload results, excerpts, or session storage", () => {
    const local = { setItem: vi.fn() };
    const session = { setItem: vi.fn() };
    const uploaded = scan({
      source: { type: "zip", transient: true },
      repository: { name: "Local project", url: null, commit: "digest", commitUrl: null, defaultBranch: null },
      findings: [finding("src/app.ts")],
    });
    persistPublicScan(uploaded, { "src/app.ts": { status: "dismissed", reason: "We wrote this ourselves", at: "t" } }, { local, session });
    expect(local.setItem).not.toHaveBeenCalled();
    expect(session.setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(uploaded)).toContain("const secret = 1;");

    const github = scan();
    persistPublicScan(github, {}, { local, session });
    expect(local.setItem).toHaveBeenCalledOnce();
    expect(session.setItem).not.toHaveBeenCalled();
    expect(String(local.setItem.mock.calls[0][0])).toBe("porygen.scan.owner/repo");
  });
});

describe("structured errors and empty uploads", () => {
  it("renders the server message, code, and retry hint", () => {
    expect(formatScanFailure({
      error: "The expanded project exceeds the size limit.",
      code: "EXTRACTED_SIZE_LIMIT",
      retryable: false,
    })).toBe("The expanded project exceeds the size limit. (EXTRACTED_SIZE_LIMIT)");
    expect(formatScanFailure({ error: "Project processing timed out.", code: "PROCESSING_TIMEOUT", retryable: true }))
      .toBe("Project processing timed out. (PROCESSING_TIMEOUT) You can try again.");
    expect(formatScanFailure({ error: "The scanner is busy. Try again shortly.", code: "SCAN_BUSY", retryable: true }))
      .toBe("The scanner is busy. Try again shortly. (SCAN_BUSY)");
  });

  it("does not describe an empty upload as a clean scan", () => {
    const empty = scan({
      source: { type: "files", transient: true },
      repository: { name: "Local project", url: null, commit: "digest", commitUrl: null, defaultBranch: null },
      scan: {
        ...scan().scan,
        fetchedFiles: 0,
        checkedFiles: [],
        treeComplete: false,
        ingestion: { entries: 0, declaredBytes: 0, extractedBytes: 0, skippedReasons: {}, selectionComplete: true, empty: true },
      },
      findings: [],
      summary: { strong: 0, possible: 0, insufficient: 0, total: 0 },
    });
    expect(uploadHasNoEligibleFiles(empty)).toBe(true);
    expect(scanHeadline(empty, 0, 0)).toBe("No eligible source files were scanned");
    expect(scanHeadline(empty, 0, 0).toLowerCase()).not.toContain("clean");
    expect(scanHeadline(empty, 0, 0)).not.toContain("No strong source match");
  });
});

describe("rescan resolution", () => {
  it("resolves a rechecked file and ignores a file that was only excluded", () => {
    const previous = scan({
      repository: { name: "owner/repo", url: "https://github.com/owner/repo", commit: "aaa", commitUrl: null, defaultBranch: "main" },
      findings: [finding("src/app.ts", "app"), finding("src/starter/kit.ts", "kit")],
    });
    const next = scan({
      repository: { name: "owner/repo", url: "https://github.com/owner/repo", commit: "bbb", commitUrl: null, defaultBranch: "main" },
      findings: [],
      scan: {
        ...scan().scan,
        exclusions: ["src/starter"],
        excludedFiles: 1,
        checkedFiles: ["src/app.ts"],
        supportedFilesInTree: ["src/app.ts", "src/starter/kit.ts"],
        treeComplete: true,
        skipped: [{ path: "src/starter/kit.ts", reason: "user_excluded" }],
      },
    });
    expect(resolvedSince(previous, next).map((item) => item.id)).toEqual(["app"]);
  });

  it("does not resolve upload findings from a missing file", () => {
    const previous = scan({
      source: { type: "zip", transient: true },
      repository: { name: "Local project", url: null, commit: "one", commitUrl: null, defaultBranch: null },
    });
    const next = scan({
      source: { type: "zip", transient: true },
      repository: { name: "Local project", url: null, commit: "two", commitUrl: null, defaultBranch: null },
      findings: [],
      scan: { ...scan().scan, treeComplete: false, checkedFiles: [], supportedFilesInTree: [] },
    });
    expect(resolvedSince(previous, next)).toEqual([]);
  });
});

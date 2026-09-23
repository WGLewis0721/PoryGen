import type { Finding, ScanErrorBody, ScanResult } from "./types";

/**
 * Client-side mirror of the ZIP/folder contract in docs/ZIP_SCAN_API.md.
 * The server remains authoritative; these checks only avoid requests it must reject.
 */
export const SCAN_LIMITS = {
  maxRequestBytes: 4_000_000,
  maxArchiveBytes: 2_900_000,
  maxEntries: 1_000,
  maxFileBytes: 100_000,
  maxFiles: 150,
  maxTotalBytes: 2_000_000,
  maxExclusions: 100,
  maxPathLength: 512,
} as const;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Dependency and build directories the engine already skips. Matched case-insensitively, like excludedPath. */
const SKIPPED_DIRECTORIES = new Set([
  "node_modules", "vendor", "vendors", "dist", "build", "coverage", ".next", ".nuxt", ".venv", "venv",
  "__pycache__", "generated", "fixtures", "snapshots",
]);

const SOURCE_EXTENSION = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py)$/i;
const MINIFIED_OR_GENERATED = /\.(min|generated)\.[^.]+$/i;

export class ScanInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScanInputError";
    this.code = code;
  }
}

export interface TermsFields {
  version: string;
  acceptedAt: string;
}

export interface ProjectFileEntry {
  path: string;
  size: number;
  read: () => Promise<Uint8Array>;
}

export interface FilesPreparation {
  request: FilesScanRequest;
  root: string | null;
  eligible: number;
  excluded: number;
  omittedDependencies: number;
  omittedUnsupported: number;
  omittedGenerated: number;
  omittedBinary: number;
  omittedTooLarge: number;
  omittedUnsafe: number;
  trimmed: number;
}

interface GitHubScanRequest {
  sourceType?: "github";
  repositoryUrl: string;
  exclusions?: string[];
  termsVersion: string;
  termsAcceptedAt: string;
}

interface ZipScanRequest {
  sourceType: "zip";
  archiveBase64: string;
  exclusions?: string[];
  termsVersion: string;
  termsAcceptedAt: string;
}

interface FilesScanRequest {
  sourceType: "files";
  files: { path: string; content: string }[];
  exclusions?: string[];
  termsVersion: string;
  termsAcceptedAt: string;
}

export type ScanRequestBody = GitHubScanRequest | ZipScanRequest | FilesScanRequest;

const isMatch = (finding: Finding) => finding.classification !== "insufficient_evidence" && finding.publicSource !== null;

export function isPrivateUpload(result: Pick<ScanResult, "source"> | null | undefined): boolean {
  const type = result?.source?.type;
  return type === "zip" || type === "files";
}

export function shouldPersistScan(result: Pick<ScanResult, "source">): boolean {
  return !isPrivateUpload(result);
}

export function publicScanStorageKey(repositoryName: string): string {
  return `porygen.scan.${repositoryName.toLowerCase()}`;
}

/** Public GitHub scans may stay in localStorage. Uploads never touch either storage. */
export function persistPublicScan(
  result: ScanResult,
  decisions: unknown,
  storage: { local: Pick<Storage, "setItem">; session: Pick<Storage, "setItem"> },
): void {
  if (!shouldPersistScan(result)) return;
  storage.local.setItem(publicScanStorageKey(result.repository.name), JSON.stringify({ scan: result, decisions }));
}

export function encodeCanonicalBase64(bytes: Uint8Array): string {
  const modern = bytes as Uint8Array & {
    toBase64?: (options?: { alphabet?: "base64" | "base64url"; omitPadding?: boolean }) => string;
  };
  if (typeof modern.toBase64 === "function") {
    return modern.toBase64({ alphabet: "base64", omitPadding: false });
  }

  const parts: string[] = [];
  const length = bytes.length;
  const extra = length % 3;
  const main = length - extra;
  for (let index = 0; index < main; index += 3) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    parts.push(
      BASE64_ALPHABET[(value >> 18) & 63],
      BASE64_ALPHABET[(value >> 12) & 63],
      BASE64_ALPHABET[(value >> 6) & 63],
      BASE64_ALPHABET[value & 63],
    );
  }
  if (extra === 1) {
    const value = bytes[main] << 16;
    parts.push(BASE64_ALPHABET[(value >> 18) & 63], BASE64_ALPHABET[(value >> 12) & 63], "==");
  } else if (extra === 2) {
    const value = (bytes[main] << 16) | (bytes[main + 1] << 8);
    parts.push(BASE64_ALPHABET[(value >> 18) & 63], BASE64_ALPHABET[(value >> 12) & 63], BASE64_ALPHABET[(value >> 6) & 63], "=");
  }
  return parts.join("");
}

function hasUnsafePathChars(value: string): boolean {
  if (value.startsWith("/") || value.includes("%") || value.includes("\\") || value.includes(":")) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function hasDisallowedControls(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x08 || (code >= 0x0e && code <= 0x1f)) return true;
  }
  return false;
}

export function normalizeExclusionPath(value: string): string {
  const trimmed = value.trim().normalize("NFC");
  if (!trimmed) throw new ScanInputError("INVALID_EXCLUSIONS", "Exclusion paths cannot be blank.");
  if (trimmed.length > SCAN_LIMITS.maxPathLength || hasUnsafePathChars(trimmed)) {
    throw new ScanInputError("UNSAFE_PATH", "Use relative project paths without traversal or encoded separators.");
  }
  if (/[*?[\]{}]/.test(trimmed)) {
    throw new ScanInputError("INVALID_EXCLUSIONS", "Exclusions are exact paths or folder prefixes, not globs.");
  }
  const path = trimmed.replace(/\/$/, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new ScanInputError("UNSAFE_PATH", "Use relative project paths without traversal or encoded separators.");
  }
  return path;
}

export function normalizeExclusions(values: readonly string[]): string[] {
  if (values.length > SCAN_LIMITS.maxExclusions) {
    throw new ScanInputError("INVALID_EXCLUSIONS", "Supply at most 100 relative exclusion paths.");
  }
  const rules = [...new Set(values.map((value) => normalizeExclusionPath(value)))].sort();
  if (rules.length > SCAN_LIMITS.maxExclusions) {
    throw new ScanInputError("INVALID_EXCLUSIONS", "Supply at most 100 relative exclusion paths.");
  }
  return rules;
}

/** Exact file or directory prefix. `src/template` does not exclude `src/template-old`. */
export function pathExcluded(path: string, rules: readonly string[]): boolean {
  const normalized = path.normalize("NFC");
  return rules.some((rule) => normalized === rule || normalized.startsWith(`${rule}/`));
}

export function exclusionLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function termsPayload(terms: TermsFields, exclusions: string[]) {
  return {
    ...(exclusions.length ? { exclusions } : {}),
    termsVersion: terms.version,
    termsAcceptedAt: terms.acceptedAt,
  };
}

export function buildGitHubScanRequest(repositoryUrl: string, exclusionInput: readonly string[], terms: TermsFields): GitHubScanRequest {
  const exclusions = normalizeExclusions(exclusionInput);
  if (!exclusions.length) {
    return { repositoryUrl, termsVersion: terms.version, termsAcceptedAt: terms.acceptedAt };
  }
  return { sourceType: "github", repositoryUrl, exclusions, termsVersion: terms.version, termsAcceptedAt: terms.acceptedAt };
}

export function projectRelativePath(file: { name: string; webkitRelativePath?: string }): string {
  const relative = file.webkitRelativePath?.trim() ? file.webkitRelativePath : file.name;
  return relative.replaceAll("\\", "/").replace(/^\/+/, "").normalize("NFC");
}

export function selectionRoot(paths: readonly string[]): string | null {
  const roots = new Set(paths.filter((path) => path.includes("/")).map((path) => path.split("/")[0]));
  if (roots.size !== 1) return null;
  return [...roots][0] ?? null;
}

function pathIsUnsafe(path: string): boolean {
  if (!path || path.length > SCAN_LIMITS.maxPathLength || hasUnsafePathChars(path)) return true;
  return path.split("/").some((part) => !part || part === "." || part === "..");
}

function isSkippedDirectory(path: string): boolean {
  return path.split("/").some((part) => SKIPPED_DIRECTORIES.has(part.toLowerCase()) || part === ".git" || part === ".svn" || part === ".hg");
}

export function isSupportedSourcePath(path: string): boolean {
  return SOURCE_EXTENSION.test(path);
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function decodeUtf8Source(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (hasDisallowedControls(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export async function prepareFilesSource(
  entries: readonly ProjectFileEntry[],
  exclusionInput: readonly string[],
  terms: TermsFields,
): Promise<FilesPreparation> {
  const exclusions = normalizeExclusions(exclusionInput);
  const summary: FilesPreparation = {
    request: { sourceType: "files", files: [], ...termsPayload(terms, exclusions) },
    root: null,
    eligible: 0,
    excluded: 0,
    omittedDependencies: 0,
    omittedUnsupported: 0,
    omittedGenerated: 0,
    omittedBinary: 0,
    omittedTooLarge: 0,
    omittedUnsafe: 0,
    trimmed: 0,
  };

  const considered: string[] = [];
  const candidates: ProjectFileEntry[] = [];
  for (const entry of entries) {
    const path = entry.path.replaceAll("\\", "/").normalize("NFC");
    if (pathIsUnsafe(path)) {
      summary.omittedUnsafe += 1;
      continue;
    }
    if (isSkippedDirectory(path)) {
      summary.omittedDependencies += 1;
      continue;
    }
    if (!isSupportedSourcePath(path)) {
      summary.omittedUnsupported += 1;
      continue;
    }
    if (MINIFIED_OR_GENERATED.test(path)) {
      summary.omittedGenerated += 1;
      continue;
    }
    if (entry.size > SCAN_LIMITS.maxFileBytes) {
      summary.omittedTooLarge += 1;
      continue;
    }
    summary.eligible += 1;
    considered.push(path);
    if (pathExcluded(path, exclusions)) {
      summary.excluded += 1;
      continue;
    }
    candidates.push({ ...entry, path });
  }

  candidates.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  summary.root = selectionRoot(considered);

  const chosen: { path: string; content: string }[] = [];
  let sourceBytes = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entry = candidates[index];
    if (chosen.length >= SCAN_LIMITS.maxFiles || chosen.length >= SCAN_LIMITS.maxEntries) {
      summary.trimmed += candidates.length - index;
      break;
    }
    const bytes = await entry.read();
    if (bytes.byteLength > SCAN_LIMITS.maxFileBytes) {
      summary.eligible -= 1;
      summary.omittedTooLarge += 1;
      continue;
    }
    const content = decodeUtf8Source(bytes);
    if (content == null) {
      summary.eligible -= 1;
      summary.omittedBinary += 1;
      continue;
    }
    if (sourceBytes + bytes.byteLength > SCAN_LIMITS.maxTotalBytes) {
      summary.trimmed += candidates.length - index;
      break;
    }
    const nextFiles = [...chosen, { path: entry.path, content }];
    const request = { sourceType: "files" as const, files: nextFiles, ...termsPayload(terms, exclusions) };
    if (jsonBytes(request) > SCAN_LIMITS.maxRequestBytes) {
      summary.trimmed += candidates.length - index;
      break;
    }
    chosen.push({ path: entry.path, content });
    sourceBytes += bytes.byteLength;
  }

  summary.request = { sourceType: "files", files: chosen, ...termsPayload(terms, exclusions) };
  if (jsonBytes(summary.request) > SCAN_LIMITS.maxRequestBytes) {
    throw new ScanInputError("UPLOAD_TOO_LARGE", "Request exceeds 4 MB.");
  }
  return summary;
}

export function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06));
}

export function buildZipScanRequest(archive: Uint8Array, exclusionInput: readonly string[], terms: TermsFields): ZipScanRequest {
  const exclusions = normalizeExclusions(exclusionInput);
  if (archive.byteLength === 0 || !isZipArchive(archive)) {
    throw new ScanInputError("INVALID_ARCHIVE", "The upload is not a supported ZIP archive.");
  }
  if (archive.byteLength > SCAN_LIMITS.maxArchiveBytes) {
    throw new ScanInputError("UPLOAD_TOO_LARGE", "The ZIP exceeds the upload size limit.");
  }
  const archiveBase64 = encodeCanonicalBase64(archive);
  if (archiveBase64.startsWith("data:") || archiveBase64.length % 4 !== 0) {
    throw new ScanInputError("INVALID_ARCHIVE", "Supply canonical base64 without a data URL prefix.");
  }
  const request: ZipScanRequest = { sourceType: "zip", archiveBase64, ...termsPayload(terms, exclusions) };
  if (jsonBytes(request) > SCAN_LIMITS.maxRequestBytes) {
    throw new ScanInputError("UPLOAD_TOO_LARGE", "Request exceeds 4 MB.");
  }
  return request;
}

export function formatScanFailure(body: ScanErrorBody | null | undefined, fallback = "The scanner is unavailable right now. Try again shortly."): string {
  const message = typeof body?.error === "string" && body.error.trim() ? body.error.trim() : fallback;
  const code = typeof body?.code === "string" && /^[A-Z0-9_]+$/.test(body.code) ? body.code : "";
  const withCode = code ? `${message} (${code})` : message;
  if (body?.retryable === true && !/try again/i.test(withCode)) return `${withCode} You can try again.`;
  return withCode;
}

export function scanInputFailure(error: ScanInputError): string {
  return formatScanFailure({ error: error.message, code: error.code, retryable: false });
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function whyItMatched(finding: Finding): string {
  if (!finding.metrics) return finding.explanation;
  const metrics = finding.metrics;
  return `${finding.explanation} ${percent(metrics.customerCoverage)} of the flagged snippet and ${percent(metrics.sourceCoverage)} of the possible source file match, with a longest identical run of ${metrics.contiguousTokens} tokens.`;
}

export function findingContext(): string {
  return "This is evidence that the code resembles an indexed public source. It does not decide who wrote it, whether it was copied, or whether a license permits the way you use it. Handwritten, copied, and model-assisted code can all match.";
}

export function findingNextAction(finding: Finding): string {
  if (finding.classification === "strong_match") {
    return "Compare the matched lines with the possible source, then keep the code, replace it, or dismiss the match.";
  }
  return "If the overlap is only a common pattern, dismiss it. If it looks specific, open the possible source before you ship.";
}

export function uploadHasNoEligibleFiles(result: ScanResult): boolean {
  return result.scan.fetchedFiles === 0 || (isPrivateUpload(result) && result.scan.ingestion?.empty === true);
}

export function scanHeadline(result: ScanResult, strongCount: number, openCount: number): string {
  if (uploadHasNoEligibleFiles(result)) return "No eligible source files were scanned";
  const checked = `${result.scan.fetchedFiles} ${result.scan.fetchedFiles === 1 ? "file" : "files"} checked. `;
  const prefix = result.scan.partial ? "Partial scan: " : "";
  if (strongCount === 0) {
    return result.scan.partial
      ? `${prefix}${checked}No strong source match in the files checked.`
      : `${checked}No strong source match.`;
  }
  if (openCount === 0) {
    return `${prefix}${checked}${strongCount} strong source ${strongCount === 1 ? "match" : "matches"}, all dismissed.`;
  }
  return `${prefix}${checked}${strongCount} strong source ${strongCount === 1 ? "match" : "matches"} to review.`;
}

/**
 * A finding is resolved only when a later scan of the same repository actually
 * rechecked the file, or a complete GitHub tree confirms the file is gone.
 * Excluding the file is not a resolution.
 */
export function resolvedSince(previous: ScanResult | null, next: ScanResult | null): Finding[] {
  if (!previous || !next) return [];
  if (isPrivateUpload(previous) || isPrivateUpload(next)) return [];
  if (!previous.repository.name || previous.repository.name !== next.repository.name) return [];
  if (!previous.repository.commit || previous.repository.commit === next.repository.commit) return [];

  const rules = next.scan.exclusions ?? [];
  const nextIds = new Set(next.findings.filter(isMatch).map((finding) => finding.id));
  const checked = new Set(next.scan.checkedFiles);
  const inTree = new Set(next.scan.supportedFilesInTree);
  const excludedPaths = new Set(
    (next.scan.skipped ?? []).filter((entry) => entry.reason === "user_excluded").map((entry) => entry.path),
  );

  return previous.findings.filter(isMatch).filter((finding) => {
    if (nextIds.has(finding.id)) return false;
    const path = finding.customer.path;
    if (pathExcluded(path, rules) || excludedPaths.has(path)) return false;
    const rechecked = checked.has(path);
    const confirmedDeleted = next.scan.treeComplete === true && !inTree.has(path);
    return rechecked || confirmedDeleted;
  });
}

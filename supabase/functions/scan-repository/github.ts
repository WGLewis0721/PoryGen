// Safe GitHub ingestion boundary. Every network call in this file targets a
// hardcoded, trusted host (api.github.com or raw.githubusercontent.com) —
// never a URL built from unsanitized user input — which is the actual SSRF
// defense: the allowlist is enforced by construction, not by validating an
// attacker-supplied URL after the fact.

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
}

export class IngestError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const OWNER_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Accepts only `https://github.com/<owner>/<repo>` (optionally `.git`-suffixed
 * or with a trailing slash) or a bare `owner/repo` shorthand. Anything else —
 * a different host, a different scheme, an `@` userinfo trick, a path with
 * extra segments — is rejected before any network call is made.
 */
export function parseGitHubUrl(input: string): ParsedGitHubRepo {
  const trimmed = input.trim();

  let owner: string | undefined;
  let repo: string | undefined;

  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    [owner, repo] = trimmed.split("/");
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new IngestError("INVALID_URL", "That doesn't look like a URL or owner/repo shorthand.");
    }
    if (url.protocol !== "https:") {
      throw new IngestError("INVALID_PROTOCOL", "Only https:// GitHub URLs are accepted.");
    }
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new IngestError("INVALID_HOST", "Only github.com repository URLs are accepted.");
    }
    if (url.username || url.password) {
      throw new IngestError("INVALID_URL", "Credentials in the URL are not accepted.");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      throw new IngestError("INVALID_URL", "Expected https://github.com/<owner>/<repo>.");
    }
    [owner, repo] = segments;
    repo = repo.replace(/\.git$/, "");
  }

  if (!owner || !repo || !OWNER_REPO_PATTERN.test(owner) || !OWNER_REPO_PATTERN.test(repo)) {
    throw new IngestError("INVALID_URL", "Owner and repository names contain invalid characters.");
  }

  return { owner, repo };
}

export interface RepoMetadata {
  fullName: string;
  defaultBranch: string;
  visibility: "public" | "private";
  htmlUrl: string;
}

export interface RepoFile {
  path: string;
  content: string;
  bytes: number;
}

export interface IngestLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_INGEST_LIMITS: IngestLimits = {
  maxFiles: 40,
  maxFileBytes: 200_000,
  maxTotalBytes: 2_000_000,
};

const IGNORED_DIR_SEGMENTS = new Set([
  "node_modules", "dist", "build", "vendor", ".git", ".next", "target",
  "out", "coverage", ".venv", "venv", "__pycache__", ".cache",
]);

const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rs", ".rb",
  ".java", ".c", ".h", ".cpp", ".cc", ".cs", ".php", ".json", ".md", ".txt",
  ".toml", ".yaml", ".yml", ".lock", "",
]);

function githubHeaders(): HeadersInit {
  const token = Deno.env.get("GITHUB_TOKEN");
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "PoryGen-scan-repository",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchRepoMetadata(parsed: ParsedGitHubRepo): Promise<RepoMetadata> {
  const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
    headers: githubHeaders(),
  });
  if (res.status === 404) throw new IngestError("REPO_NOT_FOUND", "Repository not found or is private.");
  if (res.status === 403) throw new IngestError("RATE_LIMITED", "GitHub API rate limit reached — try again shortly or configure GITHUB_TOKEN.");
  if (!res.ok) throw new IngestError("GITHUB_ERROR", `GitHub API returned ${res.status}.`);
  const data = await res.json();
  if (data.private) throw new IngestError("PRIVATE_REPO", "PoryGen's public ingestion flow only scans public repositories.");
  return {
    fullName: data.full_name,
    defaultBranch: data.default_branch,
    visibility: data.private ? "private" : "public",
    htmlUrl: data.html_url,
  };
}

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

async function fetchTree(parsed: ParsedGitHubRepo, branch: string): Promise<{ entries: TreeEntry[]; complete: boolean }> {
  const res = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: githubHeaders() },
  );
  if (!res.ok) throw new IngestError("GITHUB_ERROR", `Could not list repository tree (${res.status}).`);
  const data = await res.json();
  // GitHub truncates very large trees. The ingest limits below cap what we'd
  // process anyway, but a truncated listing can't prove a file was deleted.
  return { entries: (data.tree ?? []) as TreeEntry[], complete: !data.truncated };
}

function isIgnored(path: string): boolean {
  return path.split("/").some((segment) => IGNORED_DIR_SEGMENTS.has(segment));
}

function extensionOf(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx).toLowerCase();
}

export interface RepoSnapshot {
  files: RepoFile[];
  /** Every blob path in the default branch — used to tell "deleted" apart from "not sampled". */
  allPaths: Set<string>;
  /** False when GitHub truncated the tree listing; absence from allPaths then proves nothing. */
  treeComplete: boolean;
}

export async function fetchRepoSnapshot(
  parsed: ParsedGitHubRepo,
  branch: string,
  limits: IngestLimits = DEFAULT_INGEST_LIMITS,
): Promise<RepoSnapshot> {
  const { entries: tree, complete } = await fetchTree(parsed, branch);
  const allPaths = new Set(tree.filter((e) => e.type === "blob").map((e) => e.path));
  const files = await fetchFilesFromTree(parsed, branch, tree, limits);
  return { files, allPaths, treeComplete: complete };
}

export async function fetchRepoFiles(
  parsed: ParsedGitHubRepo,
  branch: string,
  limits: IngestLimits = DEFAULT_INGEST_LIMITS,
): Promise<RepoFile[]> {
  return (await fetchRepoSnapshot(parsed, branch, limits)).files;
}

async function fetchFilesFromTree(
  parsed: ParsedGitHubRepo,
  branch: string,
  tree: TreeEntry[],
  limits: IngestLimits,
): Promise<RepoFile[]> {
  const candidates = tree
    .filter((e) => e.type === "blob")
    .filter((e) => !isIgnored(e.path))
    .filter((e) => TEXT_EXTENSIONS.has(extensionOf(e.path)))
    .filter((e) => (e.size ?? 0) <= limits.maxFileBytes)
    .slice(0, limits.maxFiles * 3); // sample generously, then cap after fetch

  const files: RepoFile[] = [];
  let totalBytes = 0;

  for (const entry of candidates) {
    if (files.length >= limits.maxFiles || totalBytes >= limits.maxTotalBytes) break;
    const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(branch)}/${entry.path}`;
    // eslint-disable-next-line no-await-in-loop -- sequential to respect rate limits deterministically
    const res = await fetch(rawUrl, { headers: { "User-Agent": "PoryGen-scan-repository" } });
    if (!res.ok) continue;
    const content = await res.text();
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > limits.maxFileBytes) continue;
    if (totalBytes + bytes > limits.maxTotalBytes) continue;
    files.push({ path: entry.path, content, bytes });
    totalBytes += bytes;
  }

  return files;
}

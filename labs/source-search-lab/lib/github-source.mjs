import { detectLanguage } from "./search.mjs";

export const GITHUB_LIMITS = Object.freeze({
  maxFiles: 150,
  maxFileBytes: 100_000,
  maxTotalBytes: 2_000_000,
  concurrency: 8,
  maxScanMs: 15_000,
  maxSkippedDetails: 40,
});

const EXCLUDED_PATH_PARTS = new Set([
  "node_modules","vendor","vendors","dist","build","coverage",".next",".nuxt",".venv","venv",
  "__pycache__","generated","fixtures","snapshots",
]);

export function parseGitHubRepositoryUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error("Enter a valid public GitHub repository URL.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only https://github.com public repository URLs are supported.");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Repository URL must look like https://github.com/owner/repo.");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("Unsupported GitHub owner or repository name.");
  }
  return { owner, repo, fullName: `${owner}/${repo}` };
}

function headers() {
  const result = {
    Accept: "application/vnd.github+json",
    "User-Agent": "porygen-source-search-lab-v2",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

async function githubRaw(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": headers()["User-Agent"] },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function githubJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: headers(), signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const rateLimited = (response.status === 403 || response.status === 429) &&
        response.headers?.get?.("x-ratelimit-remaining") === "0";
      const hint = response.status === 404
        ? "Repository or file was not found, or it is not public."
        : rateLimited
          ? "GitHub's rate limit for this server has been reached. Try again in a few minutes."
          : `GitHub returned HTTP ${response.status}.`;
      throw new Error(hint);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const AUXILIARY_PATH = /(^|\/)(tests?|__tests__|spec|specs|e2e|bench(mark)?s?|examples?|demos?|docs?|scripts?|tools?|\.github)(\/|$)|\.(test|spec|bench)\.[a-z]+$|(^|\/)(test_[^/]*|[^/]*_test)\.py$|(^|\/)(tests?|bench(mark)?s?|examples?)\.[a-z]+$|\.config\.[a-z]+$|(^|\/)(setup|conftest)\.py$/i;

// Auxiliary code (tests, benchmarks, examples, tooling) rarely carries the risk
// a scan is for, and generic test scaffolding is the main source of weak matches.
export function isAuxiliaryPath(path) {
  return AUXILIARY_PATH.test(path);
}

// Spend the file budget on product source first: non-auxiliary, shallow, then
// conventional source roots.
function pathPriority(path) {
  const depth = path.split("/").length;
  const sourceRoot = /^(src|lib|packages|app|pkg)\//i.test(path) ? -1 : 0;
  return (isAuxiliaryPath(path) ? 100 : 0) + sourceRoot + depth;
}

function supportedPath(path) {
  return detectLanguage(path) !== "unknown";
}

function excludedPath(path) {
  return path.split("/").some((part) => EXCLUDED_PATH_PARTS.has(part.toLowerCase()));
}

function pushSkipped(skipped, entry, limits) {
  if (skipped.length < limits.maxSkippedDetails) skipped.push(entry);
}

function addIncomplete(incompleteReasons, reason, amount = 1) {
  incompleteReasons[reason] = (incompleteReasons[reason] ?? 0) + amount;
}

export async function fetchPublicGitHubRepository(repoUrl, {
  fetchImpl = fetch,
  limits = GITHUB_LIMITS,
} = {}) {
  const started = Date.now();
  const deadline = started + limits.maxScanMs;
  const { owner, repo, fullName } = parseGitHubRepositoryUrl(repoUrl);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const remaining = () => Math.max(500, deadline - Date.now());
  const metadata = await githubJson(base, fetchImpl, remaining());
  if (metadata.private) throw new Error("Only public GitHub repositories can be scanned.");

  const commitInfo = await githubJson(
    `${base}/commits/${encodeURIComponent(metadata.default_branch)}`,
    fetchImpl,
    remaining(),
  );
  const commit = commitInfo.sha;
  const treeSha = commitInfo.commit?.tree?.sha;
  if (!commit || !treeSha) throw new Error("Could not resolve the repository commit.");

  const tree = await githubJson(`${base}/git/trees/${treeSha}?recursive=1`, fetchImpl, remaining());
  const skipped = [];
  const candidates = [];
  const supportedFilesInTree = [];
  const incompleteReasons = {};

  for (const entry of tree.tree ?? []) {
    if (entry.type !== "blob") continue;
    if (!supportedPath(entry.path)) {
      pushSkipped(skipped, { path: entry.path, reason: "unsupported_type" }, limits);
      continue;
    }

    supportedFilesInTree.push(entry.path);

    if (excludedPath(entry.path)) {
      pushSkipped(skipped, { path: entry.path, reason: "excluded_directory" }, limits);
      continue;
    }
    if ((entry.size ?? 0) > limits.maxFileBytes) {
      addIncomplete(incompleteReasons, "file_too_large");
      pushSkipped(skipped, { path: entry.path, reason: "file_too_large", bytes: entry.size }, limits);
      continue;
    }
    candidates.push(entry);
  }

  candidates.sort((x, y) => pathPriority(x.path) - pathPriority(y.path) || x.path.localeCompare(y.path));

  const selected = [];
  let plannedBytes = 0;
  let stoppedForLimit = false;
  for (let index = 0; index < candidates.length; index++) {
    const entry = candidates[index];
    const remainingCandidates = candidates.length - index;
    if (selected.length >= limits.maxFiles) {
      stoppedForLimit = true;
      addIncomplete(incompleteReasons, "file_limit", remainingCandidates);
      pushSkipped(skipped, { path: entry.path, reason: "file_limit" }, limits);
      break;
    }
    if (plannedBytes + (entry.size ?? 0) > limits.maxTotalBytes) {
      stoppedForLimit = true;
      addIncomplete(incompleteReasons, "total_byte_limit", remainingCandidates);
      pushSkipped(skipped, { path: entry.path, reason: "total_byte_limit", bytes: entry.size }, limits);
      break;
    }
    plannedBytes += entry.size ?? 0;
    selected.push(entry);
  }

  const fetchedByIndex = new Array(selected.length);
  let next = 0;
  async function worker() {
    while (next < selected.length) {
      const index = next++;
      const entry = selected[index];
      if (Date.now() >= deadline) {
        stoppedForLimit = true;
        addIncomplete(incompleteReasons, "time_limit");
        pushSkipped(skipped, { path: entry.path, reason: "time_limit" }, limits);
        continue;
      }
      try {
        // Raw content is served outside the REST API quota, so a scan costs three API calls.
        const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commit}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
        const source = await githubRaw(rawUrl, fetchImpl, remaining());
        const bytes = Buffer.byteLength(source, "utf8");
        if (bytes > limits.maxFileBytes) {
          addIncomplete(incompleteReasons, "decoded_file_too_large");
          pushSkipped(skipped, { path: entry.path, reason: "decoded_file_too_large", bytes }, limits);
          continue;
        }
        fetchedByIndex[index] = { path: entry.path, language: detectLanguage(entry.path), bytes, source };
      } catch (error) {
        addIncomplete(incompleteReasons, "provider_failure");
        pushSkipped(skipped, {
          path: entry.path,
          reason: "provider_failure",
          message: error instanceof Error ? error.message : String(error),
        }, limits);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limits.concurrency ?? 1) }, worker));

  const files = fetchedByIndex.filter(Boolean);
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  const incompleteSupportedFiles = Object.values(incompleteReasons)
    .reduce((sum, value) => sum + value, 0);
  const treeComplete = tree.truncated !== true;

  return {
    repository: fullName,
    repositoryUrl: `https://github.com/${fullName}`,
    commit,
    commitUrl: `https://github.com/${fullName}/commit/${commit}`,
    defaultBranch: metadata.default_branch,
    files,
    stats: {
      fetchedFiles: files.length,
      fetchedBytes: totalBytes,
      checkedFiles: files.map((file) => file.path),
      supportedFilesInTree,
      treeComplete,
      treeTruncated: !treeComplete,
      stoppedForLimit,
      incompleteSupportedFiles,
      incompleteReasons,
      skippedCount: Math.max(0, (tree.tree ?? []).filter((entry) => entry.type === "blob").length - files.length),
      elapsedMs: Date.now() - started,
    },
    skipped,
    partial: !treeComplete || incompleteSupportedFiles > 0,
  };
}

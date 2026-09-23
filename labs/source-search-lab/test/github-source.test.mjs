import test from "node:test";
import assert from "node:assert/strict";
import {
  GITHUB_NO_REVISION_REASON,
  GITHUB_REVISION_KIND,
  classifyGitHubCommitResolution,
  fetchPublicGitHubRepository,
  parseGitHubRepositoryUrl,
} from "../lib/github-source.mjs";

function response(data, status = 200, headers = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return normalized.get(String(name).toLowerCase()) ?? null; } },
    async json() { return data; },
    async text() { return data; },
  };
}

test("repository URL parser only accepts https GitHub repositories", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/example/project"), {
    owner: "example",
    repo: "project",
    fullName: "example/project",
  });
  assert.throws(() => parseGitHubRepositoryUrl("https://evil.example/example/project"), /Only https:\/\/github\.com/);
});

test("repository fetch resolves a commit and fetches supported blobs without executing anything", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/repos/example/project")) {
      return response({ private: false, default_branch: "main" });
    }
    if (String(url).endsWith("/commits/main")) {
      return response({ sha: "abc123", commit: { tree: { sha: "tree123" } } });
    }
    if (String(url).includes("/git/trees/tree123")) {
      return response({
        truncated: false,
        tree: [
          { type: "blob", path: "src/a.js", sha: "blob-a", size: 80 },
          { type: "blob", path: "README.md", sha: "blob-readme", size: 50 },
          { type: "blob", path: "dist/generated.js", sha: "blob-dist", size: 50 }
        ],
      });
    }
    if (String(url) === "https://raw.githubusercontent.com/example/project/abc123/src/a.js") {
      return response("export function hello() { return 1; }");
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const fetched = await fetchPublicGitHubRepository("https://github.com/example/project", { fetchImpl });
  assert.equal(fetched.repositoryState, "revision_resolved");
  assert.deepEqual(fetched.revision, {
    kind: GITHUB_REVISION_KIND.GIT_COMMIT,
    sha: "abc123",
    treeSha: "tree123",
    url: "https://github.com/example/project/commit/abc123",
  });
  assert.equal(fetched.commit, "abc123");
  assert.equal(fetched.files.length, 1);
  assert.equal(fetched.files[0].path, "src/a.js");
  assert.equal(fetched.files[0].language, "javascript");
  assert.equal(calls.some((url) => url.includes("README.md")), false);
  assert.equal(calls.some((url) => url.includes("dist/")), false);
});

test("file limits make the scan partial instead of silently ignoring the limit", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/repos/example/project")) return response({ private: false, default_branch: "main" });
    if (String(url).endsWith("/commits/main")) return response({ sha: "abc123", commit: { tree: { sha: "tree123" } } });
    if (String(url).includes("/git/trees/tree123")) {
      return response({
        truncated: false,
        tree: [
          { type: "blob", path: "a.js", sha: "a", size: 20 },
          { type: "blob", path: "b.js", sha: "b", size: 20 },
        ],
      });
    }
    const name = String(url).endsWith("/a.js") ? "a" : "b";
    return response(`const ${name} = 1;`);
  };

  const fetched = await fetchPublicGitHubRepository("https://github.com/example/project", {
    fetchImpl,
    limits: {
      maxFiles: 1,
      maxFileBytes: 1000,
      maxTotalBytes: 1000,
      maxScanMs: 5000,
      maxSkippedDetails: 10,
    },
  });

  assert.equal(fetched.files.length, 1);
  assert.equal(fetched.partial, true);
  assert.equal(fetched.stats.stoppedForLimit, true);
  assert.ok(fetched.skipped.some((item) => item.reason === "file_limit"));
});


test("oversized-only repository is incomplete even though no supported file is fetched", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/repos/example/project")) return response({ private: false, default_branch: "main" });
    if (String(url).endsWith("/commits/main")) return response({ sha: "abc123", commit: { tree: { sha: "tree123" } } });
    if (String(url).includes("/git/trees/tree123")) {
      return response({
        truncated: false,
        tree: [{ type: "blob", path: "src/huge.py", sha: "huge", size: 2000 }],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const fetched = await fetchPublicGitHubRepository("https://github.com/example/project", {
    fetchImpl,
    limits: {
      maxFiles: 10,
      maxFileBytes: 1000,
      maxTotalBytes: 10_000,
      maxScanMs: 5000,
      maxSkippedDetails: 10,
    },
  });

  assert.equal(fetched.files.length, 0);
  assert.equal(fetched.partial, true);
  assert.equal(fetched.stats.treeComplete, true);
  assert.deepEqual(fetched.stats.supportedFilesInTree, ["src/huge.py"]);
  assert.equal(fetched.stats.incompleteSupportedFiles, 1);
  assert.equal(fetched.stats.incompleteReasons.file_too_large, 1);
});

test("provider failure remains incomplete after skipped-detail list is full", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/repos/example/project")) return response({ private: false, default_branch: "main" });
    if (String(url).endsWith("/commits/main")) return response({ sha: "abc123", commit: { tree: { sha: "tree123" } } });
    if (String(url).includes("/git/trees/tree123")) {
      return response({
        truncated: false,
        tree: [
          { type: "blob", path: "README.md", sha: "readme", size: 10 },
          { type: "blob", path: "src/fails.js", sha: "fails", size: 50 },
        ],
      });
    }
    if (String(url).endsWith("/src/fails.js")) return response("", 503);
    throw new Error(`Unexpected URL: ${url}`);
  };

  const fetched = await fetchPublicGitHubRepository("https://github.com/example/project", {
    fetchImpl,
    limits: {
      maxFiles: 10,
      maxFileBytes: 1000,
      maxTotalBytes: 10_000,
      maxScanMs: 5000,
      maxSkippedDetails: 1,
    },
  });

  assert.equal(fetched.skipped.length, 1);
  assert.equal(fetched.skipped[0].reason, "unsupported_type");
  assert.equal(fetched.skipped.some((item) => item.reason === "provider_failure"), false);
  assert.equal(fetched.partial, true);
  assert.equal(fetched.stats.incompleteSupportedFiles, 1);
  assert.equal(fetched.stats.incompleteReasons.provider_failure, 1);
  assert.deepEqual(fetched.stats.checkedFiles, []);
  assert.deepEqual(fetched.stats.supportedFilesInTree, ["src/fails.js"]);
});

test("GitHub commit-resolution classification only recognizes the documented empty-repository conflict", () => {
  assert.deepEqual(classifyGitHubCommitResolution(409, { message: "Git Repository is empty." }), {
    kind: GITHUB_REVISION_KIND.NONE,
    reason: GITHUB_NO_REVISION_REASON.EMPTY_REPOSITORY,
  });
  assert.equal(classifyGitHubCommitResolution(409, { message: "Another conflict" }), null);
  assert.equal(classifyGitHubCommitResolution(409, null), null);
  assert.equal(classifyGitHubCommitResolution(404, { message: "Git Repository is empty." }), null);
});

test("a repository with no commits returns an explicit known-empty revision state", async () => {
  const fetched = await fetchPublicGitHubRepository("https://github.com/example/empty", {
    exclusions: ["starter"],
    fetchImpl: async (url) => String(url).endsWith("/commits/main")
      ? response({ message: "Git Repository is empty." }, 409)
      : response({ private: false, default_branch: "main" }),
  });
  assert.equal(fetched.repositoryState, GITHUB_NO_REVISION_REASON.EMPTY_REPOSITORY);
  assert.deepEqual(fetched.revision, {
    kind: GITHUB_REVISION_KIND.NONE,
    reason: GITHUB_NO_REVISION_REASON.EMPTY_REPOSITORY,
  });
  assert.equal(fetched.commit, "");
  assert.equal(fetched.commitUrl, null);
  assert.deepEqual(fetched.files, []);
  assert.equal(fetched.stats.fetchedFiles, 0);
  assert.equal(fetched.stats.treeComplete, true);
  assert.equal(fetched.stats.incompleteSupportedFiles, 0);
  assert.deepEqual(fetched.stats.incompleteReasons, {});
  assert.deepEqual(fetched.stats.exclusions, ["starter"]);
  assert.equal(fetched.partial, false);
});

test("an unrelated GitHub conflict remains unknown and is not promoted to known-empty", async () => {
  await assert.rejects(fetchPublicGitHubRepository("https://github.com/example/conflict", {
    fetchImpl: async (url) => String(url).endsWith("/commits/main")
      ? response({ message: "Another conflict" }, 409)
      : response({ private: false, default_branch: "main" }),
  }), /GitHub returned HTTP 409/);
});

test("a malformed successful commit response is not converted into an empty repository", async () => {
  await assert.rejects(fetchPublicGitHubRepository("https://github.com/example/malformed", {
    fetchImpl: async (url) => String(url).endsWith("/commits/main")
      ? response({ sha: "abc123" })
      : response({ private: false, default_branch: "main" }),
  }), /Could not resolve the repository commit/);
});

test("not-found and rate-limited commit resolution remain provider failures", async () => {
  await assert.rejects(fetchPublicGitHubRepository("https://github.com/example/missing", {
    fetchImpl: async (url) => String(url).endsWith("/commits/main")
      ? response({ message: "Not Found" }, 404)
      : response({ private: false, default_branch: "main" }),
  }), /not found|not public/i);

  await assert.rejects(fetchPublicGitHubRepository("https://github.com/example/limited", {
    fetchImpl: async (url) => String(url).endsWith("/commits/main")
      ? response({ message: "rate limit" }, 403, { "x-ratelimit-remaining": "0" })
      : response({ private: false, default_branch: "main" }),
  }), /rate limit/i);
});

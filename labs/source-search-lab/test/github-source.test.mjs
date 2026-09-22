import test from "node:test";
import assert from "node:assert/strict";
import { fetchPublicGitHubRepository, parseGitHubRepositoryUrl } from "../lib/github-source.mjs";

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
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
    if (String(url).endsWith("/git/blobs/blob-a")) {
      return response({
        encoding: "base64",
        content: Buffer.from("export function hello() { return 1; }").toString("base64"),
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const fetched = await fetchPublicGitHubRepository("https://github.com/example/project", { fetchImpl });
  assert.equal(fetched.commit, "abc123");
  assert.equal(fetched.files.length, 1);
  assert.equal(fetched.files[0].path, "src/a.js");
  assert.equal(fetched.files[0].language, "javascript");
  assert.equal(calls.some((url) => url.includes("blob-readme")), false);
  assert.equal(calls.some((url) => url.includes("blob-dist")), false);
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
    const name = String(url).endsWith("/a") ? "a" : "b";
    return response({ encoding: "base64", content: Buffer.from(`const ${name} = 1;`).toString("base64") });
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
    if (String(url).endsWith("/git/blobs/fails")) return response({}, 503);
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

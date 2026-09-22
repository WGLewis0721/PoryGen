import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublicGitHubRepository } from "../lib/github-source.mjs";
import { scanSourceFiles } from "../lib/search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("public fixture repository scans end to end against the prebuilt reference index", {
  skip: process.env.RUN_PUBLIC_E2E !== "1",
  timeout: 30_000,
}, async () => {
  const index = JSON.parse(await readFile(path.join(__dirname, "..", "data", "reference-index.json"), "utf8"));
  const fetched = await fetchPublicGitHubRepository("https://github.com/sindresorhus/yocto-queue");
  const compared = scanSourceFiles(fetched.files, index, index.settings);

  assert.ok(fetched.commit);
  assert.ok(fetched.files.some((file) => file.path === "index.js"));
  assert.ok(compared.findings.some((finding) =>
    finding.publicSource?.repository === "sindresorhus/yocto-queue" &&
    finding.publicSource?.path === "index.js" &&
    finding.classification === "strong_match"
  ));
});

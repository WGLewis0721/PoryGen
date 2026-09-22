import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReferenceIndex } from "../lib/search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "config", "reference-sources.json");
const outputPath = path.join(root, "data", "reference-index.json");

function githubHeaders() {
  const result = {
    Accept: "application/vnd.github+json",
    "User-Agent": "porygen-source-search-index-builder",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

async function fetchBlob(source) {
  const [owner, repo] = source.repository.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${source.blobSha}`;
  const response = await fetch(url, { headers: githubHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`${source.id}: GitHub returned HTTP ${response.status}`);
  const blob = await response.json();
  if (blob.sha !== source.blobSha) throw new Error(`${source.id}: blob SHA mismatch`);
  if (blob.encoding !== "base64") throw new Error(`${source.id}: unsupported blob encoding`);
  return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const documents = [];

for (const source of config.sources) {
  const code = await fetchBlob(source);
  documents.push({
    ...source,
    source: code,
    sourceUrl: `https://github.com/${source.repository}/blob/${source.commit}/${source.path}`,
  });
}

const index = buildReferenceIndex(documents);
index.referenceConfigVersion = config.version;
index.builtAt = new Date().toISOString();

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(index, null, 2) + "\n", "utf8");

console.log(`Built ${outputPath}`);
console.log(index.coverage.claim);

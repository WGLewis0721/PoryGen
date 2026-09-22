import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublicGitHubRepository } from "./lib/github-source.mjs";
import { scanRepository } from "./lib/scan-service.mjs";
import { referenceIndexFromPack } from "./lib/corpus-pack.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const indexPath = path.join(__dirname, "data", "reference-index.json");
const port = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 32 * 1024;

async function loadReferenceIndex() {
  try {
    const legacy = JSON.parse(await readFile(indexPath, "utf8"));
    const pack = await readFile(path.join(__dirname, "data", "corpus-pack.json"), "utf8").then(JSON.parse, () => null);
    return pack ? referenceIndexFromPack(pack, legacy) : legacy;
  } catch (error) {
    throw new Error(`Reference index is missing or invalid. Run "npm run build:index". ${error instanceof Error ? error.message : ""}`);
  }
}

function privacyHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...privacyHeaders(),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleScan(req, res, { referenceIndex, repositoryFetcher }) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request." });
  }

  const repositoryUrl = typeof body.repositoryUrl === "string" ? body.repositoryUrl.trim() : "";
  const { status, payload } = await scanRepository(repositoryUrl, { referenceIndex, repositoryFetcher });
  return sendJson(res, status, payload);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, privacyHeaders());
    return res.end("Forbidden");
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      ...privacyHeaders(),
      "Content-Type": contentType(filePath),
    });
    res.end(content);
  } catch {
    res.writeHead(404, privacyHeaders());
    res.end("Not found");
  }
}

export function createSearchServer({
  referenceIndex,
  repositoryFetcher = fetchPublicGitHubRepository,
} = {}) {
  if (!referenceIndex) throw new Error("createSearchServer requires a prebuilt reference index.");

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/scan" && req.method === "POST") {
      return handleScan(req, res, { referenceIndex, repositoryFetcher });
    }

    if (url.pathname === "/api/scan") {
      res.writeHead(405, { ...privacyHeaders(), Allow: "POST" });
      return res.end("Method not allowed");
    }

    if (req.method !== "GET") {
      res.writeHead(405, privacyHeaders());
      return res.end("Method not allowed");
    }

    return serveStatic(res, decodeURIComponent(url.pathname));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const referenceIndex = await loadReferenceIndex();
  const server = createSearchServer({ referenceIndex });
  server.listen(port, () => {
    console.log(`Source Search Lab V2 running at http://localhost:${port}`);
    console.log(referenceIndex.coverage.claim);
    console.log("Customer source is processed transiently and is not sent to public search engines.");
  });
}

import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSnippet, rankDocuments } from "./lib/search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const sourcesDir = path.join(publicDir, "sources");
const port = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 256 * 1024;

function parseSource(filename, text) {
  const lines = text.split(/\r?\n/);
  const title = (lines.shift() || filename).replace(/^Title:\s*/i, "").trim();
  const tagLine = (lines.shift() || "").replace(/^Tags:\s*/i, "");
  const tags = tagLine.split(",").map((tag) => tag.trim()).filter(Boolean);
  const body = lines.join("\n").trim();
  return {
    id: filename,
    title,
    tags,
    body,
    url: `/sources/${encodeURIComponent(filename)}`
  };
}

async function loadCorpus() {
  try {
    const names = (await readdir(sourcesDir)).filter((name) => name.endsWith(".txt")).sort();
    return Promise.all(
      names.map(async (name) => parseSource(name, await readFile(path.join(sourcesDir, name), "utf8")))
    );
  } catch {
    return [];
  }
}

const corpus = await loadCorpus();

export async function webSearch(query, fetchImpl = fetch) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { configured: false, results: [] };

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Web search returned HTTP ${response.status}`);

    const data = await response.json();
    const results = (data.web?.results || []).slice(0, 5).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.description || "",
      source: "web"
    }));

    return { configured: true, results };
  } finally {
    clearTimeout(timeout);
  }
}

function privacyHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff"
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...privacyHeaders(),
    "Content-Type": "application/json; charset=utf-8"
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

async function handleSearch(req, res, searchCorpus, webSearchFn) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid request." });
  }

  let query = typeof body.query === "string" ? body.query.trim() : "";
  const allowExternalWebSearch = body.allowExternalWebSearch === true;

  if (!query) return sendJson(res, 400, { error: "Enter a search query." });

  const ranked = rankDocuments(query, searchCorpus);

  if (ranked.length > 0) {
    const payload = {
      source: "local",
      searchedLocalSources: searchCorpus.length,
      results: ranked.slice(0, 10).map((doc) => ({
        title: doc.title,
        url: doc.url,
        tags: doc.tags,
        score: doc.score,
        snippet: makeSnippet(doc.body, query),
        source: "local"
      }))
    };
    query = "";
    return sendJson(res, 200, payload);
  }

  if (!allowExternalWebSearch) {
    query = "";
    return sendJson(res, 200, {
      source: "none",
      searchedLocalSources: searchCorpus.length,
      privacyProtected: true,
      externalWebSearch: "disabled",
      results: []
    });
  }

  try {
    const web = await webSearchFn(query);
    query = "";
    return sendJson(res, 200, {
      source: "web",
      searchedLocalSources: searchCorpus.length,
      webConfigured: web.configured,
      privacyProtected: false,
      results: web.results
    });
  } catch (error) {
    query = "";
    return sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Web search failed."
    });
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
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
      "Content-Type": contentType(filePath)
    });
    res.end(content);
  } catch {
    res.writeHead(404, privacyHeaders());
    res.end("Not found");
  }
}

export function createSearchServer({ searchCorpus = corpus, webSearchFn = webSearch } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/search" && req.method === "POST") {
      return handleSearch(req, res, searchCorpus, webSearchFn);
    }

    if (url.pathname === "/api/search") {
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
  const server = createSearchServer();
  server.listen(port, () => {
    console.log(`Source Search Lab running at http://localhost:${port}`);
    console.log(`Loaded ${corpus.length} local sources.`);
    console.log("Private mode is default. External web fallback requires explicit opt-in.");
  });
}

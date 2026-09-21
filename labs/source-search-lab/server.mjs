import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSnippet, rankDocuments } from "./lib/search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const sourcesDir = path.join(publicDir, "sources");
const port = Number(process.env.PORT || 3000);

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
  const names = (await readdir(sourcesDir)).filter((name) => name.endsWith(".txt")).sort();
  return Promise.all(
    names.map(async (name) => parseSource(name, await readFile(path.join(sourcesDir, name), "utf8")))
  );
}

const corpus = await loadCorpus();

async function webSearch(query) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    return {
      configured: false,
      results: []
    };
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Web search returned HTTP ${response.status}`);
    }

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

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function handleSearch(req, res, url) {
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return sendJson(res, 400, { error: "Enter a search query." });

  const ranked = rankDocuments(query, corpus);

  if (ranked.length > 0) {
    return sendJson(res, 200, {
      query,
      source: "local",
      searchedLocalSources: corpus.length,
      results: ranked.slice(0, 10).map((doc) => ({
        title: doc.title,
        url: doc.url,
        tags: doc.tags,
        score: doc.score,
        snippet: makeSnippet(doc.body, query),
        source: "local"
      }))
    });
  }

  try {
    const web = await webSearch(query);
    return sendJson(res, 200, {
      query,
      source: "web",
      searchedLocalSources: corpus.length,
      webConfigured: web.configured,
      results: web.results
    });
  } catch (error) {
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
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/search" && req.method === "GET") {
    return handleSearch(req, res, url);
  }

  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }

  return serveStatic(res, decodeURIComponent(url.pathname));
});

server.listen(port, () => {
  console.log(`Source Search Lab running at http://localhost:${port}`);
  console.log(`Loaded ${corpus.length} local sources.`);
});

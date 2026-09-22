import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { referenceIndexFromPack } from "../labs/source-search-lab/lib/corpus-pack.mjs";
import { scanRepository } from "../labs/source-search-lab/lib/scan-service.mjs";

const require = createRequire(import.meta.url);
const legacyIndex = require("../labs/source-search-lab/data/reference-index.json");

// Optional: present only when a corpus pack was built into this deployment.
function loadPack() {
  const file = path.join(process.cwd(), "labs/source-search-lab/data/corpus-pack.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

// Built once per warm instance.
const pack = loadPack();
const referenceIndex = pack ? referenceIndexFromPack(pack, legacyIndex) : legacyIndex;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const body = typeof req.body === "string" ? safeJson(req.body) : req.body ?? {};
  const repositoryUrl = typeof body.repositoryUrl === "string" ? body.repositoryUrl.trim().slice(0, 300) : "";
  const { status, payload } = await scanRepository(repositoryUrl, { referenceIndex });
  return res.status(status).json(payload);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

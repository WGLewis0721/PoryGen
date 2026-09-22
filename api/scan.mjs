import { createRequire } from "node:module";
import { scanRepository } from "../labs/source-search-lab/lib/scan-service.mjs";

const referenceIndex = createRequire(import.meta.url)("../labs/source-search-lab/data/reference-index.json");

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

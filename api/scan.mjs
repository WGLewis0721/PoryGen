import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { referenceIndexFromPack } from "../labs/source-search-lab/lib/corpus-pack.mjs";
import { scanRepository } from "../labs/source-search-lab/lib/scan-service.mjs";
import { scanUpload } from "../labs/source-search-lab/lib/upload-service.mjs";
import { UPLOAD_LIMITS } from "../labs/source-search-lab/lib/upload-source.mjs";
import { exclusionRules, IngestionError, errorResponse } from "../labs/source-search-lab/lib/ingestion-policy.mjs";

export const config = { api: { bodyParser: false } };

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
const CURRENT_TERMS_VERSION = "2026-09-22-v1";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed.", code: 'METHOD_NOT_ALLOWED', retryable: false });
  }
  try {
  const type = String(req.headers?.['content-type'] ?? '').split(';')[0];
  if (type !== 'application/json') throw new IngestionError('UNSUPPORTED_MEDIA_TYPE', 'Send application/json.', 415);
  const body = await readBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IngestionError('INVALID_REQUEST', 'Send a JSON object.');
  const acceptedAt = typeof body.termsAcceptedAt === "string" ? Date.parse(body.termsAcceptedAt) : NaN;
  if (body.termsVersion !== CURRENT_TERMS_VERSION || !Number.isFinite(acceptedAt)) {
    return res.status(428).json({ error: "Accept the current PoryGen Terms of Use before scanning.", code: 'TERMS_REQUIRED', retryable: false });
  }
  const repositoryUrl = typeof body.repositoryUrl === "string" ? body.repositoryUrl.trim().slice(0, 300) : "";
  const exclusions = exclusionRules(body.exclusions);
  const sourceType = body.sourceType ?? 'github';
  if (!['github', 'zip', 'files'].includes(sourceType)) throw new IngestionError('INVALID_SOURCE_TYPE', 'Choose github, zip, or files.');
  if ((sourceType === 'github' && (body.files !== undefined || body.archiveBase64 !== undefined)) ||
      (sourceType === 'zip' && (body.files !== undefined || body.repositoryUrl !== undefined)) ||
      (sourceType === 'files' && (body.archiveBase64 !== undefined || body.repositoryUrl !== undefined))) {
    throw new IngestionError('AMBIGUOUS_SOURCE', 'Supply exactly one source type per request.');
  }
  const { status, payload } = sourceType === 'github'
    ? await scanRepository(repositoryUrl, { referenceIndex, exclusions })
    : await scanUpload({ sourceType, files: body.files, archiveBase64: body.archiveBase64, exclusions }, referenceIndex);
  // Stay below Vercel's request/response ceiling; do not store source in Blob:
  // https://vercel.com/docs/functions/limitations#request-body-size
  if (Buffer.byteLength(JSON.stringify(payload)) > UPLOAD_LIMITS.maxRequestBytes) throw new IngestionError('RESULT_TOO_LARGE', 'The result is too large. Scan a smaller selection.', 413);
  return res.status(status).json(payload);
  } catch (error) {
    const { status, payload } = errorResponse(error);
    return res.status(status).json(payload);
  }
}

async function readBody(req) {
  let raw;
  if (req.body !== undefined) {
    raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  } else {
    raw = await new Promise((resolve, reject) => {
      const chunks = []; let bytes = 0;
      const clean = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', error); };
      const error = () => { clean(); reject(new IngestionError('INVALID_REQUEST', 'Upload interrupted.')); };
      const data = chunk => {
        const buffer = Buffer.from(chunk); bytes += buffer.length;
        if (bytes > UPLOAD_LIMITS.maxRequestBytes) { clean(); req.pause(); reject(new IngestionError('UPLOAD_TOO_LARGE', 'Request exceeds 4 MB.', 413)); }
        else chunks.push(buffer);
      };
      const end = () => { clean(); resolve(Buffer.concat(chunks)); };
      const timer = setTimeout(() => { clean(); req.pause(); reject(new IngestionError('PROCESSING_TIMEOUT', 'Upload timed out.', 408)); }, 10_000);
      req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', error);
    });
  }
  if (raw.length > UPLOAD_LIMITS.maxRequestBytes) throw new IngestionError('UPLOAD_TOO_LARGE', 'Request exceeds 4 MB.', 413);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw new IngestionError('INVALID_JSON', 'Send valid UTF-8 JSON.'); }
}

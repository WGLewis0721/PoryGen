#!/usr/bin/env node
// Deploys dist/ to Cloudflare Workers static assets (porygen.<subdomain>.workers.dev)
// via the raw Cloudflare API — no `wrangler login` needed, just an API token.
//
// This is how the live deployment was actually produced (see README.md). Cloudflare
// Pages would need an interactive dashboard step to authorize the GitHub App for this
// repo; Workers' direct-upload asset API is fully scriptable, so that's what this uses.
//
// Usage:
//   npm run build
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/deploy-worker-assets.mjs
//
// The token needs "Workers Scripts: Edit" permission for the target account.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join, sep } from "node:path";

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const WORKER_NAME = process.env.WORKER_NAME ?? "porygen";
const DIST_DIR = "dist";

if (!API_TOKEN || !ACCOUNT_ID) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first.");
  process.exit(1);
}

const CONTENT_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function cfFetch(path, init = {}) {
  return fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_TOKEN}`, ...(init.headers ?? {}) },
  }).then(async (res) => {
    const body = await res.json();
    if (!res.ok || body.success === false) {
      throw new Error(`Cloudflare API ${path} failed: ${JSON.stringify(body.errors ?? body)}`);
    }
    return body;
  });
}

function walk(dir, base = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = (base ? `${base}/${entry}` : entry).split(sep).join("/");
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

async function main() {
  const files = walk(DIST_DIR);
  const manifest = {};
  const byHash = new Map();

  for (const { full, rel } of files) {
    const content = readFileSync(full);
    const ext = extname(rel).slice(1);
    const hash = createHash("sha256").update(content.toString("base64") + ext).digest("hex").slice(0, 32);
    manifest[`/${rel}`] = { hash, size: content.length };
    byHash.set(hash, { content, contentType: CONTENT_TYPES[`.${ext}`] ?? "application/octet-stream" });
  }

  console.log(`Uploading ${files.length} files...`);
  const session = await cfFetch(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/assets-upload-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest }),
  });

  const { buckets, jwt: sessionJwt } = session.result;
  let completionJwt = sessionJwt;

  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const { content, contentType } = byHash.get(hash);
      form.append(hash, new Blob([content.toString("base64")], { type: contentType }));
    }
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true`,
      { method: "POST", headers: { Authorization: `Bearer ${sessionJwt}` }, body: form },
    );
    const body = await res.json();
    if (!res.ok) throw new Error(`Asset upload failed: ${JSON.stringify(body)}`);
    if (body.result?.jwt) completionJwt = body.result.jwt;
  }

  console.log("Finalizing deployment...");
  const scriptForm = new FormData();
  scriptForm.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          compatibility_date: new Date().toISOString().slice(0, 10),
          assets: { jwt: completionJwt, config: { not_found_handling: "single-page-application" } },
        }),
      ],
      { type: "application/json" },
    ),
  );

  await cfFetch(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`, { method: "PUT", body: scriptForm });

  const sub = await cfFetch(`/accounts/${ACCOUNT_ID}/workers/subdomain`);
  await cfFetch(`/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  console.log(`\nDeployed: https://${WORKER_NAME}.${sub.result.subdomain}.workers.dev`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

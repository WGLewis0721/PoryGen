import { normalizeLicense } from "./license.mjs";

const UA = { "User-Agent": "porygen-source-index (+https://porygen.vercel.app)" };

async function get(url, { as = "json", timeoutMs = 60_000, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} for ${url}`), { fatal: true });
      if (as === "json") return await response.json();
      if (as === "text") return await response.text();
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error.fatal || attempt >= retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// ---- seed lists ------------------------------------------------------------

/** npm packages ordered by monthly downloads (wooorm/npm-high-impact). */
export async function seedNpm(limit) {
  const text = await get("https://raw.githubusercontent.com/wooorm/npm-high-impact/main/lib/top-download.js", { as: "text" });
  const names = [...text.matchAll(/'((?:@[^'/]+\/)?[^'@][^']*)'/g)].map((m) => m[1]);
  return [...new Set(names)].slice(0, limit).map((name, rank) => ({ ecosystem: "npm", name, rank }));
}

/** PyPI packages ordered by 30-day downloads (hugovk/top-pypi-packages). */
export async function seedPypi(limit) {
  const data = await get("https://hugovk.dev/top-pypi-packages/top-pypi-packages.min.json");
  return data.rows.slice(0, limit).map((row, rank) => ({ ecosystem: "pypi", name: row.project, rank, downloads: row.download_count }));
}

// ---- metadata --------------------------------------------------------------

function repoUrl(value) {
  const url = typeof value === "string" ? value : value?.url;
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/#.]+)/i);
  return m ? `https://github.com/${m[1]}/${m[2]}` : url.replace(/^git\+/, "").replace(/\.git$/, "");
}

/**
 * Canonical release metadata for the latest npm version: exact version,
 * SPDX license, repository, first-publish date (origin signal) and tarball.
 */
export async function npmRelease(name) {
  const doc = await get(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!doc || !doc["dist-tags"]?.latest) return null;
  const version = doc["dist-tags"].latest;
  const manifest = doc.versions?.[version];
  if (!manifest?.dist?.tarball) return null;
  const license = normalizeLicense(manifest.license ?? manifest.licenses ?? doc.license);
  return {
    ecosystem: "npm",
    name,
    version,
    license,
    repository: repoUrl(manifest.repository ?? doc.repository),
    firstPublished: doc.time?.created ?? null,
    versionPublished: doc.time?.[version] ?? null,
    archiveUrl: manifest.dist.tarball,
    archiveIntegrity: manifest.dist.integrity ?? null,
    browseUrl: (path) => `https://unpkg.com/${name}@${version}/${path}`,
  };
}

export async function npmDownloads(names) {
  const result = new Map();
  const unscoped = names.filter((n) => !n.startsWith("@"));
  for (let i = 0; i < unscoped.length; i += 128) {
    const batch = unscoped.slice(i, i + 128);
    const data = await get(`https://api.npmjs.org/downloads/point/last-month/${batch.join(",")}`).catch(() => null);
    if (!data) continue;
    const entries = batch.length === 1 ? { [batch[0]]: data } : data;
    for (const [name, value] of Object.entries(entries)) if (value?.downloads != null) result.set(name, value.downloads);
  }
  // Scoped names can't be batched; fetch a few at a time, one attempt each.
  const scoped = names.filter((n) => n.startsWith("@"));
  for (let i = 0; i < scoped.length; i += 8) {
    await Promise.all(scoped.slice(i, i + 8).map(async (name) => {
      const data = await get(`https://api.npmjs.org/downloads/point/last-month/${name}`, { retries: 0, timeoutMs: 10_000 }).catch(() => null);
      if (data?.downloads != null) result.set(name, data.downloads);
    }));
  }
  return result;
}

export async function pypiRelease(name) {
  const doc = await get(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!doc?.info) return null;
  const version = doc.info.version;
  const files = doc.urls ?? [];
  const sdist = files.find((f) => f.packagetype === "sdist" && /\.tar\.gz$/.test(f.filename));
  if (!sdist) return null;
  const uploads = Object.values(doc.releases ?? {}).flat().map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
  // Most specific source first; free-text license fields often say "Dual License" or paste the full text.
  const candidates = [
    doc.info.license_expression,
    (doc.info.classifiers ?? []).filter((c) => c.startsWith("License ::")),
    doc.info.license && doc.info.license.length < 80 ? doc.info.license : null,
  ].map(normalizeLicense);
  const license = candidates.find((l) => l.spdx) ?? { ...candidates[2], raw: doc.info.license?.slice(0, 200) ?? null };
  const urls = doc.info.project_urls ?? {};
  const repo = Object.values(urls).find((u) => /github\.com\/[^/]+\/[^/]+/.test(u)) ?? doc.info.home_page;
  const archivePath = new URL(sdist.url).pathname.replace(/^\//, "");
  const root = sdist.filename.replace(/\.tar\.gz$/, "");
  return {
    ecosystem: "pypi",
    name: doc.info.name,
    version,
    license,
    repository: repo ? repoUrl(repo) : null,
    firstPublished: uploads[0] ?? null,
    versionPublished: sdist.upload_time_iso_8601 ?? null,
    archiveUrl: sdist.url,
    archiveIntegrity: sdist.digests?.sha256 ? `sha256-${sdist.digests.sha256}` : null,
    browseUrl: (path) => `https://inspector.pypi.io/project/${doc.info.name}/${version}/${archivePath}/${root}/${path}`,
  };
}

export const fetchRelease = (ecosystem, name) => (ecosystem === "npm" ? npmRelease(name) : pypiRelease(name));
export const fetchArchive = (url) => get(url, { as: "buffer", timeoutMs: 120_000 });

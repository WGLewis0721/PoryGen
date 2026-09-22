import { createHash } from "node:crypto";
import { analyze, AUXILIARY_PATH, DERIVED_PATH, selectFile } from "./content.mjs";
import { packHashes, packSource, setMeta, transaction, unpackHashes, unpackSource } from "./db.mjs";
import { rankCluster } from "./rank.mjs";
import { fetchArchive, fetchRelease, npmDownloads, seedNpm, seedPypi } from "./registries.mjs";
import { readTar, stripRoot } from "./tar.mjs";

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

// ---- seed ------------------------------------------------------------------

export async function seed(db, { npm = 3000, pypi = 1500 } = {}) {
  const lists = [...(npm ? await seedNpm(npm) : []), ...(pypi ? await seedPypi(pypi) : [])];
  const insert = db.prepare(`INSERT INTO projects (ecosystem, name, rank, downloads) VALUES (?, ?, ?, ?)
    ON CONFLICT(ecosystem, name) DO UPDATE SET rank = excluded.rank, downloads = COALESCE(excluded.downloads, projects.downloads)`);
  transaction(db, () => lists.forEach((p) => insert.run(p.ecosystem, p.name, p.rank, p.downloads ?? null)));
  log(`seeded ${lists.length} projects`);
}

export async function downloads(db) {
  const names = db.prepare("SELECT name FROM projects WHERE ecosystem = 'npm' AND status = 'indexed' AND downloads IS NULL").all().map((r) => r.name);
  const counts = await npmDownloads(names);
  const update = db.prepare("UPDATE projects SET downloads = ? WHERE ecosystem = 'npm' AND name = ?");
  transaction(db, () => counts.forEach((n, name) => update.run(n, name)));
  log(`download counts for ${counts.size} npm projects`);
}

// ---- fetch -----------------------------------------------------------------

function verifyIntegrity(buffer, integrity) {
  if (!integrity) return true;
  const [algorithm, expected] = integrity.split("-", 2);
  const digest = createHash(algorithm).update(buffer);
  return expected === (/^[0-9a-f]+$/.test(expected) ? digest.digest("hex") : digest.digest("base64"));
}

function fileCount(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM files").get().n;
}

/**
 * Download each project's latest release archive, verify its integrity,
 * select source files and store them deduplicated. Resumable: projects that
 * are already indexed are skipped. Stops once `targetFiles` files are stored.
 */
export async function fetchProjects(db, { targetFiles = 50_000, concurrency = 6, maxFilesPerRelease = 400 } = {}) {
  const pending = db.prepare(`SELECT id, ecosystem, name FROM projects WHERE status = 'pending'
    ORDER BY rank, ecosystem`).all();
  const q = {
    release: db.prepare(`INSERT INTO releases (project_id, version, license_spdx, license_raw, license_family, repository,
      first_published, version_published, archive_url, archive_integrity, indexed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(project_id, version) DO UPDATE SET indexed_at = excluded.indexed_at RETURNING id`),
    blobByHash: db.prepare("SELECT id FROM blobs WHERE exact_hash = ?"),
    blob: db.prepare(`INSERT INTO blobs (exact_hash, shape_hash, language, bytes, token_count, source) VALUES (?,?,?,?,?,?) RETURNING id`),
    cluster: db.prepare(`INSERT INTO clusters (shape_hash, language, fp_preserving, fp_normalized) VALUES (?,?,?,?)
      ON CONFLICT(shape_hash) DO NOTHING`),
    file: db.prepare("INSERT OR IGNORE INTO files (release_id, blob_id, path, source_url) VALUES (?,?,?,?)"),
    status: db.prepare("UPDATE projects SET status = ?, error = ? WHERE id = ?"),
  };

  let stored = fileCount(db);
  let next = 0;
  const skipReasons = {};

  async function indexProject(project) {
    const release = await fetchRelease(project.ecosystem, project.name);
    if (!release) return q.status.run("skipped", "no installable release", project.id);
    const archive = await fetchArchive(release.archiveUrl);
    if (!archive) return q.status.run("skipped", "archive missing", project.id);
    if (!verifyIntegrity(archive, release.archiveIntegrity)) throw new Error("archive integrity mismatch");

    const selected = [];
    for (const entry of readTar(archive, { maxEntryBytes: 100_000 })) {
      const path = stripRoot(entry.path);
      const choice = selectFile(path, entry.content);
      if (!choice.keep) { skipReasons[choice.reason] = (skipReasons[choice.reason] ?? 0) + 1; continue; }
      const analysis = analyze(choice.source, choice.language);
      if (analysis.tokenCount < 40) { skipReasons.too_small = (skipReasons.too_small ?? 0) + 1; continue; }
      selected.push({ path, ...choice, analysis });
      if (selected.length >= maxFilesPerRelease) break;
    }
    if (selected.length === 0) return q.status.run("skipped", "no supported source files", project.id);

    transaction(db, () => {
      const { id: releaseId } = q.release.get(project.id, release.version, release.license.spdx, release.license.raw,
        release.license.family, release.repository, release.firstPublished, release.versionPublished, release.archiveUrl,
        release.archiveIntegrity, new Date().toISOString());
      for (const file of selected) {
        const a = file.analysis;
        const blobId = q.blobByHash.get(a.exactHash)?.id ??
          q.blob.get(a.exactHash, a.shapeHash, file.language, Buffer.byteLength(file.source), a.tokenCount, packSource(file.source)).id;
        q.cluster.run(a.shapeHash, file.language, packHashes(a.fingerprints.preserving), packHashes(a.fingerprints.normalized));
        q.file.run(releaseId, blobId, file.path, release.browseUrl(file.path));
      }
      q.status.run("indexed", null, project.id);
    });
    stored += selected.length;
  }

  async function worker() {
    while (next < pending.length && stored < targetFiles) {
      const project = pending[next++];
      try {
        await indexProject(project);
      } catch (error) {
        q.status.run("failed", String(error.message ?? error).slice(0, 300), project.id);
      }
      if (next % 50 === 0) log(`${next}/${pending.length} projects · ${stored} files`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  setMeta(db, "fetch.skipReasons", skipReasons);
  log(`fetch done: ${stored} files`);
}

// ---- global fingerprint frequencies ---------------------------------------

/**
 * Count, for every winnowed fingerprint, how many distinct clusters and
 * distinct projects contain it. Uses sorted typed arrays instead of hash maps
 * so tens of millions of postings fit in a few hundred MB.
 */
export function computeFrequencies(db) {
  const clusterProjects = new Map();
  for (const row of db.prepare(`SELECT b.shape_hash AS shape, r.project_id AS project FROM files f
      JOIN blobs b ON b.id = f.blob_id JOIN releases r ON r.id = f.release_id`).iterate()) {
    let set = clusterProjects.get(row.shape);
    if (!set) clusterProjects.set(row.shape, (set = new Set()));
    set.add(row.project);
  }

  const insert = db.prepare(`INSERT INTO fingerprint_df (representation, hash, clusters, projects) VALUES (?,?,?,?)
    ON CONFLICT(representation, hash) DO UPDATE SET clusters = excluded.clusters, projects = excluded.projects`);
  const updateCluster = db.prepare("UPDATE clusters SET project_count = ? WHERE shape_hash = ?");

  transaction(db, () => {
    db.exec("DELETE FROM fingerprint_df");
    for (const [shape, set] of clusterProjects) updateCluster.run(set.size, shape);

    for (const [representation, column] of [[0, "fp_preserving"], [1, "fp_normalized"]]) {
      let clusterHashes = [];
      let projectPairs = [];
      for (const row of db.prepare(`SELECT shape_hash, ${column} AS fp FROM clusters`).iterate()) {
        const hashes = unpackHashes(row.fp);
        clusterHashes.push(Float64Array.from(hashes));
        const projects = clusterProjects.get(row.shape_hash) ?? new Set();
        for (const project of projects) {
          // hash (32 bits) and project id (< 2^20) packed exactly into one double.
          projectPairs.push(Float64Array.from(hashes, (h) => h * 1_048_576 + project));
        }
      }
      const byCluster = concatSorted(clusterHashes);
      const pairs = concatSorted(projectPairs);
      clusterHashes = projectPairs = null;

      const projectCounts = new Map();
      for (let i = 0; i < pairs.length; i++) {
        if (i > 0 && pairs[i] === pairs[i - 1]) continue;
        const hash = Math.floor(pairs[i] / 1_048_576);
        projectCounts.set(hash, (projectCounts.get(hash) ?? 0) + 1);
      }
      let stored = 0;
      for (let i = 0; i < byCluster.length; ) {
        let j = i;
        while (j < byCluster.length && byCluster[j] === byCluster[i]) j++;
        if (j - i >= 2) { insert.run(representation, byCluster[i], j - i, projectCounts.get(byCluster[i]) ?? 1); stored++; }
        i = j;
      }
      log(`frequencies (${representation ? "normalized" : "preserving"}): ${stored} shared fingerprints`);
    }
  });
  setMeta(db, "clusters.total", db.prepare("SELECT COUNT(*) AS n FROM clusters").get().n);
}

function concatSorted(parts) {
  const out = new Float64Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out.sort();
}

// ---- upstream ranking ------------------------------------------------------

export function rankUpstreams(db) {
  const rows = db.prepare(`SELECT f.id, f.path, b.shape_hash AS shape, p.name, p.ecosystem, p.downloads,
      r.first_published AS firstPublished, r.license_spdx AS licenseSpdx
    FROM files f JOIN blobs b ON b.id = f.blob_id JOIN releases r ON r.id = f.release_id JOIN projects p ON p.id = r.project_id
    ORDER BY b.shape_hash`).all();
  const setFile = db.prepare("UPDATE files SET rank_score = ?, rank_probability = ?, rank_features = ? WHERE id = ?");
  const setCluster = db.prepare("UPDATE clusters SET canonical_file_id = ?, canonical_probability = ?, occurrences = ? WHERE shape_hash = ?");

  let clusters = 0;
  transaction(db, () => {
    for (let i = 0; i < rows.length; ) {
      let j = i;
      while (j < rows.length && rows[j].shape === rows[i].shape) j++;
      const ranked = rankCluster(rows.slice(i, j));
      for (const o of ranked) setFile.run(o.score, o.probability, JSON.stringify(o.features), o.id);
      setCluster.run(ranked[0].id, ranked[0].probability, ranked.length, rows[i].shape);
      clusters++;
      i = j;
    }
  });
  log(`ranked ${clusters} clusters`);
}

// ---- export ----------------------------------------------------------------

/**
 * Write a corpus pack the scanner can load: the canonical upstream file of the
 * top clusters (by project popularity, product source first), their metadata,
 * and a stoplist of fingerprints that are common across the *whole* corpus.
 * Tokens and postings are rebuilt at load time by the unchanged matcher.
 */
export function exportPack(db, { documents: limit = 1000, stopPreserving = 30, stopNormalized = 8 } = {}) {
  const totalClusters = db.prepare("SELECT COUNT(*) AS n FROM clusters").get().n;
  const rows = db.prepare(`SELECT c.shape_hash, c.canonical_probability, c.occurrences, c.project_count, f.path, f.source_url,
      b.language, b.source, p.ecosystem, p.name, p.rank, r.version, r.license_spdx, r.license_family, r.repository, r.first_published
    FROM clusters c JOIN files f ON f.id = c.canonical_file_id JOIN blobs b ON b.id = f.blob_id
    JOIN releases r ON r.id = f.release_id JOIN projects p ON p.id = r.project_id
    ORDER BY p.rank, p.ecosystem, f.path`).all();

  const docs = [];
  const perProject = new Map();
  for (const row of rows) {
    if (docs.length >= limit) break;
    if (AUXILIARY_PATH.test(row.path) || DERIVED_PATH.test(row.path)) continue;
    const key = `${row.ecosystem}:${row.name}`;
    const count = perProject.get(key) ?? 0;
    if (count >= 8) continue; // spread coverage across projects
    perProject.set(key, count + 1);
    const label = `${row.name}@${row.version}`;
    docs.push({
      id: `${row.ecosystem}:${row.name}@${row.version}:${row.path}`,
      repository: label,
      commit: row.version,
      path: row.path,
      language: row.language,
      license: row.license_spdx ?? "Unknown",
      licenseUrl: row.license_spdx && /^[A-Za-z0-9.+-]+$/.test(row.license_spdx) ? `https://spdx.org/licenses/${row.license_spdx}.html` : null,
      projectRepository: row.repository ?? null,
      sourceUrl: row.source_url,
      source: unpackSource(row.source),
      ecosystem: row.ecosystem,
      licenseFamily: row.license_family,
      upstreamProbability: row.canonical_probability,
      alsoPublishedIn: row.occurrences - 1,
      firstPublished: row.first_published,
    });
  }

  // Identifier-normalized shapes recur far more than exact code, so they get a lower bar.
  const stoplist = { preserving: [], normalized: [] };
  for (const row of db.prepare(`SELECT representation, hash FROM fingerprint_df
      WHERE (representation = 0 AND clusters >= ?) OR (representation = 1 AND clusters >= ?)`).iterate(stopPreserving, stopNormalized)) {
    stoplist[row.representation ? "normalized" : "preserving"].push(row.hash);
  }

  const packages = new Set(docs.map((d) => `${d.ecosystem}:${d.repository.replace(/@[^@]+$/, "")}`));
  return {
    format: "porygen-corpus-pack/1",
    builtAt: new Date().toISOString(),
    corpus: {
      projects: db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status = 'indexed'").get().n,
      files: db.prepare("SELECT COUNT(*) AS n FROM files").get().n,
      uniqueBlobs: db.prepare("SELECT COUNT(*) AS n FROM blobs").get().n,
      clusters: totalClusters,
      stopThresholdClusters: { preserving: stopPreserving, normalized: stopNormalized },
    },
    coverage: {
      files: docs.length,
      packages: packages.size,
      claim: `PoryGen currently searches ${docs.length.toLocaleString("en-US")} canonical source files from ${packages.size.toLocaleString("en-US")} popular npm and PyPI packages.`,
    },
    stoplist,
    documents: docs,
  };
}

export function stats(db) {
  const one = (sql) => db.prepare(sql).get();
  return {
    projects: db.prepare("SELECT ecosystem, status, COUNT(*) AS n FROM projects GROUP BY 1, 2 ORDER BY 1, 2").all(),
    files: one("SELECT COUNT(*) AS n FROM files").n,
    uniqueBlobs: one("SELECT COUNT(*) AS n FROM blobs").n,
    clusters: one("SELECT COUNT(*) AS n FROM clusters").n,
    multiOccurrenceClusters: one("SELECT COUNT(*) AS n FROM clusters WHERE occurrences > 1").n,
    licenses: db.prepare("SELECT license_family AS family, COUNT(*) AS n FROM releases GROUP BY 1").all(),
    sharedFingerprints: db.prepare("SELECT representation, COUNT(*) AS n, MAX(clusters) AS max FROM fingerprint_df GROUP BY 1").all(),
  };
}

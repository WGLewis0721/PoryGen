import { DatabaseSync } from "node:sqlite";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- One row per registry project we intend to index.
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  ecosystem TEXT NOT NULL,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  downloads INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | indexed | skipped | failed
  error TEXT,
  UNIQUE (ecosystem, name)
);

-- The exact release indexed for a project, with canonical metadata.
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  version TEXT NOT NULL,
  license_spdx TEXT,
  license_raw TEXT,
  license_family TEXT NOT NULL,             -- permissive | copyleft | unknown
  repository TEXT,
  first_published TEXT,
  version_published TEXT,
  archive_url TEXT NOT NULL,
  archive_integrity TEXT,
  indexed_at TEXT NOT NULL,
  UNIQUE (project_id, version)
);

-- Unique file contents (exact dedup), stored compressed.
CREATE TABLE IF NOT EXISTS blobs (
  id INTEGER PRIMARY KEY,
  exact_hash TEXT NOT NULL UNIQUE,
  shape_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  source BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS blobs_shape ON blobs(shape_hash);

-- Near-dup clusters: same identifier-normalized token stream.
CREATE TABLE IF NOT EXISTS clusters (
  shape_hash TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  fp_preserving BLOB NOT NULL,              -- Uint32 winnowed hashes
  fp_normalized BLOB NOT NULL,
  canonical_file_id INTEGER,
  canonical_probability REAL,
  occurrences INTEGER,
  project_count INTEGER
);

-- Every place a blob was published.
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  release_id INTEGER NOT NULL REFERENCES releases(id),
  blob_id INTEGER NOT NULL REFERENCES blobs(id),
  path TEXT NOT NULL,
  source_url TEXT NOT NULL,
  rank_score REAL,
  rank_probability REAL,
  rank_features TEXT,
  UNIQUE (release_id, path)
);
CREATE INDEX IF NOT EXISTS files_blob ON files(blob_id);

-- Global fingerprint frequencies, counted once per cluster (so vendored and
-- re-published copies don't inflate them) and once per project.
-- Only hashes seen in 2+ clusters are stored; absent means 1.
CREATE TABLE IF NOT EXISTS fingerprint_df (
  representation INTEGER NOT NULL,          -- 0 preserving, 1 normalized
  hash INTEGER NOT NULL,
  clusters INTEGER NOT NULL,
  projects INTEGER NOT NULL,
  PRIMARY KEY (representation, hash)
) WITHOUT ROWID;
`;

export function openCorpus(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const packSource = (text) => deflateRawSync(Buffer.from(text, "utf8"));
export const unpackSource = (blob) => inflateRawSync(Buffer.from(blob)).toString("utf8");
export const packHashes = (hashes) => Buffer.from(Uint32Array.from(hashes).buffer);
export const unpackHashes = (blob) => {
  const b = Buffer.from(blob);
  return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};

export function setMeta(db, key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

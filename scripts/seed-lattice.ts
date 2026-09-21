#!/usr/bin/env tsx
// Generates deterministic SQL for the public "Lattice" sample repository:
// two scans produced by the real scan pipeline (so findings carry genuine
// similarity evidence, excerpts, and finding keys), resolution history that
// shows all three outcomes (in review, accepted risk, resolved by a clean
// rescan), and an editor-attribution ledger with genuinely computed hash-chain
// linkage.
//
// Lattice is fictional sample data and is labelled that way everywhere it
// appears. The seeded resolution decisions are sample content, attributed to
// the fixed demo profile.
//
// Usage: npm run seed > scripts/lattice-seed.sql
// Apply with service-role / management access (rows are owned by the fixed
// demo profile, not the caller). Requires the resolution-history migration.

import {
  buildChain,
  createReferenceCorpusProvider,
  runScanPipeline,
  sha256Hex,
  type FindingDraft,
  type LicenseLookup,
  type ProvenanceEventInput,
  type ScanSourceFile,
} from "@porygen/provenance-core";

const DEMO_OWNER_ID = process.env.PORYGEN_DEMO_OWNER_ID ?? "aecb8db5-cd47-42f5-806f-c9d0a844a0ad";
const REPOSITORY_ID = "00000000-0000-4000-8000-000000000001";
const EARLIER_SCAN_ID = "00000000-0000-4000-8000-000000000003";
const SCAN_ID = "00000000-0000-4000-8000-000000000002";

function sql(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonb(value: unknown): string {
  return `${sql(JSON.stringify(value))}::jsonb`;
}

function file(path: string, content: string): ScanSourceFile {
  return { path, content, bytes: new TextEncoder().encode(content).length };
}

/** A renamed/reformatted copy of the bundled AGPL-3.0 quicksort reference entry. */
const QUICKSORT_PROBE = `def order(values):
    if len(values) <= 1:
        return values
    anchor = values[len(values) // 2]
    smaller = [v for v in values if v < anchor]
    equal = [v for v in values if v == anchor]
    larger = [v for v in values if v > anchor]
    return order(smaller) + equal + order(larger)`;

const LEGACY_SORT = `# Legacy sort helper, pasted in during the prototype.
def sort_items(items):
    if len(items) <= 1:
        return items
    pivot = items[len(items) // 2]
    below = [i for i in items if i < pivot]
    same = [i for i in items if i == pivot]
    above = [i for i in items if i > pivot]
    return sort_items(below) + same + sort_items(above)`;

const DEBOUNCE = `export function debounce(fn, waitMs) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, waitMs);
  };
}`;

const RATE_LIMITER = `const buckets = new Map<string, { tokens: number; refilledAt: number }>();

export function takeToken(key: string, capacity = 60, refillPerSecond = 1): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, refilledAt: now };
  const elapsed = (now - bucket.refilledAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
  bucket.refilledAt = now;
  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;
  buckets.set(key, bucket);
  return allowed;
}`;

const VALIDATORS = `export const isEmail = (value: string) => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value);
export const isSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export function required(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? "Required" : null;
}`;

const PACKAGE_JSON = JSON.stringify({ name: "lattice", dependencies: { "lattice-forms": "2.3.0", "lattice-utils": "1.8.2" } }, null, 2);

/** The fixture's two fictional packages, resolved without a network call. */
const fixtureLicenses: LicenseLookup = async (dep) =>
  dep.name === "lattice-forms" ? "AGPL-3.0" : dep.name === "lattice-utils" ? "MIT" : "Unknown";

const EARLIER_FILES = [file("src/legacy/sort_v1.py", LEGACY_SORT), file("src/utils/debounce.js", DEBOUNCE), file("package.json", PACKAGE_JSON)];
const CURRENT_FILES = [
  file("src/sort/order.py", QUICKSORT_PROBE),
  file("src/utils/debounce.js", DEBOUNCE),
  file("src/api/rateLimiter.ts", RATE_LIMITER),
  file("src/forms/validators.ts", VALIDATORS),
  file("README.md", "# Lattice\n\nFictional sample repository for PoryGen.\n"),
  file("package.json", PACKAGE_JSON),
];

async function scan(files: ScanSourceFile[]) {
  const result = await runScanPipeline({
    repositoryName: "porygen/lattice",
    files,
    providers: [createReferenceCorpusProvider()],
    licenseLookup: fixtureLicenses,
    terminalLog: ["[ingest] porygen/lattice@main accepted (seeded sample)"],
  });
  // Seeded rows are deterministic: drop the SBOM's random serial number.
  const sbom = result.summary.sbom as { serialNumber?: string; metadata?: { timestamp?: string } };
  sbom.serialNumber = "urn:uuid:00000000-0000-4000-8000-00000000abcd";
  if (sbom.metadata) sbom.metadata.timestamp = "2026-09-15T10:00:00.000Z";
  return result;
}

/** Deterministic, valid UUIDs: 00000000-0000-4000-a0SS-00000000000N (SS = scan suffix, N = row). */
function findingId(scanId: string, index: number): string {
  return `00000000-0000-4000-a0${scanId.slice(-2)}-${String(index + 1).padStart(12, "0")}`;
}

async function main() {
  const out: string[] = [];
  out.push("-- Generated by scripts/seed-lattice.ts — do not hand-edit.");
  out.push(`delete from public.finding_resolutions where repository_id = '${REPOSITORY_ID}';`);
  out.push(`delete from public.tracked_findings where repository_id = '${REPOSITORY_ID}';`);
  out.push(`delete from public.provenance_events where repository_id = '${REPOSITORY_ID}';`);
  out.push(`delete from public.scan_findings where scan_id in ('${SCAN_ID}', '${EARLIER_SCAN_ID}');`);
  out.push(`delete from public.scans where id in ('${SCAN_ID}', '${EARLIER_SCAN_ID}');`);
  out.push(`delete from public.repositories where id = '${REPOSITORY_ID}';`);

  out.push(`insert into public.repositories
    (id, owner_id, name, provider, clone_url, default_branch, visibility, is_demo, last_scanned_at)
    values (${sql(REPOSITORY_ID)}, ${sql(DEMO_OWNER_ID)}, 'porygen/lattice', 'demo',
      'https://porygen.dev/demo/lattice', 'main', 'public', true, '2026-09-15T10:03:00Z');`);

  const earlier = await scan(EARLIER_FILES);
  const current = await scan(CURRENT_FILES);

  const scans: Array<{ id: string; result: typeof current; started: string; finished: string }> = [
    { id: EARLIER_SCAN_ID, result: earlier, started: "2026-09-10T15:00:00Z", finished: "2026-09-10T15:01:00Z" },
    { id: SCAN_ID, result: current, started: "2026-09-15T10:02:00Z", finished: "2026-09-15T10:03:00Z" },
  ];

  const ids = new Map<string, string>(); // `${scanId}:${finding_key}` → scan_findings.id
  for (const s of scans) {
    out.push(`insert into public.scans
      (id, repository_id, owner_id, status, policy_version, started_at, finished_at,
       files_scanned, dependencies_scanned, risk_level, summary_json)
      values (${sql(s.id)}, ${sql(REPOSITORY_ID)}, ${sql(DEMO_OWNER_ID)}, 'complete', '2026.1', ${sql(s.started)}, ${sql(s.finished)},
        ${s.result.summary.ingestedPaths.length}, ${s.result.dependencyFindings.length}, ${sql(s.result.riskLevel)}, ${jsonb(s.result.summary)});`);
    const rows: FindingDraft[] = [...s.result.findings];
    if (s.id === SCAN_ID) {
      rows.push({
        finding_key: "provenance:src/api/rateLimiter.ts",
        type: "provenance_mix",
        severity: "info",
        title: "Bulk insertion followed by substantial developer editing",
        file_path: "src/api/rateLimiter.ts",
        line_start: null,
        line_end: null,
        confidence: null,
        evidence_json: {
          classification: "MIXED_PROVENANCE",
          bulkInsertion: { lines: 126, elapsedMs: 184 },
          developerEdits: { edits: 31, elapsedMinutes: 14 },
          note: "Editor attribution from the optional VS Code extension — edit shape only, never content.",
        },
        remediation: null,
      });
    }
    rows.forEach((row, index) => {
      const id = findingId(s.id, index);
      ids.set(`${s.id}:${row.finding_key}`, id);
      out.push(`insert into public.scan_findings
        (id, scan_id, type, severity, title, file_path, line_start, line_end, confidence, evidence_json, remediation, finding_key, created_at)
        values (${sql(id)}, ${sql(s.id)}, ${sql(row.type)}, ${sql(row.severity)}, ${sql(row.title)}, ${sql(row.file_path)},
          ${sql(row.line_start)}, ${sql(row.line_end)}, ${sql(row.confidence)}, ${jsonb(row.evidence_json)}, ${sql(row.remediation)},
          ${sql(row.finding_key)}, ${sql(s.finished)});`);
    });
  }

  const key = (scanId: string, pathOrName: string) =>
    [...ids.keys()].find((k) => k.startsWith(`${scanId}:`) && k.endsWith(pathOrName))?.split(":").slice(1).join(":");
  const orderKey = key(SCAN_ID, "src/sort/order.py");
  const legacyKey = key(EARLIER_SCAN_ID, "src/legacy/sort_v1.py");
  const formsKey = key(SCAN_ID, "npm:lattice-forms");
  if (!orderKey || !legacyKey || !formsKey) throw new Error("seed fixture regressed: expected findings are missing");

  const tracked = [
    {
      id: "00000000-0000-4000-b000-000000000001",
      key: orderKey,
      type: "structural_similarity",
      provider: "porygen-reference-corpus",
      title: current.findings.find((f) => f.finding_key === orderKey)!.title,
      path: "src/sort/order.py",
      severity: "blocking",
      band: "strong_match",
      status: "in_review",
      first: SCAN_ID,
      last: SCAN_ID,
      resolvedScan: null as string | null,
      resolvedAt: null as string | null,
      history: [
        { action: "detected", actor: "system", from: null, to: "open", note: null, scan: SCAN_ID, rescan: null, revision: null, at: "2026-09-15T10:03:00Z" },
        {
          action: "review_started", actor: "user", from: "open", to: "in_review",
          note: "Checking whether this came from the agent or from the old prototype sort.", scan: SCAN_ID, rescan: null, revision: null, at: "2026-09-15T11:20:00Z",
        },
      ],
    },
    {
      id: "00000000-0000-4000-b000-000000000002",
      key: formsKey,
      type: "license",
      provider: null,
      title: current.findings.find((f) => f.finding_key === formsKey)!.title,
      path: null,
      severity: "blocking",
      band: null,
      status: "accepted_risk",
      first: EARLIER_SCAN_ID,
      last: SCAN_ID,
      resolvedScan: null,
      resolvedAt: null,
      history: [
        { action: "detected", actor: "system", from: null, to: "open", note: null, scan: EARLIER_SCAN_ID, rescan: null, revision: null, at: "2026-09-10T15:01:00Z" },
        {
          action: "accepted_risk", actor: "user", from: "open", to: "accepted_risk",
          note: "Used only in the internal admin build, which is never distributed. Revisit before any on-prem release.",
          scan: EARLIER_SCAN_ID, rescan: null, revision: null, at: "2026-09-11T09:40:00Z",
        },
      ],
    },
    {
      id: "00000000-0000-4000-b000-000000000003",
      key: legacyKey,
      type: "structural_similarity",
      provider: "porygen-reference-corpus",
      title: earlier.findings.find((f) => f.finding_key === legacyKey)!.title,
      path: "src/legacy/sort_v1.py",
      severity: "blocking",
      band: "strong_match",
      status: "resolved",
      first: EARLIER_SCAN_ID,
      last: EARLIER_SCAN_ID,
      resolvedScan: SCAN_ID,
      resolvedAt: "2026-09-15T10:03:00Z",
      history: [
        { action: "detected", actor: "system", from: null, to: "open", note: null, scan: EARLIER_SCAN_ID, rescan: null, revision: null, at: "2026-09-10T15:01:00Z" },
        { action: "review_started", actor: "user", from: "open", to: "in_review", note: null, scan: EARLIER_SCAN_ID, rescan: null, revision: null, at: "2026-09-11T09:10:00Z" },
        {
          action: "remediation_recorded", actor: "user", from: "in_review", to: "in_review",
          note: "Deleted the prototype module; sorting now uses the standard library.", scan: EARLIER_SCAN_ID, rescan: null, revision: "c3d1e9a", at: "2026-09-12T16:45:00Z",
        },
        {
          action: "rescan_clean", actor: "system", from: "in_review", to: "resolved",
          note: "src/legacy/sort_v1.py is no longer in the repository.", scan: EARLIER_SCAN_ID, rescan: SCAN_ID, revision: null, at: "2026-09-15T10:03:00Z",
        },
      ],
    },
  ];

  for (const t of tracked) {
    out.push(`insert into public.tracked_findings
      (id, repository_id, owner_id, finding_key, type, provider_id, title, file_path, severity, band, status, remediation_pending,
       first_scan_id, last_seen_scan_id, latest_finding_id, resolved_scan_id, resolved_at, created_at, updated_at)
      values (${sql(t.id)}, ${sql(REPOSITORY_ID)}, ${sql(DEMO_OWNER_ID)}, ${sql(t.key)}, ${sql(t.type)}, ${sql(t.provider)}, ${sql(t.title)},
        ${sql(t.path)}, ${sql(t.severity)}, ${sql(t.band)}, ${sql(t.status)}, false, ${sql(t.first)}, ${sql(t.last)},
        ${sql(ids.get(`${t.last}:${t.key}`) ?? null)}, ${sql(t.resolvedScan)}, ${sql(t.resolvedAt)}, ${sql(t.history[0].at)}, ${sql(t.history[t.history.length - 1].at)});`);
    t.history.forEach((h) => {
      out.push(`insert into public.finding_resolutions
        (tracked_finding_id, repository_id, owner_id, actor_kind, actor_id, action, from_status, to_status, note, scan_id, rescan_scan_id, revision, created_at)
        values (${sql(t.id)}, ${sql(REPOSITORY_ID)}, ${sql(DEMO_OWNER_ID)}, ${sql(h.actor)}, ${h.actor === "user" ? sql(DEMO_OWNER_ID) : "null"},
          ${sql(h.action)}, ${sql(h.from)}, ${sql(h.to)}, ${sql(h.note)}, ${sql(h.scan)}, ${sql(h.rescan)}, ${sql(h.revision)}, ${sql(h.at)});`);
    });
  }

  // ---- Editor attribution ledger: a real hash-chained event sequence ----------
  const files = ["src/api/rateLimiter.ts", "src/sort/order.py", "src/forms/validators.ts", "src/utils/debounce.js", "vendor/leftpad.js", "README.md"];
  const baseTime = new Date("2026-09-15T09:00:00.000Z").getTime();
  const inputs: ProvenanceEventInput[] = [];
  let cursor = baseTime;
  const commitShas = ["a1c9f02", "a1c9f02", "b774de1", "b774de1", "c92a10f", "d05b7e2", "d05b7e2", "e441fa9"];

  async function pushEvent(
    path: string,
    sourceType: ProvenanceEventInput["sourceType"],
    actorType: ProvenanceEventInput["actorType"],
    minutesLater: number,
    tool: string | null,
    provider: string | null,
    metadata: Record<string, unknown>,
    commitIndex: number,
  ) {
    cursor += minutesLater * 60_000;
    inputs.push({
      ownerId: DEMO_OWNER_ID,
      repositoryId: REPOSITORY_ID,
      filePath: path,
      sourceType,
      actorType,
      provider,
      tool,
      commitSha: commitShas[commitIndex],
      contentHash: await sha256Hex(`${path}:${sourceType}:${cursor}`),
      diffHash: (await sha256Hex(`${path}:${cursor}:diff`)).slice(0, 16),
      eventTimestamp: new Date(cursor).toISOString(),
      metadata,
    });
  }

  for (let i = 0; i < 6; i++) await pushEvent(files[2], "human", "developer", 2, null, null, { classifierSignal: "human_signal", insertedChars: 22 + i * 3 }, 0);
  await pushEvent(files[4], "imported", "external", 5, null, "manual-copy", { classifierSignal: "imported", insertedChars: 812 }, 1);
  await pushEvent(files[0], "ai", "assistant", 8, "GitHub Copilot", "github-copilot", { classifierSignal: "ai_assisted_signal", insertedLines: 126, elapsedMs: 184 }, 2);
  for (let i = 0; i < 5; i++) await pushEvent(files[0], "human", "developer", 3, null, null, { classifierSignal: "human_modified_ai", editIndex: i + 1 }, 3);
  for (let i = 0; i < 6; i++) await pushEvent(files[3], "human", "developer", 2, null, null, { classifierSignal: "human_signal" }, 4);
  await pushEvent(files[5], "generated", "automation", 10, "docs-generator", "internal", { classifierSignal: "unknown" }, 5);
  for (let i = 0; i < 4; i++) await pushEvent(files[1], "human", "developer", 4, null, null, { classifierSignal: "human_signal" }, 6);
  await pushEvent(files[3], "unknown", "external", 6, null, null, { classifierSignal: "unknown" }, 7);
  await pushEvent(files[5], "unknown", "external", 3, null, null, { classifierSignal: "unknown" }, 7);

  const chain = await buildChain(inputs, (i) => `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`);
  for (const event of chain) {
    out.push(`insert into public.provenance_events
      (id, owner_id, repository_id, source_type, actor_type, provider, tool, file_path, commit_sha,
       content_hash, diff_hash, event_timestamp, metadata_json, previous_event_hash, event_hash)
      values (${sql(event.id)}, ${sql(DEMO_OWNER_ID)}, ${sql(REPOSITORY_ID)}, ${sql(event.sourceType)}, ${sql(event.actorType)},
        ${sql(event.provider)}, ${sql(event.tool)}, ${sql(event.filePath)}, ${sql(event.commitSha)}, ${sql(event.contentHash)},
        ${sql(event.diffHash)}, ${sql(event.eventTimestamp)}, ${jsonb(event.metadata ?? {})}, ${sql(event.previousEventHash)}, ${sql(event.eventHash)});`);
  }

  console.log(out.join("\n\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

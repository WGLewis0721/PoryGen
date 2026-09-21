// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { verifyChain, type ProvenanceEvent } from "@porygen/provenance-core";
import { as, createSupabaseLikeDb } from "./harness";

const DEMO_OWNER = "aecb8db5-cd47-42f5-806f-c9d0a844a0ad";
const SEED = readFileSync(fileURLToPath(new URL("../../scripts/lattice-seed.sql", import.meta.url)), "utf8");

let db: PGlite;

beforeAll(async () => {
  db = await createSupabaseLikeDb();
  await db.query(`insert into auth.users (id, email) values ($1, 'demo@example.com')`, [DEMO_OWNER]);
  await db.exec(SEED);
}, 60_000);

describe("Lattice sample seed", () => {
  it("applies cleanly and is idempotent", async () => {
    await db.exec(SEED);
    const scans = await db.query<{ n: number }>(`select count(*)::int as n from public.scans`);
    expect(scans.rows[0].n).toBe(2);
  });

  it("seeds one tracked finding in each outcome, with coherent history", async () => {
    const tracked = await db.query<{ status: string; file_path: string | null; latest_finding_id: string | null; n: number }>(
      `select t.status, t.file_path, t.latest_finding_id, count(r.id)::int as n
         from public.tracked_findings t join public.finding_resolutions r on r.tracked_finding_id = t.id
        group by t.id order by t.status`,
    );
    expect(tracked.rows.map((r) => r.status)).toEqual(["accepted_risk", "in_review", "resolved"]);
    expect(tracked.rows.every((r) => r.latest_finding_id)).toBe(true);
    const resolved = tracked.rows.find((r) => r.status === "resolved")!;
    expect(resolved.file_path).toBe("src/legacy/sort_v1.py");
    expect(resolved.n).toBe(4);
  });

  it("stores findings from the real pipeline, with keys and side-by-side excerpts", async () => {
    const res = await db.query<{ finding_key: string; evidence_json: Record<string, unknown> }>(
      `select finding_key, evidence_json from public.scan_findings
        where scan_id = '00000000-0000-4000-8000-000000000002' and type = 'structural_similarity' and file_path = 'src/sort/order.py'`,
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].finding_key).toContain("ref-quicksort-py");
    expect(res.rows[0].evidence_json.band).toBe("strong_match");
    expect((res.rows[0].evidence_json.probeExcerpt as { text: string }).text).toContain("def order(values)");
  });

  it("is publicly readable as the demo repository", async () => {
    const rows = await as(db, "anon", null, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public.finding_resolutions`));
    expect(rows.rows[0].n).toBeGreaterThan(0);
  });

  it("keeps an intact editor-attribution hash chain", async () => {
    const res = await db.query<Record<string, unknown>>(`select * from public.provenance_events order by event_timestamp`);
    const chain: ProvenanceEvent[] = res.rows.map((row) => ({
      id: row.id as string,
      ownerId: row.owner_id as string,
      repositoryId: row.repository_id as string,
      filePath: row.file_path as string,
      sourceType: row.source_type as ProvenanceEvent["sourceType"],
      actorType: row.actor_type as ProvenanceEvent["actorType"],
      provider: row.provider as string | null,
      tool: row.tool as string | null,
      commitSha: row.commit_sha as string | null,
      parentEventId: row.parent_event_id as string | null,
      contentHash: row.content_hash as string,
      diffHash: row.diff_hash as string | null,
      eventTimestamp: (row.event_timestamp as Date).toISOString(),
      metadata: row.metadata_json as Record<string, unknown>,
      previousEventHash: row.previous_event_hash as string | null,
      eventHash: row.event_hash as string,
      createdAt: String(row.created_at),
    }));
    expect(chain).toHaveLength(26);
    expect((await verifyChain(chain)).intact).toBe(true);
  });
});

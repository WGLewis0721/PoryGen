// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createSupabaseLikeDb, expectPgError } from "./harness";

const USER_A = "aaaaaaaa-0000-4000-8000-000000000001";
const USER_B = "bbbbbbbb-0000-4000-8000-000000000002";
const DEMO_OWNER = "dddddddd-0000-4000-8000-000000000003";
const REPO_A = "aaaaaaaa-1111-4000-8000-000000000001";
const REPO_B = "bbbbbbbb-1111-4000-8000-000000000002";
const REPO_DEMO = "dddddddd-1111-4000-8000-000000000003";

const SIM_KEY = "similarity:porygen-reference-corpus:ref-quicksort-py:src/sort/order.py";
const DEP_KEY = "license:dependency:npm:gpl-sample-dependency";
const GONE_KEY = "similarity:porygen-reference-corpus:ref-quicksort-py:src/legacy/copy.py";

interface FindingSeed {
  key: string;
  type?: string;
  severity?: string;
  file?: string | null;
  band?: string;
}

interface ScanSeed {
  repo?: string;
  owner?: string;
  findings: FindingSeed[];
  summary?: Record<string, unknown>;
}

const MODERN_SUMMARY = {
  checkedPaths: ["src/sort/order.py", "src/app.ts"],
  ingestedPaths: ["src/sort/order.py", "src/app.ts", "package.json"],
  manifestsChecked: ["package.json"],
  providersRun: ["porygen-reference-corpus"],
  evaluatedFindingTypes: ["structural_similarity", "license"],
  findingsTruncated: false,
};

let db: PGlite;
let scanCounter = 0;

async function seedScan({ repo = REPO_A, owner = USER_A, findings, summary = MODERN_SUMMARY }: ScanSeed): Promise<string> {
  scanCounter++;
  const scanId = `00000000-0000-4000-a000-${String(scanCounter).padStart(12, "0")}`;
  await db.query(
    `insert into public.scans (id, repository_id, owner_id, status, summary_json, risk_level)
     values ($1, $2, $3, 'complete', $4::jsonb, 'review')`,
    [scanId, repo, owner, JSON.stringify(summary)],
  );
  for (const f of findings) {
    await db.query(
      `insert into public.scan_findings (scan_id, type, severity, title, file_path, evidence_json, finding_key)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        scanId,
        f.type ?? "structural_similarity",
        f.severity ?? "blocking",
        `Finding ${f.key}`,
        f.file === undefined ? "src/sort/order.py" : f.file,
        JSON.stringify({ band: f.band ?? "strong_match", provider: { id: "porygen-reference-corpus" } }),
        f.key,
      ],
    );
  }
  return scanId;
}

async function sync(scanId: string, missing: string[] = []) {
  return as(db, "service_role", null, async (tx) => {
    const res = await tx.query<{ result: Record<string, number | boolean> }>(
      `select public.sync_tracked_findings($1, $2::text[]) as result`,
      [scanId, missing],
    );
    return res.rows[0].result;
  });
}

async function tracked(key: string, repo = REPO_A) {
  const res = await db.query<{ id: string; status: string; remediation_pending: boolean; resolved_scan_id: string | null }>(
    `select id, status, remediation_pending, resolved_scan_id from public.tracked_findings where repository_id = $1 and finding_key = $2`,
    [repo, key],
  );
  return res.rows[0];
}

async function history(trackedId: string) {
  const res = await db.query<{ action: string; actor_kind: string; to_status: string; note: string | null; rescan_scan_id: string | null }>(
    `select action, actor_kind, to_status, note, rescan_scan_id from public.finding_resolutions
      where tracked_finding_id = $1 order by created_at, id`,
    [trackedId],
  );
  return res.rows;
}

async function act(userId: string, trackedId: string, action: string, note: string | null = null, revision: string | null = null) {
  return as(db, "authenticated", userId, (tx) =>
    tx.query(`select * from public.record_finding_action($1, $2, $3, $4)`, [trackedId, action, note, revision]),
  );
}

beforeAll(async () => {
  db = await createSupabaseLikeDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com'), ('${DEMO_OWNER}', 'demo@example.com');
    insert into public.repositories (id, owner_id, name, provider, clone_url, is_demo) values
      ('${REPO_A}', '${USER_A}', 'a/app', 'github', 'https://github.com/a/app', false),
      ('${REPO_B}', '${USER_B}', 'b/app', 'github', 'https://github.com/b/app', false),
      ('${REPO_DEMO}', '${DEMO_OWNER}', 'porygen/lattice', 'demo', 'https://porygen.dev/demo/lattice', true);
  `);
}, 60_000);

describe("resolution history migration", () => {
  it("detects actionable findings once, ignoring informational rows", async () => {
    const scan = await seedScan({
      findings: [
        { key: SIM_KEY },
        { key: DEP_KEY, type: "license", severity: "blocking", file: null },
        { key: "similarity:porygen-reference-corpus:ref-debounce-js:src/app.ts", severity: "info", band: "common_pattern", file: "src/app.ts" },
      ],
    });
    expect(await sync(scan)).toMatchObject({ detected: 2, resolved: 0, reopened: 0 });
    expect(await sync(scan)).toMatchObject({ detected: 0, resolved: 0 }); // idempotent
    const sim = await tracked(SIM_KEY);
    expect(sim.status).toBe("open");
    expect((await history(sim.id)).map((h) => h.action)).toEqual(["detected"]);
    expect(await tracked("similarity:porygen-reference-corpus:ref-debounce-js:src/app.ts")).toBeUndefined();
  });

  it("scopes reads to the owner, plus the public demo repository", async () => {
    await seedScan({ repo: REPO_B, owner: USER_B, findings: [{ key: SIM_KEY }] }).then((id) => sync(id));
    await seedScan({ repo: REPO_DEMO, owner: DEMO_OWNER, findings: [{ key: SIM_KEY }] }).then((id) => sync(id));

    const visibleToA = await as(db, "authenticated", USER_A, (tx) =>
      tx.query<{ repository_id: string }>(`select repository_id from public.tracked_findings`),
    );
    const repos = new Set(visibleToA.rows.map((r) => r.repository_id));
    expect(repos.has(REPO_A)).toBe(true);
    expect(repos.has(REPO_DEMO)).toBe(true);
    expect(repos.has(REPO_B)).toBe(false);

    const anonRows = await as(db, "anon", null, (tx) => tx.query<{ repository_id: string }>(`select repository_id from public.tracked_findings`));
    expect(anonRows.rows.every((r) => r.repository_id === REPO_DEMO)).toBe(true);
  });

  it("blocks direct client writes to tracked findings and history", async () => {
    const sim = await tracked(SIM_KEY);
    await expectPgError(
      as(db, "authenticated", USER_A, (tx) => tx.query(`update public.tracked_findings set status = 'resolved' where id = $1`, [sim.id]).then((r) => {
        if (r.affectedRows === 0) throw new Error("row-level security: no rows updated");
      })),
      /row-level security|permission denied/,
    );
    await expectPgError(
      as(db, "authenticated", USER_A, (tx) =>
        tx.query(
          `insert into public.finding_resolutions (tracked_finding_id, repository_id, owner_id, actor_kind, action, to_status)
           values ($1, $2, $3, 'user', 'rescan_clean', 'resolved')`,
          [sim.id, REPO_A, USER_A],
        ),
      ),
      /row-level security|permission denied/,
    );
  });

  it("keeps history append-only, even for the service role", async () => {
    await expectPgError(
      as(db, "service_role", null, (tx) => tx.query(`update public.finding_resolutions set note = 'rewritten'`)),
      /append-only/,
    );
  });

  it("lets only the scanner reconcile scans", async () => {
    const scan = await seedScan({ findings: [{ key: SIM_KEY }] });
    await expectPgError(
      as(db, "authenticated", USER_A, (tx) => tx.query(`select public.sync_tracked_findings($1)`, [scan])),
      /permission denied/,
    );
  });

  it("enforces ownership, transitions, and reasons on user decisions", async () => {
    const dep = await tracked(DEP_KEY);
    await expectPgError(act(USER_B, dep.id, "review_started"), /finding not found/);
    await expectPgError(act(USER_A, dep.id, "accepted_risk"), /reason is required/);
    await expectPgError(act(USER_A, dep.id, "reopened"), /only an accepted or dismissed/);
    await expectPgError(act(USER_A, dep.id, "rescan_clean"), /unsupported action/);

    const demo = await tracked(SIM_KEY, REPO_DEMO);
    await expectPgError(act(USER_A, demo.id, "review_started"), /finding not found/);

    await act(USER_A, dep.id, "accepted_risk", "Internal tool only; never distributed.");
    expect((await tracked(DEP_KEY)).status).toBe("accepted_risk");
  });

  it("resolves a finding after a recorded fix and a clean rescan that re-checked the file", async () => {
    const sim = await tracked(SIM_KEY);
    await act(USER_A, sim.id, "review_started");
    await act(USER_A, sim.id, "remediation_recorded", "Replaced with the standard library sort.", "b81e0d4");
    expect((await tracked(SIM_KEY)).remediation_pending).toBe(true);

    // The accepted-risk dependency is still present: the decision must survive.
    const rescan = await seedScan({ findings: [{ key: DEP_KEY, type: "license", severity: "blocking", file: null }] });
    expect(await sync(rescan)).toMatchObject({ resolved: 1, detected: 0 });

    const after = await tracked(SIM_KEY);
    expect(after.status).toBe("resolved");
    expect(after.resolved_scan_id).toBe(rescan);
    expect(after.remediation_pending).toBe(false);
    const steps = await history(sim.id);
    expect(steps.map((h) => h.action)).toEqual(["detected", "review_started", "remediation_recorded", "rescan_clean"]);
    expect(steps.at(-1)).toMatchObject({ actor_kind: "system", to_status: "resolved", rescan_scan_id: rescan });
    expect((await tracked(DEP_KEY)).status).toBe("accepted_risk");
  });

  it("reopens a resolved finding when it comes back", async () => {
    const scan = await seedScan({ findings: [{ key: SIM_KEY }] });
    expect(await sync(scan)).toMatchObject({ reopened: 1 });
    const sim = await tracked(SIM_KEY);
    expect(sim.status).toBe("open");
    expect((await history(sim.id)).at(-1)?.action).toBe("reopened");
  });

  it("records a failed fix when the rescan still detects the match", async () => {
    const sim = await tracked(SIM_KEY);
    await act(USER_A, sim.id, "remediation_recorded", "Renamed variables.");
    const scan = await seedScan({ findings: [{ key: SIM_KEY }] });
    expect(await sync(scan)).toMatchObject({ stillDetected: 1, resolved: 0 });
    const after = await tracked(SIM_KEY);
    expect(after.status).toBe("in_review");
    expect(after.remediation_pending).toBe(false);
    expect((await history(sim.id)).at(-1)?.action).toBe("rescan_still_detected");
  });

  it("never resolves from a scan that didn't re-check the file, was truncated, or predates the contract", async () => {
    const notChecked = await seedScan({ findings: [], summary: { ...MODERN_SUMMARY, checkedPaths: ["src/app.ts"] } });
    expect(await sync(notChecked)).toMatchObject({ resolved: 0 });

    const otherProvider = await seedScan({ findings: [], summary: { ...MODERN_SUMMARY, providersRun: ["some-future-provider"] } });
    expect(await sync(otherProvider)).toMatchObject({ resolved: 0 });

    const truncated = await seedScan({ findings: [], summary: { ...MODERN_SUMMARY, findingsTruncated: true } });
    expect(await sync(truncated)).toMatchObject({ resolved: 0, truncated: true });

    const legacy = await seedScan({ findings: [], summary: { terminalLog: [] } });
    expect(await sync(legacy)).toMatchObject({ resolved: 0 });

    expect((await tracked(SIM_KEY)).status).toBe("in_review");
  });

  it("resolves a finding whose file was deleted from the repository", async () => {
    const first = await seedScan({
      findings: [{ key: SIM_KEY }, { key: GONE_KEY, file: "src/legacy/copy.py" }],
      summary: { ...MODERN_SUMMARY, checkedPaths: [...MODERN_SUMMARY.checkedPaths, "src/legacy/copy.py"] },
    });
    await sync(first);
    const gone = await tracked(GONE_KEY);
    expect(gone.status).toBe("open");
    expect((await tracked(SIM_KEY)).status).toBe("in_review");

    const rescan = await seedScan({ findings: [] });
    const result = await sync(rescan, ["src/legacy/copy.py"]);
    expect(result).toMatchObject({ resolved: 2 }); // the deleted file, plus SIM_KEY (re-checked, no longer present)
    const steps = await history(gone.id);
    expect(steps.at(-1)?.note).toMatch(/no longer in the repository/);
  });

  it("leaves the pre-existing scan and finding policies intact", async () => {
    const scansForB = await as(db, "authenticated", USER_B, (tx) =>
      tx.query<{ repository_id: string }>(`select repository_id from public.scans`),
    );
    expect(scansForB.rows.some((r) => r.repository_id === REPO_A)).toBe(false);
    expect(scansForB.rows.some((r) => r.repository_id === REPO_DEMO)).toBe(true);

    const findingsForAnon = await as(db, "anon", null, (tx) =>
      tx.query<{ scan_id: string }>(`select sf.scan_id from public.scan_findings sf join public.scans s on s.id = sf.scan_id where s.repository_id <> $1`, [REPO_DEMO]),
    );
    expect(findingsForAnon.rows).toHaveLength(0);

    await expectPgError(
      as(db, "authenticated", USER_B, (tx) =>
        tx.query(`insert into public.scans (repository_id, owner_id, status) values ($1, $2, 'queued')`, [REPO_A, USER_A]),
      ),
      /row-level security/,
    );
  });

  it("refuses to reconcile scans that aren't complete", async () => {
    await db.query(
      `insert into public.scans (id, repository_id, owner_id, status) values ('00000000-0000-4000-b000-000000000001', $1, $2, 'fingerprinting')`,
      [REPO_A, USER_A],
    );
    await expectPgError(sync("00000000-0000-4000-b000-000000000001"), /not complete/);
  });
});

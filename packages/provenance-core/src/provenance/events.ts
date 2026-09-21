// Canonical provenance event representation and the append-only hash chain.
//
// Every event's `eventHash` commits to the event's own fields *and* the prior
// event's hash, so the chain is tamper-evident: editing or removing any past
// event changes every hash after it. This is a hash chain we compute and
// store ourselves — "tamper-evident," not "cryptographically notarized by a
// third party" — see the Sigstore boundary below and docs/PROVENANCE.md.

import { sha256Hex } from "../fingerprint.js";
import type { ProvenanceEvent, ProvenanceEventInput } from "../types.js";

/** Deterministic JSON serialization (sorted keys) so hashing is reproducible. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Builds the exact field set that gets hashed, with every optional field
 * explicitly defaulted to `null`. This is deliberate: `canonicalize` sorts
 * and stringifies whatever keys are *present*, so a caller who omits an
 * optional field (e.g. a fresh `ProvenanceEventInput` literal that never
 * mentions `parentEventId`) and a caller who reads it back from a database
 * row (which always has the column, `null` or not) would otherwise produce
 * different canonicalized strings — and therefore different hashes — for
 * the same logical event. Normalizing here makes hashing independent of
 * which optional keys a given writer happened to include.
 *
 * `eventTimestamp` is additionally re-parsed and re-serialized through
 * `Date`. Postgres's `timestamptz` text output ("2026-09-15 09:02:00+00")
 * is not byte-identical to the ISO-8601 string ("2026-09-15T09:02:00.000Z")
 * this library writes, even though both name the same instant — so hashing
 * the raw string a caller happens to have would make every event fail
 * verification the moment it round-trips through the database. Hashing the
 * instant, not its string spelling, keeps verification stable across that
 * round-trip.
 */
function canonicalEventShape(input: ProvenanceEventInput, previousEventHash: string | null) {
  return {
    ownerId: input.ownerId ?? null,
    repositoryId: input.repositoryId,
    filePath: input.filePath,
    sourceType: input.sourceType,
    actorType: input.actorType,
    provider: input.provider ?? null,
    tool: input.tool ?? null,
    commitSha: input.commitSha ?? null,
    parentEventId: input.parentEventId ?? null,
    contentHash: input.contentHash,
    diffHash: input.diffHash ?? null,
    eventTimestamp: new Date(input.eventTimestamp).toISOString(),
    metadata: input.metadata ?? {},
    previousEventHash,
  };
}

export async function hashEvent(
  input: ProvenanceEventInput,
  previousEventHash: string | null,
): Promise<string> {
  return sha256Hex(canonicalize(canonicalEventShape(input, previousEventHash)));
}

/**
 * Appends one event to a chain, computing its id (if the caller doesn't
 * supply one) and its hash-chain linkage from the last event in `existing`.
 */
export async function appendEvent(
  existing: ProvenanceEvent[],
  input: ProvenanceEventInput,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<ProvenanceEvent> {
  const previous = existing.length > 0 ? existing[existing.length - 1] : null;
  const previousEventHash = previous ? previous.eventHash : null;
  const eventHash = await hashEvent(input, previousEventHash);
  return {
    ...input,
    id: makeId(),
    previousEventHash,
    eventHash,
    createdAt: new Date().toISOString(),
  };
}

/** Builds an entire chain from a list of inputs in order, e.g. for seed data. */
export async function buildChain(
  inputs: ProvenanceEventInput[],
  makeId: (index: number) => string = (i) => `seed-event-${i}`,
): Promise<ProvenanceEvent[]> {
  const chain: ProvenanceEvent[] = [];
  for (let i = 0; i < inputs.length; i++) {
    // eslint-disable-next-line no-await-in-loop -- chain hashing is inherently sequential
    chain.push(await appendEvent(chain, inputs[i], () => makeId(i)));
  }
  return chain;
}

export interface ChainVerification {
  intact: boolean;
  brokenAt: string | null;
  eventCount: number;
}

/** Recomputes every hash in a chain and reports the first break, if any. */
export async function verifyChain(chain: ProvenanceEvent[]): Promise<ChainVerification> {
  let previousEventHash: string | null = null;
  for (const event of chain) {
    if (event.previousEventHash !== previousEventHash) {
      return { intact: false, brokenAt: event.id, eventCount: chain.length };
    }
    const { id, previousEventHash: _p, eventHash, createdAt: _c, ...input } = event;
    const recomputed = await hashEvent(input as ProvenanceEventInput, previousEventHash);
    if (recomputed !== eventHash) {
      return { intact: false, brokenAt: event.id, eventCount: chain.length };
    }
    previousEventHash = eventHash;
  }
  return { intact: true, brokenAt: null, eventCount: chain.length };
}

export interface InTotoStatement {
  _type: "https://in-toto.io/Statement/v1";
  subject: Array<{ name: string; digest: { sha256: string } }>;
  predicateType: "https://porygen.dev/attestation/v1";
  predicate: {
    scanId: string;
    policyVersion: string;
    generatedAt: string;
    chain: ChainVerification;
    eventCount: number;
    firstEventHash: string | null;
    lastEventHash: string | null;
  };
}

/** Builds an in-toto Statement-shaped payload for a batch of provenance events. */
export async function buildInTotoStatement(params: {
  repositoryName: string;
  repositoryContentHash: string;
  scanId: string;
  policyVersion: string;
  events: ProvenanceEvent[];
}): Promise<InTotoStatement> {
  const chain = await verifyChain(params.events);
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: params.repositoryName, digest: { sha256: params.repositoryContentHash } }],
    predicateType: "https://porygen.dev/attestation/v1",
    predicate: {
      scanId: params.scanId,
      policyVersion: params.policyVersion,
      generatedAt: new Date().toISOString(),
      chain,
      eventCount: params.events.length,
      firstEventHash: params.events[0]?.eventHash ?? null,
      lastEventHash: params.events[params.events.length - 1]?.eventHash ?? null,
    },
  };
}

import { describe, expect, it } from "vitest";
import { buildChain, verifyChain, buildInTotoStatement, canonicalize } from "../src/provenance/events.js";
import type { ProvenanceEventInput } from "../src/types.js";

function makeInput(overrides: Partial<ProvenanceEventInput> = {}): ProvenanceEventInput {
  return {
    repositoryId: "repo-1",
    filePath: "src/app.ts",
    sourceType: "human",
    actorType: "developer",
    contentHash: "abc123",
    eventTimestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("canonicalize", () => {
  it("sorts object keys so field order never changes the hash", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });
});

describe("provenance hash chain", () => {
  it("links each event to the previous event's hash", async () => {
    const chain = await buildChain([makeInput(), makeInput({ filePath: "src/other.ts" })]);
    expect(chain[0].previousEventHash).toBeNull();
    expect(chain[1].previousEventHash).toBe(chain[0].eventHash);
  });

  it("verifies an untampered chain as intact", async () => {
    const chain = await buildChain([makeInput(), makeInput(), makeInput()]);
    const result = await verifyChain(chain);
    expect(result.intact).toBe(true);
    expect(result.eventCount).toBe(3);
  });

  it("detects tampering with an event's fields", async () => {
    const chain = await buildChain([makeInput(), makeInput()]);
    chain[0].contentHash = "tampered";
    const result = await verifyChain(chain);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(chain[0].id);
  });

  it("detects a broken previous-hash link", async () => {
    const chain = await buildChain([makeInput(), makeInput()]);
    chain[1].previousEventHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const result = await verifyChain(chain);
    expect(result.intact).toBe(false);
  });

  it("produces two different hashes for two events with different content", async () => {
    const chain = await buildChain([makeInput({ contentHash: "a" }), makeInput({ contentHash: "b" })]);
    expect(chain[0].eventHash).not.toBe(chain[1].eventHash);
  });
});

describe("in-toto statement", () => {
  it("summarizes chain state and event counts", async () => {
    const events = await buildChain([makeInput(), makeInput()]);
    const statement = await buildInTotoStatement({
      repositoryName: "lattice",
      repositoryContentHash: "deadbeef",
      scanId: "scan-1",
      policyVersion: "2026.1",
      events,
    });
    expect(statement._type).toBe("https://in-toto.io/Statement/v1");
    expect(statement.predicate.eventCount).toBe(2);
    expect(statement.predicate.chain.intact).toBe(true);
    expect(statement.predicate.lastEventHash).toBe(events[1].eventHash);
  });
});

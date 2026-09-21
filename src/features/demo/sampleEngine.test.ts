import { describe, expect, it } from "vitest";
import { compareToSample, runSampleScan, SAMPLE_PROVIDER_ID } from "./sampleEngine";
import { RATE_LIMIT_AFTER, RATE_LIMIT_PATH, simulatedPaths, SAMPLE_FILES_BEFORE, SAMPLE_REPOSITORY } from "./sampleRepo";
import { SAMPLE_MATCH_SNAPSHOT } from "./sampleSnapshot";

describe("sample demo engine", () => {
  it("finds a strong, GPL-licensed source match in the agent-written rate limiter", async () => {
    const result = await runSampleScan("before");
    const match = result.findings.find((f) => f.file_path === RATE_LIMIT_PATH && f.type === "structural_similarity");
    expect(match).toBeDefined();
    const evidence = match!.evidence_json as Record<string, unknown>;
    expect(evidence.band).toBe("strong_match");
    expect(match!.severity).toBe("blocking");
    expect((evidence.provider as { id: string; scope: string }).scope).toBe("sample");
    expect((evidence.provider as { id: string }).id).toBe(SAMPLE_PROVIDER_ID);
    expect(result.summary.similarity).toEqual({ clear: 1, commonPattern: 1, reviewSuggested: 1, strongMatch: 1 });
  });

  it("keeps the homepage snapshot identical to the engine's output", async () => {
    const result = await runSampleScan("before");
    const match = result.findings.find((f) => f.file_path === RATE_LIMIT_PATH && f.type === "structural_similarity")!;
    const evidence = match.evidence_json as Record<string, unknown>;
    expect(Number((evidence.containment as number).toFixed(3))).toBe(SAMPLE_MATCH_SNAPSHOT.containment);
    expect(evidence.sharedFingerprints).toBe(SAMPLE_MATCH_SNAPSHOT.sharedFingerprints);
    expect(evidence.candidateFingerprints).toBe(SAMPLE_MATCH_SNAPSHOT.candidateFingerprints);
    expect(evidence.probeLines).toEqual(SAMPLE_MATCH_SNAPSHOT.probeLines);
    expect(evidence.candidateLines).toEqual(SAMPLE_MATCH_SNAPSHOT.candidateLines);
    expect((evidence.candidate as { license: string }).license).toBe(SAMPLE_MATCH_SNAPSHOT.license);
  });

  it("clears the match after the replacement, with a below-threshold rescan score", async () => {
    const result = await runSampleScan("after");
    expect(result.findings.some((f) => f.file_path === RATE_LIMIT_PATH && f.type === "structural_similarity")).toBe(false);
    expect(result.summary.similarity.strongMatch).toBe(0);
    const score = await compareToSample(RATE_LIMIT_PATH, RATE_LIMIT_AFTER, "sample-slidewindow");
    expect(score).toBeLessThan(0.55);
    expect(score).toBeCloseTo(SAMPLE_MATCH_SNAPSHOT.afterContainment, 4);
  });

  it("pads the sample repository to its stated size with unique, deterministic paths", () => {
    const paths = simulatedPaths(SAMPLE_REPOSITORY.totalFiles - SAMPLE_FILES_BEFORE.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length + SAMPLE_FILES_BEFORE.length).toBe(SAMPLE_REPOSITORY.totalFiles);
    expect(simulatedPaths(5)).toEqual(simulatedPaths(5));
  });
});

import { describe, expect, it } from "vitest";
import { ACTIONS, allowedActions, stagesFromHistory } from "./resolution";
import type { ResolutionAction, TrackedStatus } from "./dbTypes";

function h(action: ResolutionAction, actor: "user" | "system", to: TrackedStatus, minute: number) {
  return { action, actor_kind: actor, to_status: to, created_at: `2026-09-21T10:${String(minute).padStart(2, "0")}:00Z` };
}

describe("allowedActions", () => {
  it("mirrors the transitions record_finding_action accepts", () => {
    expect(allowedActions("open")).toEqual(["review_started", "remediation_recorded", "dismissed_false_positive", "accepted_risk", "note"]);
    expect(allowedActions("in_review")).not.toContain("review_started");
    expect(allowedActions("accepted_risk")).toEqual(["reopened", "note"]);
    expect(allowedActions("dismissed_false_positive")).toEqual(["reopened", "note"]);
    expect(allowedActions("resolved")).toEqual(["note"]);
  });

  it("never offers a person the ability to resolve a finding", () => {
    for (const status of ["open", "in_review", "resolved", "accepted_risk", "dismissed_false_positive"] as TrackedStatus[]) {
      expect(allowedActions(status)).not.toContain("rescan_clean" as never);
    }
  });

  it("requires a reason to accept risk or dismiss", () => {
    expect(ACTIONS.accepted_risk.requiresReason).toBe(true);
    expect(ACTIONS.dismissed_false_positive.requiresReason).toBe(true);
    expect(ACTIONS.review_started.requiresReason).toBe(false);
  });
});

describe("stagesFromHistory", () => {
  it("walks found → reviewed → remediated → rescanned → resolved", () => {
    const stages = stagesFromHistory([
      h("detected", "system", "open", 0),
      h("review_started", "user", "in_review", 1),
      h("remediation_recorded", "user", "in_review", 2),
      h("rescan_clean", "system", "resolved", 3),
    ]);
    expect(stages.map((s) => [s.key, s.done])).toEqual([
      ["found", true],
      ["reviewed", true],
      ["remediated", true],
      ["rescanned", true],
      ["resolved", true],
    ]);
  });

  it("counts a recorded fix as reviewed even without an explicit review step", () => {
    const stages = stagesFromHistory([h("detected", "system", "open", 0), h("remediation_recorded", "user", "in_review", 1)]);
    expect(stages.find((s) => s.key === "reviewed")?.done).toBe(true);
    expect(stages.find((s) => s.key === "resolved")?.done).toBe(false);
  });

  it("restarts the cycle after a reopen", () => {
    const stages = stagesFromHistory([
      h("detected", "system", "open", 0),
      h("remediation_recorded", "user", "in_review", 1),
      h("rescan_clean", "system", "resolved", 2),
      h("reopened", "system", "open", 3),
    ]);
    expect(stages.find((s) => s.key === "found")?.done).toBe(true);
    expect(stages.filter((s) => s.key !== "found").every((s) => !s.done)).toBe(true);
  });
});

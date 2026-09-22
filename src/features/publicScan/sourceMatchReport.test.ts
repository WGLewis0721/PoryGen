import { describe, expect, it, vi } from "vitest";
import { downloadSourceMatchReport, renderSourceMatchReport } from "./sourceMatchReport";
import { reportFixture } from "./reportFixture";


const context = { label: "My project", completedAt: "2026-09-22T12:00:00Z" };
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("Source Match Report", () => {
  it("downloads a local HTML artifact and releases its object URL", () => {
    vi.useFakeTimers();
    const create = vi.fn((_blob: Blob) => "blob:report");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {
      expect(this.download).toBe("porygen-source-match-report-2026-09-22.html");
      expect(this.href).toBe("blob:report");
    });
    try {
      downloadSourceMatchReport(reportFixture(), {}, context);
      expect(click).toHaveBeenCalledOnce();
      expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(revoke).toHaveBeenCalledWith("blob:report");
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("includes scan scope, exact source metadata and current decisions, including dismissed evidence", () => {
    const doc = parse(renderSourceMatchReport(reportFixture(), { match1: { status: "dismissed", reason: "Attribution added", at: "2026-09-22T13:00:00Z" }, stale: { status: "reviewing", at: "old" } }, context));
    expect(doc.body.textContent).toContain("Source Match Report");
    expect(doc.body.textContent).toContain("lines 5–12");
    expect(doc.body.textContent).toContain("Attribution added");
    expect(doc.body.textContent).toContain("function example() {}");
    expect(doc.body.textContent).toContain("deadbeef");
    expect(doc.body.textContent).toContain("src/starter");
    expect(doc.body.textContent).toContain("0 open or in review");
    expect(doc.querySelector('a[href$="#L8-L15"]')).not.toBeNull();
    expect(doc.querySelector('a[href$="/deadbeef/LICENSE"]')?.textContent).toBe("MIT");
    expect(doc.body.textContent).not.toContain("stale");
  });

  it("keeps uploaded scope, client omissions and exclusion counts honest", () => {
    const result = reportFixture();
    result.source = { type: "files", transient: true };
    result.repository = { name: "Local project", url: null, commit: "digest", commitUrl: null, defaultBranch: null };
    result.scan.treeComplete = false;
    const doc = parse(renderSourceMatchReport(result, {}, { ...context, folder: { sent: 1, excluded: 3, omittedDependencies: 8, omittedBinary: 1, omittedTooLarge: 2, trimmed: 4 } }));
    expect(doc.body.textContent).toContain("Partial scan");
    expect(doc.body.textContent).toContain("Content digest (not a Git commit)");
    expect(doc.body.textContent).toContain("3 additional entries excluded");
    expect(doc.body.textContent).toContain("2 oversized files omitted");
    expect(doc.body.textContent).toContain("Only submitted files were considered");
    expect(parse(renderSourceMatchReport(result, {}, context)).body.textContent).toContain("Scan completed within the submitted scope");
  });

  it("distinguishes empty, partial, no-match and capped possible evidence", () => {
    const result = reportFixture();
    result.findings = [];
    result.summary = { strong: 0, possible: 30, insufficient: 2, total: 32 };
    result.scan.partial = true;
    result.scan.incompleteReasons = { provider_failure: 1 };
    let text = parse(renderSourceMatchReport(result, {}, context)).body.textContent;
    expect(text).toContain("Partial scan");
    expect(text).toContain("provider failure: 1");
    expect(text).toContain("Included: 0 of 30");
    expect(text).toContain("not proof of originality");
    result.scan.checkedFiles = [];
    text = parse(renderSourceMatchReport(result, {}, context)).body.textContent;
    expect(text).toContain("No eligible files were checked");
    expect(text).toContain("This is not a clean result");
  });

  it("treats untrusted code, labels and URLs as inert text with no remote resources", () => {
    const result = reportFixture();
    const attack = '</pre><script>alert(1)</script><img src="https://evil.test" onerror="alert(2)">';
    result.findings[0].customer.excerpt = attack;
    result.findings[0].publicSource!.url = "javascript:alert(1)";
    result.findings[0].publicSource!.licenseUrl = "data:text/html,evil";
    const doc = parse(renderSourceMatchReport(result, { match1: { status: "dismissed", reason: attack, at: "today" } }, { ...context, label: attack }));
    expect(doc.querySelectorAll("script,img,iframe,link,object")).toHaveLength(0);
    expect(doc.querySelectorAll('a[href^="javascript:"],a[href^="data:"]')).toHaveLength(0);
    expect(doc.querySelector("pre")?.textContent).toBe(attack);
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
  });
});

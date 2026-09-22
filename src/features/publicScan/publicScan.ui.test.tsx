import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TERMS_VERSION } from "../legal/termsAcceptance";
import { PublicScanPage } from "./PublicScanPage";

const terms = { version: TERMS_VERSION, acceptedAt: "2026-09-22T12:00:00.000Z" };

function renderScan(path = "/scan") {
  localStorage.setItem("porygen.terms.acceptance", JSON.stringify(terms));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicScanPage />
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("public scan page", () => {
  it("still posts the existing GitHub request", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        repository: { name: "sindresorhus/yocto-queue", url: "https://github.com/sindresorhus/yocto-queue", commit: "abcdef1234567890", commitUrl: "https://github.com/sindresorhus/yocto-queue/commit/abcdef1234567890", defaultBranch: "main" },
        coverage: { claim: "This lab searches a fixed corpus." },
        scan: { elapsedMs: 1200, fetchedFiles: 1, fetchedBytes: 40, partial: false, checkedFiles: ["index.js"], supportedFilesInTree: ["index.js"], treeComplete: true, skippedCount: 0, incompleteSupportedFiles: 0, incompleteReasons: {} },
        summary: { strong: 0, possible: 0, insufficient: 1, total: 1 },
        findings: [],
        disclaimer: "Similarity is evidence.",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderScan();
    fireEvent.change(screen.getByLabelText("Public repository URL"), { target: { value: "sindresorhus/yocto-queue" } });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const githubCall = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(githubCall[0][1]?.body));
    expect(githubCall[0][0]).toBe("/api/scan");
    expect(body).toEqual({
      repositoryUrl: "https://github.com/sindresorhus/yocto-queue",
      termsVersion: terms.version,
      termsAcceptedAt: terms.acceptedAt,
    });
    expect(await screen.findByRole("heading", { name: /1 file checked/ })).toBeInTheDocument();
  });

  it("renders a structured upload error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({
      error: "The expanded project exceeds the size limit.",
      code: "EXTRACTED_SIZE_LIMIT",
      retryable: false,
    }, 413)));
    renderScan();
    fireEvent.click(screen.getByRole("radio", { name: ".zip project" }));
    const file = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "project.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("Project .zip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The expanded project exceeds the size limit. (EXTRACTED_SIZE_LIMIT)");
  });

  it("builds a folder request, excludes starter paths, and does not store the upload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        repository: { name: "Local project", url: null, commit: "abc123digest", commitUrl: null, defaultBranch: null },
        source: { type: "files", transient: true },
        coverage: { claim: "This lab searches a fixed corpus." },
        scan: {
          exclusions: ["my-app/src/starter"],
          excludedFiles: 0,
          ingestion: { entries: 1, declaredBytes: 10, extractedBytes: 10, skippedReasons: {}, selectionComplete: true, empty: false },
          elapsedMs: 40,
          fetchedFiles: 1,
          fetchedBytes: 10,
          partial: false,
          checkedFiles: ["my-app/src/app.ts"],
          supportedFilesInTree: ["my-app/src/app.ts"],
          treeComplete: false,
          skippedCount: 0,
          incompleteSupportedFiles: 0,
          incompleteReasons: {},
        },
        summary: { strong: 0, possible: 0, insufficient: 0, total: 0 },
        findings: [],
        disclaimer: "Similarity is evidence.",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderScan();
    fireEvent.click(screen.getByRole("radio", { name: "Local folder" }));
    const app = new File(["export const app = 1;\n"], "app.ts", { type: "text/plain" });
    Object.defineProperty(app, "webkitRelativePath", { value: "my-app/src/app.ts" });
    const starter = new File(["export const starter = 1;\n"], "index.ts", { type: "text/plain" });
    Object.defineProperty(starter, "webkitRelativePath", { value: "my-app/src/starter/index.ts" });
    fireEvent.change(screen.getByLabelText("Project folder"), { target: { files: [app, starter] } });
    fireEvent.change(screen.getByLabelText(/Exclude starter/i), { target: { value: "my-app/src/starter" } });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const folderCall = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const body = JSON.parse(String(folderCall[0][1]?.body));
    expect(body.sourceType).toBe("files");
    expect(body.files).toEqual([{ path: "my-app/src/app.ts", content: "export const app = 1;\n" }]);
    expect(body.exclusions).toEqual(["my-app/src/starter"]);
    expect(body.repositoryUrl).toBeUndefined();
    expect(body.archiveBase64).toBeUndefined();
    expect(setItem.mock.calls.map((call) => call[0])).not.toContain("porygen.scan.local project");
    expect(screen.getByText(/content digest, not a Git commit/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Local project" })).not.toBeInTheDocument();
  });

  it("says an empty upload scanned nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({
      repository: { name: "Local project", url: null, commit: "digest", commitUrl: null, defaultBranch: null },
      source: { type: "zip", transient: true },
      coverage: { claim: "This lab searches a fixed corpus." },
      scan: {
        exclusions: [],
        excludedFiles: 0,
        ingestion: { entries: 0, declaredBytes: 0, extractedBytes: 0, skippedReasons: {}, selectionComplete: true, empty: true },
        elapsedMs: 5,
        fetchedFiles: 0,
        fetchedBytes: 0,
        partial: false,
        checkedFiles: [],
        supportedFilesInTree: [],
        treeComplete: false,
        skippedCount: 0,
        incompleteSupportedFiles: 0,
        incompleteReasons: {},
      },
      summary: { strong: 0, possible: 0, insufficient: 0, total: 0 },
      findings: [],
      disclaimer: "Similarity is evidence.",
    })));
    renderScan();
    fireEvent.click(screen.getByRole("radio", { name: ".zip project" }));
    const file = new File([Uint8Array.from([0x50, 0x4b, 0x05, 0x06])], "empty.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("Project .zip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    const heading = await screen.findByRole("heading", { name: "No eligible source files were scanned" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/does not mean the project is clear/i)).toBeInTheDocument();
    expect(screen.queryByText(/No strong source match/)).not.toBeInTheDocument();
  });

  it("leads with what to decide before launch and records each decision", async () => {
    const strongFinding = {
      id: "f1",
      classification: "strong_match",
      customer: { path: "src/auth.ts", lines: { start: 10, end: 20 }, excerpt: "const a = 1;" },
      publicSource: {
        repository: "vendor/lib",
        commit: "abcdef1234567890",
        path: "src/index.js",
        url: "https://github.com/vendor/lib/blob/abcdef1/src/index.js",
        lines: { start: 5, end: 15 },
        excerpt: "const a = 1;",
        license: "AGPL-3.0",
        licenseUrl: "https://github.com/vendor/lib/blob/abcdef1/LICENSE",
      },
      metrics: { customerCoverage: 0.9, sourceCoverage: 0.8, matchedTokens: 60, contiguousTokens: 45 },
      explanation: "Strong similarity evidence.",
    };
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        repository: { name: "acme/app", url: "https://github.com/acme/app", commit: "abcdef1234567890", commitUrl: "https://github.com/acme/app/commit/abcdef1234567890", defaultBranch: "main" },
        coverage: { claim: "This lab searches a fixed corpus." },
        scan: { elapsedMs: 900, fetchedFiles: 3, fetchedBytes: 400, partial: false, checkedFiles: ["src/auth.ts"], supportedFilesInTree: ["src/auth.ts"], treeComplete: true, skippedCount: 0, incompleteSupportedFiles: 0, incompleteReasons: {} },
        summary: { strong: 1, possible: 0, insufficient: 0, total: 1 },
        findings: [strongFinding],
        disclaimer: "Similarity is evidence.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderScan("/scan?repo=https://github.com/acme/app");

    await screen.findByText("Before you launch");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("1 strong source match to review");
    // The license consequence is stated as a possibility, not a conclusion.
    expect(screen.getByText(/may be required to release your own source/)).toBeInTheDocument();

    // Every action in the brief is offered, and choosing one settles the finding.
    for (const label of ["Replace with a library", "Rewrite this myself", "Accept and document", "Dismiss"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Replace with a library" }));
    await waitFor(() => expect(screen.getByText(/Planned: replace with a library/)).toBeInTheDocument());
    expect(screen.getByText("Every strong match has a decision recorded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  });

  it("requires a note before a risk can be accepted", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        repository: { name: "acme/app", url: "https://github.com/acme/app", commit: "abcdef1234567890", commitUrl: "https://github.com/acme/app/commit/abcdef1234567890", defaultBranch: "main" },
        coverage: { claim: "This lab searches a fixed corpus." },
        scan: { elapsedMs: 900, fetchedFiles: 3, fetchedBytes: 400, partial: false, checkedFiles: ["src/auth.ts"], supportedFilesInTree: ["src/auth.ts"], treeComplete: true, skippedCount: 0, incompleteSupportedFiles: 0, incompleteReasons: {} },
        summary: { strong: 1, possible: 0, insufficient: 0, total: 1 },
        findings: [
          {
            id: "f1",
            classification: "strong_match",
            customer: { path: "src/auth.ts", lines: { start: 1, end: 5 }, excerpt: "x" },
            publicSource: { repository: "vendor/lib", commit: "abcdef1234567890", path: "i.js", url: "https://github.com/vendor/lib", lines: { start: 1, end: 5 }, excerpt: "x", license: "MIT" },
            explanation: "Strong similarity evidence.",
          },
        ],
        disclaimer: "Similarity is evidence.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderScan("/scan?repo=https://github.com/acme/app");

    fireEvent.click(await screen.findByRole("button", { name: "Accept and document" }));
    const submit = screen.getByRole("button", { name: "Record this decision" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Note for your records/), { target: { value: "Added the MIT notice" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText(/Accepted and documented: Added the MIT notice/)).toBeInTheDocument());
  });

});

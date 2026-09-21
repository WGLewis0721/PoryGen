import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { DemoPage } from "./DemoPage";

function renderDemo() {
  return render(
    <MemoryRouter initialEntries={["/demo"]}>
      <AuthProvider>
        <DemoPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Reduced motion: the demo skips its scan animation, which also keeps this test fast.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public sample demo", () => {
  it("is labelled as a sample and needs no account", () => {
    renderDemo();
    expect(screen.getByText("Sample interactive demo")).toBeInTheDocument();
    expect(screen.getByText(/Fictional repository and sources/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run sample scan/i })).toBeEnabled();
  });

  it("walks scan → finding → fix → rescan → resolved with engine-computed scores", async () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /run sample scan/i }));

    expect(await screen.findByRole("heading", { name: /312 files checked/ })).toBeInTheDocument();
    const counts = screen.getByLabelText("Scan results");
    expect(within(counts).getByText("309")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open finding/i }));
    expect(await screen.findByRole("heading", { name: /strong source match in src\/api\/rateLimit\.ts/i })).toBeInTheDocument();
    expect(screen.getAllByText("93%").length).toBeGreaterThan(0);
    expect(screen.getByText(/74 of 80 structural fingerprints shared/)).toBeInTheDocument();
    expect(screen.getAllByText(/GPL-3\.0/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /replace it/i }));
    expect(await screen.findByRole("heading", { name: /the replacement/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /record fix and rescan/i }));
    expect(await screen.findByRole("heading", { name: /the match is gone/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("6%")).toBeInTheDocument();
    expect(screen.getByText("Clean rescan — resolved")).toBeInTheDocument();
    expect(screen.getByText("Fix recorded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /scan your repo/i })).toHaveAttribute("href", "/sign-up");
  });

  it("refuses to accept risk without a reason and keeps the decision in history", async () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /run sample scan/i }));
    fireEvent.click(await screen.findByRole("button", { name: /open finding/i }));
    fireEvent.click(await screen.findByRole("button", { name: /accept the risk/i }));

    const submit = screen.getByRole("button", { name: /^accept the risk$/i });
    fireEvent.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent(/reason is required/i);

    fireEvent.change(screen.getByLabelText(/why is this risk acceptable/i), { target: { value: "Internal tool only." } });
    fireEvent.click(screen.getByRole("button", { name: /^accept the risk$/i }));
    expect(await screen.findByText("Risk accepted")).toBeInTheDocument();
    expect(screen.getByText("Internal tool only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try the fix path instead/i })).toBeInTheDocument();
  });
});

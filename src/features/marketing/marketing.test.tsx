import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { LandingPage } from "./LandingPage";
import { PricingPage } from "./PricingPage";

function renderAt(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AuthProvider>{node}</AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("homepage", () => {
  it("leads with the promise and the two calls to action", () => {
    renderAt(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Move fast.Keep it yours.");
    expect(screen.getByText(/checks the code AI agents put into your product/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^scan a repo$/i })[0]).toHaveAttribute("href", "/scan");
    expect(screen.getAllByRole("link", { name: /see live demo/i })[0]).toHaveAttribute("href", "/demo");
  });

  it("makes no exhaustive-coverage, AI-percentage, or social-proof claims", () => {
    const { container } = renderAt(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/never claims to have searched the whole internet/i);
    expect(text).not.toMatch(/% AI|AI-origin|human-origin/i);
    expect(text).not.toMatch(/trusted by|testimonial|fortune 500|customers love/i);
    expect(text).not.toMatch(/chain of title|provenance platform/i);
  });

  it("labels the sample finding as sample data", () => {
    renderAt(<LandingPage />);
    expect(screen.getByText(/Sample finding · fictional repository/)).toBeInTheDocument();
  });
});

describe("pricing page", () => {
  it("shows the commercial plans and no APEX test SKU", () => {
    const { container } = renderAt(<PricingPage />);
    expect(screen.getByRole("heading", { name: /^free$/i })).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getByText("$199")).toBeInTheDocument();
    expect(container.textContent).not.toContain("$19 ");
    expect(container.textContent).not.toMatch(/1,000 credits|scan pack/i);
  });

  it("fails closed while paid checkout isn't configured", () => {
    renderAt(<PricingPage />);
    expect(screen.getAllByText(/Paid checkout isn't open yet/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /choose pro/i })).not.toBeInTheDocument();
  });
});

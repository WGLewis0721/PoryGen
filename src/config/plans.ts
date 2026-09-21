// Commercial plan definitions — the single source for pricing copy, limits,
// and checkout wiring. Pages render from this; nothing about pricing lives in
// JSX. Every feature carries an honest availability so the site never
// advertises something that doesn't exist yet.
//
// The $19 one-time "scan pack" is NOT here: it's the APEX dogfood test SKU,
// defined in ./apexDogfood.ts and only reachable from the operator
// diagnostics page.

export type PlanId = "free" | "pro" | "team";

/** available: works today · in_development: being built, not usable yet · on_request: assembled by hand when asked. */
export type Availability = "available" | "in_development" | "on_request";

export interface PlanFeature {
  label: string;
  availability: Availability;
}

export interface PlanLimits {
  repositories: number;
  /** Full scans included per calendar month (manual scans + rescans). */
  scansPerMonth: number;
  privateRepositories: boolean;
  historyMonths: number | null;
}

export interface CommercialPlan {
  id: PlanId;
  name: string;
  priceLabel: string;
  cadence: string;
  summary: string;
  limits: PlanLimits;
  features: PlanFeature[];
  excluded: string[];
  /** Server-side env var holding this plan's Stripe Price ID; null for free. */
  stripePriceEnv: string | null;
  recommended?: boolean;
}

export const PLANS: CommercialPlan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    cadence: "forever",
    summary: "See whether your AI-written code has a source problem.",
    limits: { repositories: 1, scansPerMonth: 3, privateRepositories: false, historyMonths: null },
    features: [
      { label: "1 public GitHub repository", availability: "available" },
      { label: "3 full scans a month", availability: "available" },
      { label: "Source-similarity findings", availability: "available" },
      { label: "Dependency and license-file context", availability: "available" },
      { label: "Side-by-side match inspection", availability: "available" },
    ],
    excluded: ["Continuous monitoring", "Resolution workflow and history"],
    stripePriceEnv: null,
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$49",
    cadence: "per month",
    summary: "For a founder or small team shipping with coding agents every day.",
    limits: { repositories: 5, scansPerMonth: 100, privateRepositories: true, historyMonths: 12 },
    features: [
      { label: "Up to 5 repositories", availability: "available" },
      { label: "Private repositories", availability: "in_development" },
      { label: "Detailed similarity findings with license context", availability: "available" },
      { label: "Fix, dismiss, and accept-risk workflow", availability: "available" },
      { label: "Rescan on demand; fixed findings close themselves", availability: "available" },
      { label: "Resolution history", availability: "available" },
      { label: "Evidence export (JSON and print report)", availability: "available" },
      { label: "Automatic checks on every push and pull request", availability: "in_development" },
      { label: "Up to 100 full scans a month", availability: "available" },
    ],
    excluded: [],
    stripePriceEnv: "STRIPE_PRICE_PRO_MONTHLY",
    recommended: true,
  },
  {
    id: "team",
    name: "Team",
    priceLabel: "$199",
    cadence: "per month",
    summary: "For a growing engineering team that wants shared rules.",
    limits: { repositories: 25, scansPerMonth: 500, privateRepositories: true, historyMonths: null },
    features: [
      { label: "Everything in Pro", availability: "available" },
      { label: "Up to 25 repositories", availability: "available" },
      { label: "Team access and roles", availability: "in_development" },
      { label: "Shared policies and required-review rules", availability: "in_development" },
      { label: "GitHub pull-request checks", availability: "in_development" },
      { label: "Resolution history kept for the life of the account", availability: "available" },
      { label: "Priority support", availability: "available" },
      { label: "Up to 500 full scans a month", availability: "available" },
    ],
    excluded: [],
    stripePriceEnv: "STRIPE_PRICE_TEAM_MONTHLY",
  },
];

export interface OneTimeOffer {
  name: string;
  priceLabel: string;
  cadence: string;
  summary: string;
  includes: PlanFeature[];
}

export const DILIGENCE_PACK: OneTimeOffer = {
  name: "Diligence Pack",
  priceLabel: "From $1,500",
  cadence: "one-time",
  summary:
    "A frozen export of what PoryGen has recorded — for a buyer, an investor, or counsel. Assembled from your existing history; optional, never required.",
  includes: [
    { label: "Findings and their full resolution history", availability: "on_request" },
    { label: "Current scan state across repositories", availability: "on_request" },
    { label: "Dependency license inventory (CycloneDX)", availability: "on_request" },
    { label: "Supporting evidence for each flag", availability: "on_request" },
    { label: "A plain-language summary for non-engineers", availability: "on_request" },
  ],
};

export const ENTERPRISE: OneTimeOffer = {
  name: "Enterprise and private deployment",
  priceLabel: "Contact us",
  cadence: "",
  summary:
    "PoryGen runs as a hosted service today. Its scanner is a portable package built to run in a worker, in CI, or inside your own environment — packaging that is on the roadmap, not for sale yet.",
  includes: [
    { label: "Private corpus provider for your internal code", availability: "in_development" },
    { label: "Self-hosted or VPC scanner", availability: "in_development" },
    { label: "SSO and audit exports", availability: "in_development" },
  ],
};

export function planById(id: PlanId): CommercialPlan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available now",
  in_development: "In development",
  on_request: "On request",
};

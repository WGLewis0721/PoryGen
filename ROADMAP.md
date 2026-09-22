# PoryGen Roadmap

> **Product:** Source-risk protection for AI-assisted development  
> **Company:** Gray Matter  
> **Current stage:** Live public MVP  
> **North-star experience:** Connect a repository once → PoryGen checks changes automatically → understand risk → act → keep shipping.

## Product thesis

PoryGen exists because AI-assisted development makes it easier to ship code whose source lineage a developer did not personally inspect.

The product should feel like a good wrench: useful immediately, no tuning required, no provider selection, no token management, and no requirement that the customer understand the matching engine.

The product promise remains:

**Move fast. Keep it yours.**

### Product rules

1. Do most of the work for the customer.
2. GitHub is the integration surface, not the product.
3. Default to conservative reporting and explicit abstention.
4. Never imply exhaustive coverage.
5. Read-only access should be enough for the core value.
6. Source should be processed transiently unless persistence is necessary for a customer-facing feature.
7. One real useful experience should remain free.
8. Charge for expansion, automation, collaboration, and higher coverage rather than invented tokens or scan packs.
9. Keep the scanner server-side.
10. Never present similarity as proof of copying, plagiarism, or AI authorship.

---

# Current baseline — September 22, 2026

## Shipped and working

- [x] Production site at **https://porygen.vercel.app**
- [x] Public real-repository scanner at **/scan**
- [x] No account required for the MVP scan
- [x] Public GitHub URL input
- [x] Latest default-branch commit resolution
- [x] Bounded JavaScript / TypeScript / Python ingestion
- [x] Source Search V2 retrieval and verification
- [x] Strong match / possible-common-pattern / abstention outcomes
- [x] Source-specific evidence required for strong matches
- [x] Commit-pinned source links and matched line ranges
- [x] Side-by-side excerpts
- [x] License metadata
- [x] Partial-scan disclosure
- [x] Review / dismiss / reopen actions
- [x] Browser-local decision persistence
- [x] Safe rescan resolution logic
- [x] Vercel SPA deep-link rewrites
- [x] Server-side GitHub token support
- [x] Production deployment verified with real public scans
- [x] Sample guided demo remains available at **/demo**

## Live MVP proof

Human-style production testing successfully scanned:

- `sindresorhus/yocto-queue` — strong match recovered;
- `psf/requests` — multiple strong matches recovered;
- `expressjs/cors` — no strong match.

Observed production scan times were roughly 1–3 seconds for those examples.

## Current limitations

- public repositories only;
- JS / TS / Python only;
- 40-file / 100-KB-per-file / 750-KB-per-scan bounded path;
- current reference index is only 6 pinned files from 3 public repositories;
- review/dismiss decisions on the public scanner are browser-local, not cloud-persisted;
- no GitHub App;
- no private repositories;
- no automatic push or pull-request scanning;
- no GitHub Check Runs;
- no team/workspace controls;
- no customer billing enforcement;
- no large async worker;
- no broad production source corpus.

These are product-growth limitations, not blockers for the current public MVP.

---

# Phase 0 — Live MVP foundation

**Status: COMPLETE**

Goal: prove that a normal person can use the product without setup.

### Exit criteria

A visitor can go to PoryGen, paste a real public GitHub repository, click Scan, understand the result, inspect evidence, and take an action without being taught the system.

**Met.**

---

# Phase 1 — Harden the public MVP

**Goal:** Make the current no-account scanner dependable enough to share broadly.

### Deliverables

- [ ] Make the PoryGen repository private before adding materially more proprietary matching intelligence.
- [ ] Rotate and manage production GitHub credentials through Vercel secrets only.
- [ ] Add basic abuse/rate-limit protection to the unauthenticated scan endpoint.
- [ ] Add lightweight operational visibility for scan failures, latency, GitHub rate-limit errors, and Vercel function failures.
- [ ] Move the production scanner modules out of the `labs/` namespace once the implementation stabilizes; keep the same behavior.
- [ ] Define and publish the canonical data-handling statement for public scans.
- [ ] Add Privacy Policy and Terms before taking payment.
- [ ] Keep direct-route/deep-link behavior covered.
- [ ] Add a clear service-status/failure message when GitHub or the scanner is unavailable.
- [ ] Keep the current conservative strong-match gate; do not resume similarity research unless real customer scans expose a specific problem.

### Exit criteria

The public scanner can be shared with strangers without founder supervision and without an obvious operational or security foot-gun.

---

# Phase 2 — GitHub connection + durable user state

**Goal:** Turn the public utility into a product a developer can keep using.

### Customer flow

```
Visit PoryGen
→ Connect GitHub
→ choose repositories
→ scan
→ review findings
→ decisions and history persist
```

### Deliverables

- [ ] Create the PoryGen GitHub App.
- [ ] Request minimum read-only permissions.
- [ ] Allow selected-repository installation.
- [ ] Use GitHub identity as the primary onboarding path where practical.
- [ ] Add repository picker.
- [ ] Support authorized private repositories.
- [ ] Generate short-lived GitHub installation tokens server-side.
- [ ] Persist repositories, scans, findings, dismissals, reviews, and resolution history.
- [ ] Migrate the useful existing Supabase/RLS groundwork into this flow rather than forcing auth ahead of the first scan.
- [ ] Preserve a no-account public scan as the acquisition path.
- [ ] Make “save this repo / keep watching it” the natural conversion from anonymous scan to account.

### Exit criteria

A user can scan anonymously, connect GitHub when they want persistence/private access, and return later to the same repository history.

---

# Phase 3 — Broaden source coverage

**Goal:** Make a clear result materially more informative than the six-file MVP corpus.

### Deliverables

- [ ] Grow the pinned public-code index substantially.
- [ ] Add at least one production-grade source-intelligence path:
  - licensed public-source corpus;
  - commercial source-intelligence provider;
  - or a Gray Matter-operated public-code index.
- [ ] Keep candidate retrieval local/bounded during a customer scan.
- [ ] Keep precise verification and conservative reporting.
- [ ] Preserve provider/corpus/version/coverage disclosure on every finding.
- [ ] Keep customer-facing semantics simple: strong / possible-common / no strong match.
- [ ] Benchmark changes only when changing the matching/reporting logic; do not turn routine product work into another research program.

### Exit criteria

The product's usefulness no longer depends on a tiny demonstration corpus.

---

# Phase 4 — Production scan infrastructure

**Goal:** Scan larger repositories reliably without making the web request do all the work.

### Deliverables

- [ ] Add Postgres-backed scan queue.
- [ ] Add bounded worker claiming/retry.
- [ ] Support full or substantially larger repository scans.
- [ ] Use the stronger parsing/normalization path where it materially improves results.
- [ ] Preserve scan completeness metadata.
- [ ] Keep source transient wherever possible.
- [ ] Add observable scan states and retry/recovery.
- [ ] Keep fast synchronous scanning for small/public free scans if it remains useful.

### Exit criteria

Repository size and request duration stop being major constraints on the product.

---

# Phase 5 — Ambient GitHub protection

**Goal:** Make PoryGen useful without remembering to click Scan.

### Deliverables

- [ ] Push webhooks.
- [ ] Pull-request webhooks.
- [ ] Diff-aware scanning.
- [ ] Automatic rescan on meaningful changes.
- [ ] GitHub Check Runs.
- [ ] Deep links from GitHub checks to PoryGen evidence.
- [ ] Notification policy that avoids alert fatigue.
- [ ] Optional repository badge that says PoryGen checked the repo without implying certification.

### Exit criteria

A user connects PoryGen once and only thinks about it when there is something worth reviewing.

---

# Phase 6 — Monetization + APEX

**Goal:** Charge for expanded protection without making billing the product.

## Commercial model

### Free

- public/no-account scan remains available;
- one connected protected repository;
- full-quality findings;
- manual scans;
- enough retained history to experience the product.

### Paid

Primary customer-facing unit: **protected repositories and automation**.

Do not sell tokens, credits, or scan packs as the main mental model.

### Deliverables

- [ ] Finalize Free / Pro / Team repository limits.
- [ ] Validate pricing with actual users before treating existing price placeholders as final.
- [ ] Configure production Stripe products/prices.
- [ ] Enforce repo entitlements server-side.
- [ ] Use Stripe Customer Portal for billing management.
- [ ] Integrate APEX as the authority for paid rights.
- [ ] Validate upgrade, downgrade, failed payment, cancellation, refund, and reversal behavior.
- [ ] Keep the APEX operator dogfood SKU separate from PoryGen customer pricing.

### Exit criteria

A stranger can get value free, connect more repositories, pay without founder involvement, and receive the correct rights immediately.

---

# Phase 7 — Teams and enterprise

**Goal:** Expand from founder/developer utility to engineering infrastructure without making the solo product heavier.

### Deliverables

- [ ] Workspaces and organization installs.
- [ ] Roles and permissions.
- [ ] Shared findings queue.
- [ ] Required-review policies.
- [ ] Organization repository inventory.
- [ ] Audit exports.
- [ ] SSO.
- [ ] Enterprise retention controls.
- [ ] VPC/on-prem/private worker option.
- [ ] Customer-owned private source corpus.

### Exit criteria

An organization can adopt PoryGen centrally while the developer experience remains simple.

---

# Phase 8 — Distribution

**Goal:** Let GitHub and the product create the next customer.

### Deliverables

- [ ] GitHub Marketplace listing.
- [ ] One-click GitHub App install from the site.
- [ ] Shareable non-sensitive finding/report views.
- [ ] Optional “PoryGen checked” status/badge.
- [ ] Measure:
  - visitor → first public scan;
  - first scan → second scan;
  - public scan → GitHub connect;
  - connect → protected repo;
  - protected repo → paid expansion;
  - findings reviewed/resolved;
  - automation adoption;
  - churn.

---

# Immediate execution order

Do the next work in this order:

1. **Harden the live public MVP** — secrets, abuse protection, operational visibility, privacy/legal basics.
2. **Connect GitHub** — app install, repository picker, private repos, durable user state.
3. **Broaden coverage** — grow the index / add real source intelligence.
4. **Scale scanning** — async worker for larger repositories.
5. **Automate** — push/PR checks.
6. **Monetize** — repo-based expansion with Stripe + APEX.
7. **Expand** — teams, enterprise, Marketplace.

Do not return to open-ended matcher research unless production use gives a concrete reason.

---

## Success definition

PoryGen is succeeding when a developer can say:

> “I pasted my repo, PoryGen showed me exactly what looked suspicious and where it came from, and now I want it checking every change automatically.”

The business is succeeding when the free public scan creates trust, GitHub connection creates retention, broader repository protection creates the upgrade moment, and automation creates stickiness.

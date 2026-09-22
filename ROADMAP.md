# PoryGen Roadmap

> **Product:** Source-risk protection for AI-assisted development  
> **Company:** Gray Matter  
> **Current stage:** Live public MVP + early PoryGen Engine  
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
10. Never present similarity as proof of copying, plagiarism, infringement, originality, or AI authorship.
11. The complexity stays behind the product. Corpus building, indexing, ranking, rarity analysis, source verification, license intelligence, and origin signals eventually ship under one technology name: **the PoryGen Engine**.

---

# Current baseline — September 22, 2026

## Shipped and working

- [x] Production site at **https://porygen.vercel.app**
- [x] Real public-repository scanner at **/scan**
- [x] No account required for the first scan
- [x] Versioned Terms-of-Use clickwrap before scanning
- [x] Scan API rejects requests without current Terms acceptance
- [x] Public GitHub URL input
- [x] Latest default-branch commit resolution
- [x] JavaScript / TypeScript / Python ingestion
- [x] Up to **150 files**, **100 KB/file**, **2 MB/scan**
- [x] Up to **8 concurrent file downloads**
- [x] Product/source files prioritized ahead of tests, examples, and benchmarks
- [x] Source Search V2 retrieval and verification
- [x] Corpus-scale strong-match calibration
- [x] Strong match / possible-common-pattern / abstention outcomes
- [x] Source-specific evidence required for strong matches
- [x] Weak test/benchmark possible-match noise suppressed
- [x] Possible/common results capped to the 25 closest while preserving the true count
- [x] Side-by-side excerpts
- [x] Source/license/version metadata
- [x] Source links that do not fake unsupported line anchors
- [x] Partial-scan disclosure
- [x] Review / dismiss / reopen actions
- [x] Browser-local scan/decision persistence
- [x] Safe rescan resolution logic
- [x] Vercel SPA deep-link rewrites
- [x] Server-side GitHub token support
- [x] Clear scan-failure message
- [x] Production deployment verified with real public scans
- [x] Sample guided demo remains available at **/demo**

## PoryGen Engine baseline

The product now has the beginnings of a real source-intelligence engine rather than a six-file demo index.

### Offline corpus pipeline

- [x] npm + PyPI package seeding
- [x] pinned release/version metadata
- [x] archive integrity verification
- [x] license normalization
- [x] exact-content deduplication
- [x] formatting/comment-insensitive shape clustering
- [x] global fingerprint frequencies
- [x] common-fingerprint stoplist
- [x] canonical/upstream ranking signals
- [x] reproducible manifest + build-time hydration

Current offline corpus:

- **50,633 files**
- **1,017 packages/projects**
- **48,711 unique blobs**
- **48,633 deduplicated clusters**

Current production search corpus:

- **1,000 canonical source files**
- **199 popular npm and PyPI packages**

The production corpus is hydrated from pinned package archives during build so third-party source does not need to be committed to the PoryGen repository.

## Current product limits

- public repositories only;
- JS / TS / Python only;
- synchronous bounded scan path;
- 150-file / 2-MB request-time scan budget;
- production searches 1,000 canonical source files, not the full 50k offline corpus;
- review/dismiss decisions are browser-local, not cloud-persisted;
- no GitHub App;
- no private repositories;
- no automatic push or pull-request scanning;
- no GitHub Check Runs;
- no team/workspace controls;
- no customer billing enforcement;
- no async large-repository worker.

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

**Status: IN PROGRESS**

**Goal:** Make the no-account scanner dependable enough to share broadly.

### Completed

- [x] Versioned clickwrap Terms of Use
- [x] Automated-analysis limitations disclosed prominently
- [x] Terms acceptance enforced in both UI and scan API
- [x] Accurate public-scan retention wording: server-transient source, browser-local results
- [x] Direct-route/deep-link behavior
- [x] Human-readable scanner/GitHub failure message
- [x] Server-side GitHub credential support
- [x] Conservative reporting remains the default

### Remaining

- [ ] Make the PoryGen repository private before materially more proprietary PoryGen Engine logic is added.
- [ ] Rotate the production GitHub credential if the currently deployed credential is the one previously exposed outside the secret store.
- [ ] Keep production GitHub credentials in Vercel secrets only.
- [ ] Add basic abuse/rate-limit protection to the unauthenticated scan endpoint.
- [ ] Add lightweight operational visibility for scan failures, latency, GitHub quota/rate-limit errors, and serverless failures.
- [ ] Publish a standalone Privacy Policy / canonical data-handling statement.
- [ ] Move stable production scanner modules out of the `labs/` namespace when there is a practical reason to touch that boundary.
- [ ] Have the Terms/Privacy documents reviewed by counsel before meaningful paid usage.

### Exit criteria

The public scanner can be shared broadly without founder supervision and without an obvious operational, privacy, or security foot-gun.

---

# Phase 2 — GitHub connection + durable user state

**Status: NEXT MAJOR PRODUCT PHASE**

**Goal:** Turn the public utility into a product a developer can keep using.

### Customer flow

```
public scan
→ Connect GitHub
→ choose repositories
→ save/protect a repository
→ scan
→ decisions and history persist
→ PoryGen keeps watching it
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
- [ ] Reuse the existing Supabase/Postgres/RLS groundwork.
- [ ] Preserve anonymous public scanning as the acquisition path.
- [ ] Add **Save this repo / Keep watching it** as the natural conversion after an anonymous scan.
- [ ] Preserve the current Terms version/acceptance state in durable account records when account scanning is enabled.

### Exit criteria

A user can scan anonymously, connect GitHub when they want persistence/private access, and return later to the same repository and history.

---

# Phase 3 — PoryGen Engine / source intelligence

**Status: IN PROGRESS**

**Goal:** Turn corpus collection, indexing, retrieval, ranking, verification, and license/source intelligence into a scalable proprietary technology layer.

Externally this should increasingly be described as the **PoryGen Engine**. Customers should not need to understand the sausage-making.

## Already built

- [x] 50k-file offline npm/PyPI corpus pipeline
- [x] 1,000-file / 199-package production corpus
- [x] canonical package/version/license metadata
- [x] exact and shape deduplication
- [x] global fingerprint rarity/frequency data
- [x] common-fingerprint stoplist
- [x] upstream/canonical-source ranking signals
- [x] reproducible build-time corpus hydration
- [x] conservative corpus-scale strong-match calibration
- [x] bounded local candidate retrieval during a customer scan
- [x] simple customer-facing semantics: strong / possible-common / no strong match

## Next engine work

- [ ] Serve substantially more of the existing 50k-file corpus without bundling the entire corpus into the Vercel function.
- [ ] Introduce a dedicated retrieval/index service or datastore suitable for hundreds of thousands to millions of source files.
- [ ] Move from package/file-scale authority signals toward stronger canonical-source and likely-origin ranking.
- [ ] Preserve exact package/version/license/first-published/source provenance in every result.
- [ ] Add more package versions where version identification materially improves evidence.
- [ ] Expand beyond npm/PyPI when the first two ecosystems stop producing the highest-value coverage gains.
- [ ] Add copyleft/GPL/AGPL/LGPL coverage deliberately so the corpus reflects meaningful license-risk cases.
- [ ] Keep corpus-wide rarity as a core ranking signal.
- [ ] Evaluate stronger parsing only for ambiguous candidates rather than slowing every scan.
- [ ] Move fingerprint/index representation beyond the current bundled format when corpus size justifies it.
- [ ] Benchmark only when matching/reporting logic changes or production evidence identifies a concrete accuracy issue.

### Exit criteria

PoryGen can search a materially broad public-code universe with low latency, conservative attribution, useful canonical-source ranking, and clear coverage disclosure.

---

# Phase 4 — Production scan infrastructure

**Status: NOT STARTED**

**Goal:** Scan larger repositories reliably without forcing the complete job into one web request.

### Deliverables

- [ ] Add Postgres-backed scan queue.
- [ ] Add bounded worker claiming/retry.
- [ ] Support full or substantially larger repository scans.
- [ ] Add observable scan states such as fetching → indexing query → comparing → complete.
- [ ] Preserve scan completeness metadata.
- [ ] Keep source transient wherever possible.
- [ ] Add retry/recovery for provider/network failures.
- [ ] Keep the current fast synchronous path for small/public scans.

### Exit criteria

Repository size and request duration stop being major constraints.

---

# Phase 5 — Ambient GitHub protection

**Status: NOT STARTED**

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

**Status: NOT STARTED FOR CUSTOMERS**

**Goal:** Charge for expanded protection without making billing the product.

## Commercial model

### Free

- anonymous public scan;
- one connected protected repository;
- full-quality findings;
- manual scans;
- enough retained history to experience the product.

### Paid

Primary customer-facing unit: **protected repositories + automation + expanded coverage/collaboration**.

Do not sell tokens, credits, or scan packs as the main mental model.

### Deliverables

- [ ] Finalize Free / Pro / Team repository limits.
- [ ] Validate pricing with actual users before treating placeholders as final.
- [ ] Configure production Stripe products/prices.
- [ ] Enforce repository entitlements server-side.
- [ ] Use Stripe Customer Portal for billing management.
- [ ] Integrate APEX as the authority for paid rights.
- [ ] Validate upgrade, downgrade, failed payment, cancellation, refund, and reversal behavior.
- [ ] Keep the APEX operator/dogfood SKU separate from PoryGen customer pricing.

### Exit criteria

A stranger can get real value free, protect more repositories, pay without founder involvement, and receive the correct rights immediately.

---

# Phase 7 — Teams and enterprise

**Status: LATER**

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

**Status: LATER**

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

1. **Finish Phase 1 hardening**
   - rate limiting / abuse protection;
   - operational visibility;
   - Privacy Policy;
   - secret hygiene / credential rotation;
   - repository privacy before adding deeper proprietary engine logic.

2. **Start Phase 2: Connect GitHub**
   - GitHub App;
   - repository picker;
   - private repository access;
   - durable Supabase-backed history;
   - “Save this repo / Keep watching it.”

3. **Continue Phase 3 in parallel: PoryGen Engine**
   - stop serving the corpus as a small bundled subset;
   - expose much more of the existing 50k corpus through a scalable retrieval layer;
   - expand toward hundreds of thousands/millions;
   - improve canonical-source/origin ranking and license-risk coverage.

4. **Phase 4: Async scan infrastructure**
   - queue, workers, large repos, progress/retry.

5. **Phase 5: Ambient GitHub protection**
   - push/PR scanning and Check Runs.

6. **Phase 6: Monetize**
   - repository-based expansion with Stripe + APEX.

7. **Phase 7/8: Expand and distribute**
   - teams, enterprise, Marketplace, sharing and growth loops.

Do not return to open-ended matcher research unless production use gives a concrete reason.

---

# Near-term milestone

The MVP milestone was:

> **Paste a repo → Scan → real result → evidence → action.**

That is done.

The next product milestone is:

> **Connect GitHub → save a repository → come back later → history is still there.**

The milestone after that is:

> **Connect GitHub once → PoryGen watches changes automatically.**

In parallel, the technology milestone is:

> **1,000 production sources → 50k served sources → hundreds of thousands/millions → PoryGen Engine.**

---

## Success definition

PoryGen is succeeding when a developer can say:

> “I pasted my repo, PoryGen showed me exactly what looked suspicious and where it came from, and now I want it checking every change automatically.”

The business is succeeding when the free public scan creates trust, GitHub connection creates retention, broader repository protection creates the upgrade moment, automation creates stickiness, and the PoryGen Engine becomes the defensible source-intelligence layer underneath the simple product.

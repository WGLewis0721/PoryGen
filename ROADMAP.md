# PoryGen Roadmap

> **Product:** Continuous source-risk protection for AI-assisted development  
> **Company:** Gray Matter  
> **Secondary mission:** Real production proving ground for APEX  
> **North-star experience:** Connect GitHub → choose a repository → PoryGen checks it → understand the result → keep shipping.

## Product thesis

PoryGen exists because AI-assisted development makes it easier to ship code whose source lineage a developer did not personally inspect.

The product should feel like a good wrench: useful immediately, no tuning required, no provider selection, no token management, no policy wizard, and no requirement that the customer understand the scanning engine.

PoryGen is a hosted service. The customer grants read-only access to selected GitHub repositories. The scanning engine and source intelligence stay on Gray Matter infrastructure. Customers use the service; they do not receive the proprietary scanner.

### Product rules

1. **Do 80% of the work for the customer.**
2. **GitHub is the integration surface, not the product.**
3. **No source-code retention as a product requirement.** Source may be fetched and processed transiently; PoryGen should not require retaining a customer's repository contents.
4. **Read-only by default.** PoryGen should not need write access to customer source repositories to provide its core value.
5. **No invented billing language.** No tokens, credits, scan packs, or novel units for the main SaaS.
6. **The first useful experience is free.** One repository should receive the real product, not a crippled demo.
7. **Charge for expansion and automation.** The natural upgrade moment is “I want this on the rest of my repos and I do not want to think about running it.”
8. **The scanner is proprietary.** Public marketing/docs may explain the method, but production scanning logic, heuristics, provider strategy, corpora, and scoring stay private.
9. **Be precise about coverage.** A clear result only means nothing matched the sources actually checked.
10. **PoryGen remains a real APEX customer.** Billing, entitlement, refund, downgrade, and access decisions should exercise APEX in production-like conditions.

---

## Current baseline — September 2026

### Working now

- Vercel production site: **https://porygen.vercel.app**
- React/Vite web application.
- Supabase Auth, Postgres, RLS, scan persistence, findings, resolution history, and billing event tables.
- Real public-GitHub repository ingestion.
- Runtime-agnostic scan pipeline:
  - normalization
  - Winnowing fingerprints
  - similarity-provider seam
  - source comparison
  - npm/PyPI license context
  - findings and evidence
- Side-by-side finding inspection.
- Fix / dismiss / accept-risk / reopen workflow.
- Automatic resolution when a rescan proves a finding is gone.
- Evidence export.
- Stripe Checkout and verified webhook plumbing exists but customer checkout is intentionally closed.
- APEX one-time dogfood SKU exists separately from customer plans.
- Public interactive demo uses the real pipeline against fictional sample data.

### Important gaps

- GitHub App installation flow.
- Private repository access.
- Automatic push / pull-request scans.
- GitHub status checks.
- Production-grade async scan worker for larger repositories.
- A real second source-intelligence provider beyond the bundled reference corpus.
- Customer plan enforcement.
- Final production billing configuration.
- Team access / organization controls.
- Enterprise deployment options.
- GitHub Marketplace distribution.
- Canonical retention/privacy contract.
- Repository source code is currently public and should be moved private before more proprietary scanning intelligence is added.

---

# Phase 0 — Protect and stabilize the product

**Goal:** Make the existing product safe to operate commercially before adding more intelligence.

### Deliverables

- [ ] Make the PoryGen GitHub repository private.
- [ ] Verify Vercel, Supabase, ChatGPT, Claude/Cursor/Copilot workflows, and other authorized agents still have required private-repo access.
- [ ] Keep the production scanner server-side. Do not ship proprietary matching logic in browser bundles, public Actions, downloadable containers, or open-source packages.
- [ ] Treat `https://porygen.vercel.app` as the canonical production URL.
- [ ] Remove or update stale Cloudflare deployment references.
- [ ] Fix Vercel SPA rewrites so routes such as `/pricing`, `/docs`, and `/security` work on direct navigation.
- [ ] Re-run Supabase security advisors and resolve actionable warnings.
- [ ] Define the retention statement:
  - source is read for analysis;
  - source contents are not retained as a product requirement;
  - operational/billing metadata is retained only where needed to deliver the service.
- [ ] Add Privacy Policy, Terms of Service, and a plain-language security/data-handling page before public paid launch.
- [ ] Document what parts of PoryGen are trade secrets versus customer-visible behavior.

### Exit criteria

A customer can safely visit production, understand what PoryGen does with their code, and Gray Matter can continue developing without exposing the proprietary scanner source.

---

# Phase 1 — “Pick it up and use it” GitHub experience

**Goal:** Reduce onboarding to the smallest possible interaction.

### Customer flow

```
Visit PoryGen
→ Connect GitHub
→ choose repository
→ scan begins
→ results
```

### Deliverables

- [ ] Create the PoryGen GitHub App.
- [ ] Request only the minimum permissions needed for scanning.
- [ ] Allow installation on selected repositories rather than requiring organization-wide access.
- [ ] Use GitHub identity as the primary onboarding identity wherever practical.
- [ ] Replace manual repository URL entry with a repository picker.
- [ ] Support both public and authorized private repositories.
- [ ] Generate short-lived installation tokens server-side.
- [ ] Keep GitHub credentials/tokens off the browser.
- [ ] Make first scan start with sensible defaults and no configuration wizard.
- [ ] Hide advanced thresholds/provider controls from the default path.
- [ ] Make failure states actionable: permission missing, repo too large, provider unavailable, rate limited, unsupported file type.

### UX standard

A new user should not need to know what Winnowing, fingerprints, SPDX, source providers, scan thresholds, or corpus coverage mean in order to get a useful result.

### Exit criteria

A developer unfamiliar with PoryGen can connect GitHub and get a useful scan without documentation or manual setup.

---

# Phase 2 — Commercial system + APEX proving ground

**Goal:** Turn PoryGen into a simple revenue-producing SaaS without payment-wall fatigue.

## Commercial model

### Free

- **1 protected repository**
- Full-quality PoryGen experience
- No card required
- No crippled findings
- Manual scanning available
- Enough automation to understand the product's value

### Paid

Paid begins when the user wants PoryGen across more of their engineering surface.

Primary billing unit: **protected repositories**.

Do **not** make tokens, credits, scan packs, or per-scan charges the customer-facing mental model.

Exact paid price and repository bands should be validated before checkout is opened. Existing `$49 Pro / $199 Team` values are placeholders until the new repo-expansion model is finalized.

### Enterprise

Custom commercial terms for organization-wide coverage, private/VPC deployment, SSO, internal source corpora, support, procurement, and contractual requirements.

## Deliverables

- [ ] Finalize Free / Pro / Team repository limits and pricing.
- [ ] Configure real Stripe products/prices.
- [ ] Turn on production Checkout only after an end-to-end paid test succeeds.
- [ ] Use Stripe Customer Portal for payment-method updates, invoices, cancellation, and subscription management.
- [ ] Enforce repository entitlements server-side.
- [ ] Keep internal abuse/compute guardrails separate from customer-facing pricing language.
- [ ] Remove “checkout opens soon” UI.
- [ ] Replace sales-contact placeholders.
- [ ] Exercise APEX with the real PoryGen lifecycle:
  - checkout succeeds;
  - payment grants repo entitlement;
  - upgrade expands entitlement;
  - downgrade reduces entitlement safely;
  - failed payment changes rights according to policy;
  - refund/reversal produces a deterministic entitlement state;
  - every decision can answer “can this customer protect this repository right now, and why?”
- [ ] Keep PoryGen's customer plans separate from the APEX operator/dogfood SKU.

### Exit criteria

A stranger can become a free user, receive real value, upgrade without talking to Gray Matter, pay successfully, receive the correct entitlement, manage billing, and downgrade/cancel cleanly.

---

# Phase 3 — Make PoryGen ambient

**Goal:** Create the “how did I ship without this?” behavior.

The product becomes sticky when the user stops remembering to run it.

### Deliverables

- [ ] GitHub push webhooks.
- [ ] Pull-request webhooks.
- [ ] Incremental/diff-aware scanning where appropriate.
- [ ] Automatic rescan on meaningful code changes.
- [ ] GitHub Check Runs with a simple result:
  - checked / clear
  - review suggested
  - strong source match
  - scan unavailable
- [ ] Deep-link GitHub findings back to PoryGen evidence.
- [ ] Optional README/status badge that reports that PoryGen checked the repository without claiming certification.
- [ ] Notification policy that avoids alert fatigue.
- [ ] Paid automation becomes the primary expansion incentive.

### Exit criteria

A paying customer can forget PoryGen exists until it finds something worth their attention.

---

# Phase 4 — Production-grade scanning brain

**Goal:** Make the underlying intelligence strong enough that the ambient workflow deserves trust.

### Deliverables

- [ ] Add a real second similarity/source-intelligence provider.
- [ ] Evaluate GitHub candidate discovery, licensed corpora, and commercial source-intelligence providers.
- [ ] Preserve the provider interface so source coverage can improve without rewriting the customer workflow.
- [ ] Move large scans to an async Postgres-backed queue + worker.
- [ ] Full repository checkout for supported scans rather than the current bounded sample path.
- [ ] Use the stronger tree-sitter normalization path in worker execution.
- [ ] Add bounded retry/recovery and observable scan states.
- [ ] Improve candidate ranking and false-positive suppression.
- [ ] Benchmark precision/recall using controlled corpora and known transformations.
- [ ] Keep every finding explicit about provider, corpus, version, and coverage.
- [ ] Separate proprietary scoring/heuristics from public-facing application code.

### Exit criteria

PoryGen's value is no longer dependent on the small bundled reference corpus, and larger real repositories can be scanned reliably without blocking web requests.

---

# Phase 5 — Organic distribution

**Goal:** Let existing users create the next users without turning the product into spam.

### Deliverables

- [ ] Publish the PoryGen GitHub App.
- [ ] Prepare GitHub Marketplace listing when install/authorization and billing are production-ready.
- [ ] One-click install from the marketing site.
- [ ] Shareable, non-sensitive finding/report views where the customer explicitly chooses to share.
- [ ] Optional “PoryGen checked” badge/check status.
- [ ] Useful free repository remains the acquisition engine.
- [ ] Upgrade prompt appears at the natural expansion point: adding another protected repo or enabling broader automation.
- [ ] Measure:
  - visitor → GitHub connect
  - connect → first scan
  - first scan → second scan
  - free repo → paid expansion
  - paid churn
  - findings reviewed/resolved
  - percentage of customers enabling automatic checks

### Exit criteria

A meaningful portion of new installations originate from GitHub visibility, developer sharing, or the free product rather than direct founder outreach.

---

# Phase 6 — Teams and organizations

**Goal:** Expand from a developer utility into engineering infrastructure without making the solo experience heavier.

### Deliverables

- [ ] GitHub organization installation.
- [ ] Team/workspace membership.
- [ ] Roles and permissions.
- [ ] Organization-wide repository inventory.
- [ ] Shared policies and required-review rules.
- [ ] Central findings queue.
- [ ] Long-term resolution history.
- [ ] Audit exports.
- [ ] SSO for enterprise.
- [ ] Enterprise support/SLA path.

### Exit criteria

An engineering organization can adopt PoryGen centrally while individual developers still experience the same simple GitHub-native workflow.

---

# Phase 7 — Enterprise/private execution

**Goal:** Support customers whose code or policy cannot leave their environment.

### Deliverables

- [ ] Package the existing runtime-agnostic scanner for private execution.
- [ ] VPC/on-prem worker option.
- [ ] Customer-owned private source corpus provider.
- [ ] Signed result exchange between private worker and PoryGen control plane.
- [ ] SSO, audit, retention controls, and contractual data-handling options.
- [ ] Evaluate Sigstore or equivalent signing only where it improves verifiability rather than marketing.

### Exit criteria

PoryGen can serve regulated or highly sensitive customers without handing over the proprietary product or weakening the hosted SaaS experience.

---

# APEX validation track

PoryGen began as a real application for proving APEX. That remains strategically valuable.

Every commercial milestone should deliberately test an APEX question:

| PoryGen event | APEX question |
|---|---|
| Free account protects first repo | What entitlement exists without payment? |
| Customer adds repo #2 | Is payment required for this action right now? |
| Successful Stripe payment | What rights should be granted and why? |
| Upgrade | How do rights expand immediately? |
| Downgrade | Which repos remain protected and when does the change apply? |
| Failed renewal | What becomes read-only, grace-period, or blocked? |
| Refund/reversal | What rights remain after value was already consumed? |
| Team plan | Who inherits workspace-level rights? |
| Enterprise exception | How are contractual overrides represented and audited? |

PoryGen should not contain bespoke entitlement logic that APEX is meant to own once the APEX integration is production-ready.

---

# Near-term execution order

The next work should happen in this order:

1. **Protect:** private repo, canonical Vercel configuration, route fixes, data-handling/legal basics.
2. **Connect:** GitHub App, minimum read-only permissions, repository picker, private repo scanning.
3. **Monetize:** one free repo, repo-based paid expansion, live Stripe + APEX entitlement path.
4. **Automate:** push/PR monitoring and GitHub checks.
5. **Improve coverage:** second real source provider and async worker.
6. **Distribute:** GitHub Marketplace and organic GitHub-native discovery.
7. **Expand:** teams, organizations, enterprise/private execution.

Do not prioritize team administration, enterprise packaging, exotic attestation, or additional dashboards ahead of the first four steps.

---

## Success definition

PoryGen is succeeding when a developer can say:

> “I connected GitHub once. PoryGen checks what my coding agents give me, and now I do not like shipping without seeing that it checked the repo.”

The business is succeeding when that developer can use one repository indefinitely for free, naturally wants PoryGen on additional repositories, upgrades without learning a new billing model, and remains a customer because the protection is automatic rather than because the product manufactures friction.

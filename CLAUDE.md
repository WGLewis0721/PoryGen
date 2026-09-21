# PoryGen — project facts

- **What:** continuous source-risk protection for AI-assisted development. Checks the code AI
  agents put into a product for suspicious source similarity and license risk; resolution
  history is a side effect. Not an AI detector, not legal certification, not M&A software.
- **Audience:** AI-native founders and teams of ~1–20 developers.
- **Primary CTA:** Scan a repo (`/sign-up` → `/repositories/new`). Secondary: See live demo (`/demo`).
- **Status:** production-intent product in early access. Real scanning of public GitHub repos;
  similarity coverage is limited to a small bundled reference corpus and must be described that
  way. Continuous monitoring, private repos, GitHub checks, and team features are not built.
- **Stack:** React 19 + TypeScript + Vite + React Router; Supabase (Auth, Postgres + RLS, Edge
  Functions); `packages/provenance-core` (scanner + provenance); `packages/vscode-extension`.
- **Deploy:** Cloudflare Workers static assets via `scripts/deploy-worker-assets.mjs`; Supabase
  migrations and functions via the Supabase CLI. Order: migrations → functions → frontend.
- **Pricing source of truth:** `src/config/plans.ts`. The $19 APEX SKU is an operator test
  (`src/config/apexDogfood.ts`, `docs/APEX_DOGFOOD.md`) and must never appear as pricing.
- **Facts rule:** no invented customers, logos, testimonials, metrics, or contact details. The
  sales email is `VITE_SALES_EMAIL` — TODO: client to supply. `/demo` and the Lattice repository
  are fictional sample data and are labelled so.
- **Pointers:** README.md (real vs. sample vs. not built), DESIGN.md, VISUAL-PLAN.md, docs/.

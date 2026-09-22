# PoryGen — project facts

- **What:** source-risk protection for AI-assisted development. Checks code for suspicious similarity to indexed public source and shows source/license evidence for human review. Not an AI detector, not proof of copying, not legal certification.
- **Audience:** AI-native founders and small engineering teams.
- **Primary CTA:** **Scan a repo** → `/scan`. No account required.
- **Live:** https://porygen.vercel.app
- **MVP status:** working public MVP. Real public GitHub scans run in production through `api/scan.mjs`.
- **Production scanner:** Source Search V2 under `labs/source-search-lab`, promoted from the validated lab. Do not replace it with the older production pipeline unless intentionally integrating capabilities.
- **Current coverage:** 1,006 canonical files from 199 popular npm/PyPI packages plus 6 pinned repo files, JS/TS/Python. Built offline by `packages/source-index` from a 50k-file corpus; shipped as a code-free manifest hydrated at build time. Always describe coverage as limited.
- **Current limits:** public repos only; 150 files; 100 KB/file; 2 MB total; bounded request time. GitHub truncates huge repo listings — the UI must keep saying so.
- **Strong reporting rule:** normalized structural overlap alone is never enough. Strong matches require contiguous evidence (>=30 normalized tokens and >=9 exact identifier/literal tokens, or an 80-token structurally varied run for renamed copies), calibrated at corpus scale; otherwise report possible/common or abstain.
- **Actions:** source review, browser-local dismiss/reopen, rescan, safe resolution.
- **Sample demo:** `/demo` is fictional data and remains secondary to the real `/scan` path.
- **Existing stack:** React 19 + TypeScript + Vite + React Router; Vercel. Supabase/Postgres/RLS, billing, and provenance/history code remain as groundwork for the connected product but are not required for the public MVP scan.
- **Secrets:** production `GITHUB_TOKEN` is server-side only. Never place tokens in docs or browser code.
- **Next:** harden public endpoint → GitHub App/private repos/durable state → broaden source coverage → async scanning → push/PR automation → Stripe/APEX repo entitlements.
- **Do not:** restart open-ended matching research without a concrete production failure; put signup ahead of the first scan; claim exhaustive coverage; expose proprietary scoring logic client-side.
- **Pointers:** README.md, ROADMAP.md, docs/ARCHITECTURE.md, docs/SCANNER.md, docs/SECURITY.md.

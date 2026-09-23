# Handoff — multi-input MVP

## Current state

PoryGen is a live source-match product.

Core question:

> **Does this code meaningfully resemble code that exists somewhere else, and where might it have come from?**

Do not redefine the product around AI detection, a particular coding tool, or compliance.

The customer code may be handwritten, copied/adapted, AI-assisted, AI-generated, inherited or mixed.

Live site: https://porygen.vercel.app  
Scanner: https://porygen.vercel.app/scan

## Current production flow

\`\`\`
public GitHub / ZIP / local folder
→ safe ingestion
→ existing PoryGen Engine
→ strong / possible-common / abstention
→ source evidence
→ review
\`\`\`

## What is shipped

- no-account /scan experience;
- public GitHub repository scans;
- ZIP upload scans;
- local folder scans;
- shared Engine/result semantics across all inputs;
- JavaScript / TypeScript / Python;
- starter/template/boilerplate exclusions before matching;
- conservative source-specific strong-match gate;
- line/source/excerpt evidence;
- source/license metadata;
- review/dismiss/reopen;
- safe GitHub rescan resolution;
- transient upload processing;
- upload results/excerpts excluded from browser persistence;
- hardened ZIP validation/limits;
- production corpus pack of 1,000 canonical package-source files from 199 npm/PyPI packages;
- offline source-index corpus of 50,633 files across 1,017 packages/projects.

PR #17 added secure ZIP/folder backend ingestion.

PR #18 added the multi-input public scan UI, was rebased onto #17, passed one real ZIP HTTP end-to-end Engine gate, and is live in production.

PR #21 is also merged and live. It fixed the three founding-repository regressions: common/conventional one-line code no longer elevates to `strong_match` without stronger source-specific evidence, zero eligible files now return an explicit no-files-scanned state, and partial scans now make unchecked scope/reasons unmistakable. Final production smoke passed on Apex, `itsm-tier1-agent` as the zero-file case, and PoryGen as the partial-scan case.

PR #20 is merged at `117e4af` and the Source Match Report is live. It preserves PR #21's conventional-pattern demotion and explicit empty/partial scan behavior. The report is generated locally as a self-contained HTML artifact with browser Print/PDF support and no new hosted persistence.

PR #23 is merged and deployed at `a051093`. It turns GitHub's exact empty-repository response into an explicit known-empty revision state, preserves all other ambiguous/provider failures as failures, carries that state through scan/report contracts, and documents the invariant that uncertainty cannot become a stronger PoryGen conclusion.

## Current important boundaries

- connected private GitHub is not built;
- JS/TS/Python only;
- 150 matched files / 100 KB each / 2 MB accepted source;
- ZIP max 2.9 MB compressed / 1,000 entries / 10 MB expanded-declared budget;
- synchronous bounded scan path;
- production does not yet serve the full offline corpus;
- upload results are intentionally non-durable;
- Source Match Report is live, but hosted report history/private sharing are not built;
- no MCP;
- no CLI;
- no automatic push/PR checks;
- no customer entitlement enforcement.

## Next net-new product

**PoryGen MCP**

The GitHub provider boundary is now hardened enough that the next adapter surface should reuse the same Engine and explicit result semantics rather than introduce another matcher or hidden state model.

The shipped report shows:

- what was scanned;
- coverage/completeness;
- exclusions;
- matched customer files/lines;
- possible public source;
- source/license/version metadata;
- compact evidence;
- review/dismiss state where available;
- explicit limitations.

It is not a certificate, legal opinion, AI report or proof of originality.

Do not persist uploaded source merely to create the report.

## Net-new roadmap

1. PoryGen MCP
2. PoryGen CLI
3. Engine/corpus scale-up
4. connected GitHub + continuous monitoring
5. larger scan infrastructure when required
6. monetization/teams/distribution later

## Parallel hardening

Continue:

- abuse/rate limiting;
- monitoring;
- Privacy/data-handling;
- secret hygiene;
- counsel review before paid scale;
- repository privacy before substantially deeper proprietary Engine work.

## Do not do next

- do not restart open-ended matcher research;
- do not build another matcher for MCP/CLI;
- do not narrow positioning to Lovable/Bolt/v0/Replit, Claude/OpenAI/Gemini/Ollama, or any other specific tool/model;
- do not turn PoryGen into an AI-authorship detector;
- do not put signup or billing in front of first scan value;
- do not call a report a certificate;
- do not build enterprise policy/SBOM/CVE scope as the next customer feature.

See [../ROADMAP.md](../ROADMAP.md).

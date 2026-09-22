# Customer flows

## 1. Real scan — /scan

This is the primary product experience. No account is required.

The user chooses one input:

- **Public GitHub URL**
- **ZIP project**
- **Local folder**

All three use the same PoryGen Engine.

### GitHub flow

1. Open https://porygen.vercel.app/scan.
2. Choose **Public GitHub URL**.
3. Paste a public repository URL.
4. Click **Scan**.
5. PoryGen resolves the latest default-branch commit and checks supported JS/TS/Python source.
6. Results show strong matches, possible/common patterns, or no strong source match.
7. The user can inspect source evidence, dismiss/reopen a finding, and later rescan the latest commit.

GitHub review/dismiss state may be stored in browser local storage for the current MVP.

### ZIP flow

1. Choose **.zip project**.
2. Select a ZIP within the published upload bounds.
3. Optionally enter exact starter/template/boilerplate exclusion paths.
4. Click **Scan**.
5. PoryGen validates/extracts eligible source transiently and sends the accepted files through the same Engine.
6. Results use the same finding UI/semantics as GitHub.

The ZIP/source/result is not intentionally persisted server-side or in browser storage by the upload flow.

### Local folder flow

1. Choose **Local folder**.
2. Select the project directory.
3. Review browser-visible relative paths if useful.
4. Exclude exact starter/template/boilerplate paths if desired.
5. Click **Scan**.
6. Eligible source files are sent to the same Engine.

The selected folder name may remain the first segment of submitted file paths.

### Finding semantics

A reportable finding can include:

- affected file/lines;
- possible public source;
- public-source location;
- source/license metadata;
- side-by-side evidence;
- explanation of why the match was surfaced;
- next review action.

PoryGen does not say that a match proves copying, infringement or AI authorship.

An empty upload says **No eligible source files were scanned**, not that the project is clear.

### Exclusions

Exclusions happen before matching and are shown in result metadata.

Excluding a path does not resolve an earlier finding.

## 2. Guided sample demo — /demo

The sample demo remains a fictional walkthrough for someone who wants to understand the interaction without scanning real code.

It is educational and clearly separate from the live scanner.

## 3. Next customer flow — Source Match Report

The next net-new addition is:

\`\`\`
scan
→ inspect findings
→ export Source Match Report
\`\`\`

The report should summarize what was scanned, coverage, exclusions, findings, possible sources and evidence.

It is not an originality certificate, legal opinion or AI-authorship report.

Uploaded source should not be persisted just to generate the report.

## 4. Later developer workflow — MCP / CLI

\`\`\`
write / copy / generate code
→ PoryGen MCP or CLI
→ same Engine
→ source-match evidence
\`\`\`

This workflow is model/vendor agnostic.

## 5. Later connected GitHub workflow

\`\`\`
manual scan
→ Connect GitHub
→ choose repositories
→ durable history
→ automatic push/PR checks
\`\`\`

GitHub connection is a later retention/automation surface, not the definition of PoryGen.

## 6. Billing — later

Billing groundwork exists, but billing is not the next product addition.

Potential paid value may include broader coverage, private/durable reports, connected repositories, continuous monitoring, retained history, collaboration and higher-scale integration usage.

See [../ROADMAP.md](../ROADMAP.md).

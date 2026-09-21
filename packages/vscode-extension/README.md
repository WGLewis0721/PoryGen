# PoryGen Provenance Capture (VS Code extension)

A real, buildable VS Code extension that observes `vscode.workspace.onDidChangeTextDocument`
and classifies each change's **shape** — never its content — as a provenance signal.

## What it captures

For every text-document change: file path, characters/lines inserted, characters removed,
elapsed time since the previous change in that file, and whether the change replaced
existing text. It never records file contents, diffs, or secrets.

## Classification

Every change is run through `classifyEdit()` (`src/classifier.ts`, a synced copy of
`packages/provenance-core/src/provenance/classifier.ts` — see `scripts/sync-vendored-copies.mjs`)
against configurable thresholds (`porygen.classifier.*` settings), producing one of:

`human_signal` · `bulk_insert_signal` · `ai_assisted_signal` · `human_modified_ai` · `imported` · `unknown`

These are heuristics about edit shape, not proof of authorship — see `docs/PROVENANCE.md`
for the full legal-claim boundary.

## Running it

```bash
cd packages/vscode-extension
npm install
npm run compile
```

Then open this folder in VS Code and press **F5** (or Run → Start Debugging) to launch an
Extension Development Host. Edit any file in the host window — events append to
`.porygen/provenance-ledger.jsonl` in that workspace, and also stream to the
**PoryGen Provenance** output channel (View → Output).

Commands (Cmd/Ctrl+Shift+P):

- **PoryGen: Show Local Provenance Ledger** — opens the JSONL file.
- **PoryGen: Flush Captured Events** — reports how many events are pending. No PoryGen
  ingestion endpoint is wired up in this build; see `docs/DEMO_FLOW.md` for what a
  configured deployment would do with a flushed batch.

## Testing

```bash
npm test
```

Runs `test/classifier.test.ts` against the vendored classifier directly — deterministic,
no VS Code API required, so it also runs from the repo root via `npm test`.

## Packaging

Not published to the Marketplace in this build. `vsce package` would produce a `.vsix`
from this folder once `@vscode/vsce` is added as a dev dependency, but that step is out
of scope for the MVP.

// PoryGen Provenance Capture — a real VS Code extension that observes
// vscode.workspace.onDidChangeTextDocument, classifies each change's shape
// (never its content) with the same conservative heuristics documented in
// docs/PROVENANCE.md, and appends the result to a local, append-only JSONL
// ledger under the workspace's .porygen/ directory. It intentionally does
// not upload anything by default — see the `flushEvents` command and
// docs/DEMO_FLOW.md for how a configured PoryGen instance would receive
// these batches.
//
// What it records: file path, insertion/removal size, elapsed time since
// the previous event in that file, and whether the change replaced existing
// text. It never records file contents, diffs, or secrets.

import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { classifyEdit } from "./classifier";
import { DEFAULT_CLASSIFIER_CONFIG, type CapturedProvenanceEvent, type ClassifierConfig } from "./types";

const lastEventAtByFile = new Map<string, number>();
let outputChannel: vscode.OutputChannel;
let pendingEvents: CapturedProvenanceEvent[] = [];

function readClassifierConfig(): ClassifierConfig {
  const config = vscode.workspace.getConfiguration("porygen.classifier");
  return {
    bulkInsertMinLines: config.get("bulkInsertMinLines", DEFAULT_CLASSIFIER_CONFIG.bulkInsertMinLines),
    bulkInsertMaxElapsedMs: config.get("bulkInsertMaxElapsedMs", DEFAULT_CLASSIFIER_CONFIG.bulkInsertMaxElapsedMs),
    humanMaxCharsPerEvent: config.get("humanMaxCharsPerEvent", DEFAULT_CLASSIFIER_CONFIG.humanMaxCharsPerEvent),
    humanMinElapsedMs: config.get("humanMinElapsedMs", DEFAULT_CLASSIFIER_CONFIG.humanMinElapsedMs),
    importedPasteMinChars: config.get("importedPasteMinChars", DEFAULT_CLASSIFIER_CONFIG.importedPasteMinChars),
  };
}

function ledgerPath(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, ".porygen");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "provenance-ledger.jsonl");
}

function classifierSignalToSourceType(signal: ReturnType<typeof classifyEdit>): CapturedProvenanceEvent["sourceType"] {
  switch (signal) {
    case "ai_assisted_signal":
    case "bulk_insert_signal":
      return "ai";
    case "human_signal":
    case "human_modified_ai":
      return "human";
    case "imported":
      return "imported";
    default:
      return "unknown";
  }
}

function handleChange(event: vscode.TextDocumentChangeEvent) {
  if (event.contentChanges.length === 0) return;
  if (event.document.uri.scheme !== "file") return;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(event.document.uri);
  if (!workspaceFolder) return;

  const filePath = vscode.workspace.asRelativePath(event.document.uri, false);
  const now = Date.now();
  const lastAt = lastEventAtByFile.get(filePath) ?? null;
  const elapsedMsSincePrevious = lastAt === null ? null : now - lastAt;
  lastEventAtByFile.set(filePath, now);

  let insertedChars = 0;
  let insertedLines = 0;
  let removedChars = 0;
  let isReplacement = false;

  for (const change of event.contentChanges) {
    insertedChars += change.text.length;
    insertedLines += change.text.split("\n").length - 1;
    removedChars += change.rangeLength;
    if (change.rangeLength > 0 && change.text.length > 0) isReplacement = true;
  }

  const config = readClassifierConfig();
  const signal = classifyEdit({ insertedChars, insertedLines, removedChars, elapsedMsSincePrevious, isReplacement }, config);

  const contentHash = crypto
    .createHash("sha256")
    .update(`${filePath}:${event.document.version}:${now}`)
    .digest("hex");

  const captured: CapturedProvenanceEvent = {
    filePath,
    workspaceRoot: workspaceFolder.uri.fsPath,
    repository: null,
    commitSha: null,
    sourceType: classifierSignalToSourceType(signal),
    actorType: signal === "imported" ? "external" : "developer",
    classifierSignal: signal,
    insertedChars,
    insertedLines,
    removedChars,
    elapsedMsSincePrevious,
    timestamp: new Date(now).toISOString(),
    contentHash,
  };

  pendingEvents.push(captured);
  fs.appendFileSync(ledgerPath(workspaceFolder.uri.fsPath), JSON.stringify(captured) + "\n", "utf8");
  outputChannel.appendLine(
    `[${captured.timestamp}] ${filePath} · ${signal} · +${insertedChars}c/${insertedLines}l -${removedChars}c` +
      (elapsedMsSincePrevious !== null ? ` · Δt=${elapsedMsSincePrevious}ms` : " · first event"),
  );
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("PoryGen Provenance");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("PoryGen Provenance Capture active. Recording edit shape only — never content.");

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(handleChange));

  context.subscriptions.push(
    vscode.commands.registerCommand("porygen.showLedger", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showInformationMessage("Open a folder to view its PoryGen ledger.");
        return;
      }
      const file = ledgerPath(folder.uri.fsPath);
      if (!fs.existsSync(file)) {
        vscode.window.showInformationMessage("No provenance events captured yet in this workspace.");
        return;
      }
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("porygen.flushEvents", async () => {
      if (pendingEvents.length === 0) {
        vscode.window.showInformationMessage("No pending PoryGen events to flush.");
        return;
      }
      // A configured deployment would POST `pendingEvents` to its
      // scan-repository-adjacent ingestion endpoint here, batched, over
      // HTTPS, authenticated with the signed-in user's session. No such
      // endpoint is wired in this build — see docs/DEMO_FLOW.md for the
      // manual walkthrough of what a real batch upload would contain.
      vscode.window.showInformationMessage(
        `${pendingEvents.length} event(s) ready to flush. No PoryGen endpoint is configured in this build — events remain in .porygen/provenance-ledger.jsonl.`,
      );
      pendingEvents = [];
    }),
  );
}

export function deactivate() {
  pendingEvents = [];
  lastEventAtByFile.clear();
}

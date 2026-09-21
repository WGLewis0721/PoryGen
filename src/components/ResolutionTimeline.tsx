import { Check } from "lucide-react";
import type { Stage } from "../lib/resolution";
import "./resolution-timeline.css";

function formatWhen(at: string | null): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** FOUND → REVIEWED → REMEDIATED → RESCANNED → RESOLVED. */
export function StageRail({ stages, label = "Resolution progress" }: { stages: Stage[]; label?: string }) {
  const current = stages.findIndex((s) => !s.done);
  return (
    <ol className="stage-rail" aria-label={label}>
      {stages.map((stage, index) => {
        const state = stage.done ? "done" : index === current ? "current" : "todo";
        return (
          <li key={stage.key} className={`stage stage-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stage-mark" aria-hidden="true">
              {stage.done ? <Check /> : null}
            </span>
            <span className="stage-label">{stage.label}</span>
            <span className="visually-hidden">{stage.done ? " — done" : state === "current" ? " — next" : " — not yet"}</span>
            {formatWhen(stage.at) && <span className="stage-when">{formatWhen(stage.at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export interface HistoryEntry {
  id: string;
  label: string;
  detail?: string | null;
  actor: string;
  at: string;
  tone?: "system" | "user";
}

export function HistoryList({ entries, emptyText = "No history yet." }: { entries: HistoryEntry[]; emptyText?: string }) {
  if (entries.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <ol className="history-list">
      {entries.map((entry) => (
        <li key={entry.id} className={`history-item history-${entry.tone ?? "system"}`}>
          <div className="history-line">
            <span className="history-label">{entry.label}</span>
            <time className="history-when" dateTime={entry.at}>
              {formatWhen(entry.at) ?? entry.at}
            </time>
          </div>
          <div className="history-actor">{entry.actor}</div>
          {entry.detail && <p className="history-detail">{entry.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

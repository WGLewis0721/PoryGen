import type { LineRange } from "@porygen/provenance-core";
import "./code-compare.css";

export interface CodePane {
  label: string;
  path: string;
  meta?: string;
  code: string;
  /** Line number of the first line in `code`. */
  startLine: number;
  highlight: LineRange[];
}

function formatRanges(ranges: LineRange[]): string {
  if (ranges.length === 0) return "none";
  return ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`)).join(", ");
}

function inRanges(line: number, ranges: LineRange[]): boolean {
  return ranges.some((r) => line >= r.start && line <= r.end);
}

function Pane({ pane, side }: { pane: CodePane; side: "left" | "right" }) {
  const lines = pane.code.replace(/\n$/, "").split("\n");
  const width = String(pane.startLine + lines.length - 1).length;
  return (
    <figure className={`cc-pane cc-pane-${side}`}>
      <figcaption className="cc-head">
        <span className="cc-label">{pane.label}</span>
        <span className="cc-path mono">{pane.path}</span>
        {pane.meta && <span className="cc-meta">{pane.meta}</span>}
        <span className="visually-hidden">Matched lines: {formatRanges(pane.highlight)}.</span>
      </figcaption>
      <pre className="cc-code" tabIndex={0} translate="no" aria-label={`${pane.label}: ${pane.path}`}>
        <code>
          {lines.map((text, i) => {
            const number = pane.startLine + i;
            const matched = inRanges(number, pane.highlight);
            return (
              <span className={`cc-line${matched ? " cc-line-match" : ""}`} key={number}>
                <span className="cc-num" aria-hidden="true">
                  {String(number).padStart(width, " ")}
                </span>
                <span className="cc-text">{text || " "}</span>
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}

export function CodeCompare({ left, right, className }: { left: CodePane; right: CodePane; className?: string }) {
  return (
    <div className={`cc${className ? ` ${className}` : ""}`}>
      <Pane pane={left} side="left" />
      <Pane pane={right} side="right" />
    </div>
  );
}

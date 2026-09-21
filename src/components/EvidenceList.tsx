import type { ReactNode } from "react";
import "./evidence-list.css";

export interface EvidenceItem {
  term: string;
  detail: ReactNode;
}

export function EvidenceList({ items, className }: { items: EvidenceItem[]; className?: string }) {
  return (
    <dl className={`evidence${className ? ` ${className}` : ""}`}>
      {items.map((item) => (
        <div className="evidence-row" key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

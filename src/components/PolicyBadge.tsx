import type { PolicyStatus } from "@porygen/provenance-core";

const CLASS: Record<PolicyStatus, string> = {
  CLEAR: "pg-badge-clear",
  REVIEW: "pg-badge-review",
  BLOCKING: "pg-badge-blocking",
  UNKNOWN: "pg-badge-unknown",
};

const LABEL: Record<PolicyStatus, string> = {
  CLEAR: "Clear",
  REVIEW: "Review required",
  BLOCKING: "Blocking",
  UNKNOWN: "Unknown",
};

export function PolicyBadge({ status }: { status: PolicyStatus }) {
  return (
    <span className={`pg-badge ${CLASS[status]}`}>
      <span className="pg-dot" aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}

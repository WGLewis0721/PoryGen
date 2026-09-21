import { CircleCheck, CircleDashed, CircleDot, OctagonAlert, TriangleAlert, Undo2, Ban, Hourglass, Circle } from "lucide-react";
import type { ReactNode } from "react";
import type { TrackedStatus } from "../lib/dbTypes";
import type { Tone } from "../lib/findingVocabulary";
import { STATUS_LABEL, STATUS_TONE } from "../lib/resolution";

const TONE_ICON: Record<Tone, ReactNode> = {
  clear: <CircleCheck aria-hidden="true" />,
  common: <CircleDashed aria-hidden="true" />,
  review: <TriangleAlert aria-hidden="true" />,
  strong: <OctagonAlert aria-hidden="true" />,
  neutral: <CircleDot aria-hidden="true" />,
  quiet: <Circle aria-hidden="true" />,
};

export function ToneTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`tag tag-${tone}`}>
      {TONE_ICON[tone]}
      {children}
    </span>
  );
}

const STATUS_ICON: Record<TrackedStatus, ReactNode> = {
  open: <CircleDot aria-hidden="true" />,
  in_review: <Hourglass aria-hidden="true" />,
  resolved: <CircleCheck aria-hidden="true" />,
  accepted_risk: <Undo2 aria-hidden="true" />,
  dismissed_false_positive: <Ban aria-hidden="true" />,
};

export function StatusTag({ status }: { status: TrackedStatus }) {
  return (
    <span className={`tag tag-${STATUS_TONE[status]}`}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  );
}

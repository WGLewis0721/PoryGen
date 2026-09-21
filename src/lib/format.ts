import type { RiskLevel } from "./dbTypes";
import type { Tone } from "./findingVocabulary";

export const RISK_LABEL: Record<RiskLevel, string> = {
  clear: "Clear",
  review: "Review suggested",
  blocking: "Needs attention",
  unknown: "Unknown licenses",
};

export function riskTone(risk: RiskLevel): Tone {
  if (risk === "clear") return "clear";
  if (risk === "review") return "review";
  if (risk === "blocking") return "strong";
  return "quiet";
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((then - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Plain-English license guidance for someone about to launch.
//
// The same SPDX → policy split exists in features/findings/evidence.ts, but that
// module imports the reference corpus from @porygen/provenance-core (~90KB of
// scanner code) and is written for the signed-in dashboard. The public scan page
// is anonymous and load-sensitive, and needs pre-launch phrasing rather than
// audit phrasing, so the mapping is restated here rather than dragging the
// scanner bundle onto a marketing-adjacent route.
//
// Nothing here is a legal conclusion. PoryGen describes what a license *may*
// require; whether it applies to a given product is a question for a lawyer.

export type LicensePolicy = "CLEAR" | "REVIEW" | "BLOCKING" | "UNKNOWN";

const PERMISSIVE = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unlicense", "0BSD", "CC0-1.0"];
const WEAK_COPYLEFT = ["MPL-2.0", "LGPL-2.1", "LGPL-3.0", "LGPL-2.1-only", "LGPL-3.0-only", "EPL-2.0", "CDDL-1.0"];
const STRONG_COPYLEFT = ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "GPL-2.0-only", "GPL-3.0-only", "AGPL-3.0-only", "SSPL-1.0"];

export function licensePolicy(license: string | null | undefined): LicensePolicy {
  if (!license) return "UNKNOWN";
  const id = license.trim().replace(/-or-later$/, "").replace(/\+$/, "");
  if (PERMISSIVE.includes(id)) return "CLEAR";
  if (WEAK_COPYLEFT.includes(id)) return "REVIEW";
  if (STRONG_COPYLEFT.includes(id)) return "BLOCKING";
  return "UNKNOWN";
}

/** What this license may ask of you if the code did come from that source. */
export const LICENSE_MEANING: Record<LicensePolicy, string> = {
  CLEAR:
    "Permissive. Reuse is generally fine, but most permissive licenses still ask you to keep the original copyright and license notice somewhere in your product.",
  REVIEW:
    "Weak copyleft. Obligations usually attach to the borrowed files themselves rather than your whole app, but they may require you to publish changes to those files. Worth confirming before you launch.",
  BLOCKING:
    "Strong copyleft. If your code is derived from it and you ship your product — for AGPL, even just running it as a hosted service — you may be required to release your own source under the same license.",
  UNKNOWN:
    "PoryGen couldn't identify the license. Code with no clear license terms is not automatically free to reuse, so check the source before you rely on it.",
};

/** One line under the heading, sized for a founder deciding what to do next. */
export const LICENSE_HEADLINE: Record<LicensePolicy, string> = {
  CLEAR: "Usually fine — attribution may be required",
  REVIEW: "May create obligations — worth a look",
  BLOCKING: "May require review before you ship",
  UNKNOWN: "License unclear — check before relying on it",
};

export const POLICY_TONE: Record<LicensePolicy, "clear" | "review" | "strong" | "neutral"> = {
  CLEAR: "clear",
  REVIEW: "review",
  BLOCKING: "strong",
  UNKNOWN: "review",
};

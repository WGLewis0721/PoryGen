import { AUXILIARY_PATH, DERIVED_PATH } from "./content.mjs";

/**
 * Ranking model for "which occurrence of this code is the likely upstream".
 *
 * Every dedup cluster (files with the same normalized token shape) can appear
 * in many releases: the original package, forks, packages that vendored it,
 * and build copies inside the same package. Each occurrence gets interpretable
 * features; a linear score orders them and a softmax turns scores into a
 * per-cluster probability. Weights are hand-set priors, kept in one place so a
 * labeled set can later refit them.
 */
export const WEIGHTS = Object.freeze({
  origin: 2.5,        // published earliest among occurrences
  authority: 1.0,     // registry downloads (log-scaled, normalized in-cluster)
  nameMatch: 1.5,     // path or filename names the package itself
  primarySource: 0.8, // conventional source location (src/, lib/, package root, pkg dir)
  derived: -2.0,      // dist/build/umd copies of another file
  auxiliary: -1.0,    // tests, examples, tooling
  vendored: -3.0,     // path names a *different* package (vendored copy)
  licenseKnown: 0.3,
});

const DAY = 86_400_000;

function nameTokens(name) {
  return name.toLowerCase().replace(/^@[^/]+\//, "").split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

export function occurrenceFeatures(occurrence, cluster) {
  const path = occurrence.path.toLowerCase();
  const segments = path.split("/");
  const base = segments[segments.length - 1].replace(/\.[a-z]+$/, "");
  const pkg = occurrence.name.toLowerCase().replace(/^@[^/]+\//, "");
  const pkgTokens = nameTokens(occurrence.name);
  const pkgUnderscored = pkg.replace(/-/g, "_");

  const earliest = Math.min(...cluster.map((o) => Date.parse(o.firstPublished ?? "") || Infinity));
  const published = Date.parse(occurrence.firstPublished ?? "") || Infinity;
  const daysAfterEarliest = Number.isFinite(published) && Number.isFinite(earliest) ? (published - earliest) / DAY : 3650;

  const maxDownloads = Math.max(1, ...cluster.map((o) => o.downloads ?? 0));
  const otherPackageDir = segments.slice(0, -1).find((s) =>
    cluster.some((o) => o.name !== occurrence.name && s === o.name.toLowerCase().replace(/^@[^/]+\//, "")));

  return {
    origin: 1 / (1 + Math.max(0, daysAfterEarliest) / 180),
    authority: Math.log10(1 + (occurrence.downloads ?? 0)) / Math.log10(1 + maxDownloads),
    nameMatch:
      base === pkg || base === pkgUnderscored || segments.includes(pkg) || segments.includes(pkgUnderscored) ||
      (pkgTokens.length > 0 && pkgTokens.every((t) => path.includes(t)))
        ? 1 : 0,
    primarySource: /^(src|lib)\//.test(path) || segments.length === 1 || segments[0] === pkgUnderscored ? 1 : 0,
    derived: DERIVED_PATH.test(path) ? 1 : 0,
    auxiliary: AUXILIARY_PATH.test(path) ? 1 : 0,
    vendored: otherPackageDir ? 1 : 0,
    licenseKnown: occurrence.licenseSpdx ? 1 : 0,
  };
}

export function scoreFeatures(features, weights = WEIGHTS) {
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * (features[key] ?? 0), 0);
}

/** Rank one cluster's occurrences; returns them sorted with score, probability and features. */
export function rankCluster(cluster, weights = WEIGHTS) {
  const scored = cluster.map((occurrence) => {
    const features = occurrenceFeatures(occurrence, cluster);
    return { ...occurrence, features, score: scoreFeatures(features, weights) };
  });
  const max = Math.max(...scored.map((o) => o.score));
  const total = scored.reduce((sum, o) => sum + Math.exp(o.score - max), 0);
  for (const o of scored) o.probability = Math.exp(o.score - max) / total;
  return scored.sort((a, b) => b.score - a.score || (a.firstPublished ?? "").localeCompare(b.firstPublished ?? "") || a.path.localeCompare(b.path));
}

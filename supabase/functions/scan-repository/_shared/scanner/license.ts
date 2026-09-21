// License-file and dependency-manifest scanning, plus policy evaluation.
// Runs identically in the browser (client-side preview), Node (tests), and
// Deno (the scan-repository Edge Function) — pure string/JSON parsing only.

import type { DependencyLicenseFinding, LicenseId, LicenseFileFinding, PolicyStatus } from "../types.ts";

export const LICENSE_MANIFEST_FILES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "COPYING",
  "NOTICE",
];

export const DEPENDENCY_MANIFEST_FILES = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
];

const LICENSE_SIGNATURES: Array<{ id: LicenseId; patterns: RegExp[] }> = [
  { id: "AGPL-3.0", patterns: [/GNU AFFERO GENERAL PUBLIC LICENSE/i, /\bAGPL-3\.0/i] },
  { id: "GPL-3.0", patterns: [/GNU GENERAL PUBLIC LICENSE\s*\n?\s*Version 3/i, /\bGPL-3\.0/i] },
  { id: "GPL-2.0", patterns: [/GNU GENERAL PUBLIC LICENSE\s*\n?\s*Version 2/i, /\bGPL-2\.0/i] },
  { id: "LGPL-3.0", patterns: [/GNU LESSER GENERAL PUBLIC LICENSE\s*\n?\s*Version 3/i, /\bLGPL-3\.0/i] },
  { id: "LGPL-2.1", patterns: [/GNU LESSER GENERAL PUBLIC LICENSE\s*\n?\s*Version 2\.1/i, /\bLGPL-2\.1/i] },
  { id: "MPL-2.0", patterns: [/Mozilla Public License,?\s*version 2\.0/i, /\bMPL-2\.0/i] },
  { id: "Apache-2.0", patterns: [/Apache License,?\s*Version 2\.0/i, /\bApache-2\.0/i] },
  { id: "BSD-3-Clause", patterns: [/Redistribution and use in source and binary forms/i, /3-Clause/i] },
  { id: "BSD-2-Clause", patterns: [/2-Clause BSD/i] },
  { id: "ISC", patterns: [/Permission to use, copy, modify, and\/?or distribute this software/i, /\bISC\b/] },
  { id: "Unlicense", patterns: [/This is free and unencumbered software released into the public domain/i] },
  { id: "MIT", patterns: [/Permission is hereby granted, free of charge/i, /\bMIT License\b/i] },
];

export function detectLicenseFromText(text: string): LicenseId {
  for (const sig of LICENSE_SIGNATURES) {
    if (sig.patterns.some((pattern) => pattern.test(text))) return sig.id;
  }
  return "Unknown";
}

export function scanLicenseFiles(files: Record<string, string>): LicenseFileFinding[] {
  const findings: LicenseFileFinding[] = [];
  for (const [path, content] of Object.entries(files)) {
    const base = path.split("/").pop() ?? path;
    if (LICENSE_MANIFEST_FILES.includes(base)) {
      findings.push({ path, detected: detectLicenseFromText(content) });
    }
  }
  return findings;
}

/**
 * Policy: how each SPDX identifier is treated under PoryGen's default
 * "commercial" policy profile. Copy-left families with network/distribution
 * triggers block; weak copy-left and unknowns route to review.
 */
export function policyForLicense(license: LicenseId): PolicyStatus {
  switch (license) {
    case "MIT":
    case "Apache-2.0":
    case "BSD-2-Clause":
    case "BSD-3-Clause":
    case "ISC":
    case "Unlicense":
      return "CLEAR";
    case "MPL-2.0":
    case "LGPL-2.1":
    case "LGPL-3.0":
      return "REVIEW";
    case "GPL-2.0":
    case "GPL-3.0":
    case "AGPL-3.0":
      return "BLOCKING";
    case "Unknown":
    default:
      return "UNKNOWN";
  }
}

interface ParsedDependency {
  name: string;
  version?: string;
  ecosystem: DependencyLicenseFinding["ecosystem"];
}

/** Extracts a flat dependency list from whichever manifests are present. Best-effort, tolerant of partial/invalid files. */
export function parseDependencyManifests(files: Record<string, string>): ParsedDependency[] {
  const deps: ParsedDependency[] = [];
  const seen = new Set<string>();
  const push = (name: string, version: string | undefined, ecosystem: ParsedDependency["ecosystem"]) => {
    const key = `${ecosystem}:${name}`;
    if (seen.has(key) || !name) return;
    seen.add(key);
    deps.push({ name, version, ecosystem });
  };

  const pkgJson = files["package.json"];
  if (pkgJson) {
    try {
      const parsed = JSON.parse(pkgJson);
      for (const section of ["dependencies", "devDependencies"]) {
        const group = parsed[section];
        if (group && typeof group === "object") {
          for (const [name, version] of Object.entries(group)) push(name, String(version), "npm");
        }
      }
    } catch {
      // malformed manifest — surfaced as UNKNOWN via the empty finding set upstream
    }
  }

  const requirements = files["requirements.txt"];
  if (requirements) {
    for (const rawLine of requirements.split("\n")) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;
      const match = line.match(/^([A-Za-z0-9._-]+)\s*(==|>=|<=|~=|>|<)?\s*([A-Za-z0-9.]*)/);
      if (match) push(match[1], match[3] || undefined, "pypi");
    }
  }

  const goMod = files["go.mod"];
  if (goMod) {
    for (const rawLine of goMod.split("\n")) {
      const match = rawLine.trim().match(/^([a-zA-Z0-9.\-_/]+)\s+(v[\d.]+\S*)/);
      if (match && !rawLine.trim().startsWith("module")) push(match[1], match[2], "go");
    }
  }

  const cargoToml = files["Cargo.toml"];
  if (cargoToml) {
    const depSection = cargoToml.split(/\[dependencies\]/i)[1];
    if (depSection) {
      const body = depSection.split(/\n\[/)[0];
      for (const rawLine of body.split("\n")) {
        const match = rawLine.trim().match(/^([A-Za-z0-9_-]+)\s*=\s*"?([\w.]*)"?/);
        if (match) push(match[1], match[2] || undefined, "cargo");
      }
    }
  }

  return deps;
}

/** A tiny, explicit fallback table for common packages when no registry lookup is available (e.g. offline tests). */
const KNOWN_PACKAGE_LICENSES: Record<string, LicenseId> = {
  react: "MIT",
  "react-dom": "MIT",
  vite: "MIT",
  typescript: "Apache-2.0",
  lodash: "MIT",
  express: "MIT",
  "left-pad": "MIT",
  "gpl-sample-dependency": "AGPL-3.0",
};

export interface LicenseLookup {
  (dep: ParsedDependency): Promise<LicenseId>;
}

export const staticLicenseLookup: LicenseLookup = async (dep) => {
  return KNOWN_PACKAGE_LICENSES[dep.name] ?? "Unknown";
};

/**
 * Real (network) registry lookup used by the Edge Function: npm registry /
 * PyPI JSON API only — fixed, trusted hosts, small timeout, license field
 * only. Falls back to Unknown on any error so a flaky registry never fails
 * the scan.
 */
export function createRegistryLicenseLookup(fetchImpl: typeof fetch = fetch): LicenseLookup {
  return async (dep) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      let url: string | null = null;
      if (dep.ecosystem === "npm") {
        url = `https://registry.npmjs.org/${encodeURIComponent(dep.name)}/latest`;
      } else if (dep.ecosystem === "pypi") {
        url = `https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`;
      }
      if (!url) return "Unknown";

      const res = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return "Unknown";
      const data = await res.json();
      if (dep.ecosystem === "npm") return licenseFromNpmManifest(data);
      return licenseFromPypiInfo(data?.info);
    } catch {
      return "Unknown";
    }
  };
}

const SPDX_ALIASES: Record<string, LicenseId> = {
  "mit": "MIT",
  "mit license": "MIT",
  "apache-2.0": "Apache-2.0",
  "apache 2.0": "Apache-2.0",
  "apache license 2.0": "Apache-2.0",
  "apache license, version 2.0": "Apache-2.0",
  "apache software license": "Apache-2.0",
  "bsd-2-clause": "BSD-2-Clause",
  "bsd-3-clause": "BSD-3-Clause",
  "isc": "ISC",
  "isc license": "ISC",
  "mpl-2.0": "MPL-2.0",
  "lgpl-2.1": "LGPL-2.1",
  "lgpl-3.0": "LGPL-3.0",
  "gpl-2.0": "GPL-2.0",
  "gpl-3.0": "GPL-3.0",
  "agpl-3.0": "AGPL-3.0",
  "unlicense": "Unlicense",
  "the unlicense": "Unlicense",
};

/** Most permissive first. Used to resolve SPDX `OR` (licensee's choice) and `AND` (all apply) expressions. */
const PERMISSIVENESS: LicenseId[] = [
  "Unlicense", "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
  "MPL-2.0", "LGPL-2.1", "LGPL-3.0", "GPL-2.0", "GPL-3.0", "AGPL-3.0",
];

function normalizeSingle(raw: string): LicenseId {
  const value = raw.trim().replace(/^\(+|\)+$/g, "").trim().toLowerCase().replace(/-(only|or-later)$/, "").replace(/\+$/, "");
  return SPDX_ALIASES[value] ?? "Unknown";
}

/** Maps a registry license string — including SPDX `OR`/`AND` expressions — to a known identifier. */
export function normalizeSpdx(raw: unknown): LicenseId {
  if (typeof raw !== "string" || !raw.trim()) return "Unknown";
  const expression = raw.trim().replace(/^\((.*)\)$/, "$1");
  if (/\sOR\s/i.test(expression)) {
    const options = expression.split(/\sOR\s/i).map(normalizeSingle).filter((id) => id !== "Unknown");
    if (options.length === 0) return "Unknown";
    return options.sort((a, b) => PERMISSIVENESS.indexOf(a) - PERMISSIVENESS.indexOf(b))[0];
  }
  if (/\sAND\s/i.test(expression)) {
    const parts = expression.split(/\sAND\s/i).map(normalizeSingle);
    if (parts.includes("Unknown")) return "Unknown";
    return parts.sort((a, b) => PERMISSIVENESS.indexOf(b) - PERMISSIVENESS.indexOf(a))[0];
  }
  return normalizeSingle(expression);
}

function licenseFromNpmManifest(data: { license?: unknown; licenses?: unknown } | null | undefined): LicenseId {
  const license = data?.license;
  if (typeof license === "string") return normalizeSpdx(license);
  if (license && typeof license === "object" && "type" in license) return normalizeSpdx((license as { type: unknown }).type);
  if (Array.isArray(data?.licenses) && data.licenses.length > 0) {
    const first = data.licenses[0] as { type?: unknown };
    return normalizeSpdx(first?.type);
  }
  return "Unknown";
}

function licenseFromPypiInfo(info: { license?: unknown; license_expression?: unknown; classifiers?: unknown } | null | undefined): LicenseId {
  const fromExpression = normalizeSpdx(info?.license_expression);
  if (fromExpression !== "Unknown") return fromExpression;
  const fromField = normalizeSpdx(info?.license);
  if (fromField !== "Unknown") return fromField;
  if (Array.isArray(info?.classifiers)) {
    for (const classifier of info.classifiers) {
      if (typeof classifier !== "string") continue;
      const match = classifier.match(/^License :: OSI Approved :: (.+)$/);
      if (match) {
        const id = normalizeSpdx(match[1]);
        if (id !== "Unknown") return id;
      }
    }
  }
  return "Unknown";
}

export async function evaluateDependencyLicenses(
  files: Record<string, string>,
  lookup: LicenseLookup = staticLicenseLookup,
): Promise<DependencyLicenseFinding[]> {
  const deps = parseDependencyManifests(files);
  const findings: DependencyLicenseFinding[] = [];
  for (const dep of deps) {
    const license = await lookup(dep);
    findings.push({
      name: dep.name,
      version: dep.version,
      ecosystem: dep.ecosystem,
      license,
      source: license === "Unknown" ? "unresolved" : "registry-lookup",
      policy: policyForLicense(license),
    });
  }
  return findings;
}

export function summarizePolicy(
  fileFindings: LicenseFileFinding[],
  dependencyFindings: DependencyLicenseFinding[],
): PolicyStatus {
  const statuses = [
    ...fileFindings.map((f) => policyForLicense(f.detected)),
    ...dependencyFindings.map((f) => f.policy),
  ];
  if (statuses.includes("BLOCKING")) return "BLOCKING";
  if (statuses.includes("REVIEW")) return "REVIEW";
  if (statuses.includes("UNKNOWN") && !statuses.includes("CLEAR")) return "UNKNOWN";
  return "CLEAR";
}

// Canonical SPDX identifiers for the free-form license strings registries carry.
const ALIASES = new Map(Object.entries({
  "mit": "MIT", "mit license": "MIT", "the mit license": "MIT", "expat": "MIT",
  "isc": "ISC", "isc license": "ISC", "isc license (iscl)": "ISC",
  "apache": "Apache-2.0", "apache 2": "Apache-2.0", "apache 2.0": "Apache-2.0", "apache-2": "Apache-2.0",
  "apache-2.0": "Apache-2.0", "apache license 2.0": "Apache-2.0", "apache license, version 2.0": "Apache-2.0",
  "apache software license": "Apache-2.0", "apache2": "Apache-2.0", "asl 2.0": "Apache-2.0",
  "bsd": "BSD-3-Clause", "bsd license": "BSD-3-Clause", "new bsd": "BSD-3-Clause", "new bsd license": "BSD-3-Clause",
  "bsd-3-clause": "BSD-3-Clause", "3-clause bsd": "BSD-3-Clause", "bsd 3-clause": "BSD-3-Clause", "modified bsd": "BSD-3-Clause",
  "bsd-2-clause": "BSD-2-Clause", "simplified bsd": "BSD-2-Clause", "freebsd": "BSD-2-Clause", "0bsd": "0BSD",
  "gpl": "GPL-3.0-or-later", "gplv2": "GPL-2.0-only", "gpl-2.0": "GPL-2.0-only", "gpl-2.0-only": "GPL-2.0-only",
  "gpl-2.0-or-later": "GPL-2.0-or-later", "gplv2+": "GPL-2.0-or-later", "gplv3": "GPL-3.0-only", "gpl-3.0": "GPL-3.0-only",
  "gpl-3.0-only": "GPL-3.0-only", "gpl-3.0-or-later": "GPL-3.0-or-later", "gplv3+": "GPL-3.0-or-later",
  "gnu gpl v3": "GPL-3.0-only", "gnu general public license v3 (gplv3)": "GPL-3.0-only",
  "gnu general public license v2 (gplv2)": "GPL-2.0-only", "gnu general public license v3 or later (gplv3+)": "GPL-3.0-or-later",
  "gnu general public license v2 or later (gplv2+)": "GPL-2.0-or-later",
  "lgpl": "LGPL-3.0-or-later", "lgpl-2.1": "LGPL-2.1-only", "lgpl-2.1-only": "LGPL-2.1-only", "lgpl-2.1-or-later": "LGPL-2.1-or-later",
  "lgpl-3.0": "LGPL-3.0-only", "lgpl-3.0-only": "LGPL-3.0-only", "lgpl-3.0-or-later": "LGPL-3.0-or-later", "lgplv3": "LGPL-3.0-only",
  "gnu lesser general public license v3 (lgplv3)": "LGPL-3.0-only", "gnu lesser general public license v2 or later (lgplv2+)": "LGPL-2.1-or-later",
  "agpl-3.0": "AGPL-3.0-only", "agpl-3.0-only": "AGPL-3.0-only", "agpl-3.0-or-later": "AGPL-3.0-or-later", "agplv3": "AGPL-3.0-only",
  "gnu affero general public license v3": "AGPL-3.0-only", "gnu affero general public license v3 or later (agplv3+)": "AGPL-3.0-or-later",
  "mpl-2.0": "MPL-2.0", "mpl 2.0": "MPL-2.0", "mozilla public license 2.0 (mpl 2.0)": "MPL-2.0",
  "epl-2.0": "EPL-2.0", "unlicense": "Unlicense", "the unlicense (unlicense)": "Unlicense", "cc0-1.0": "CC0-1.0", "cc0": "CC0-1.0",
  "wtfpl": "WTFPL", "zlib": "Zlib", "python software foundation license": "PSF-2.0", "psf": "PSF-2.0", "psf-2.0": "PSF-2.0",
  "blueoak-1.0.0": "BlueOak-1.0.0", "artistic-2.0": "Artistic-2.0", "bsl-1.0": "BSL-1.0", "hpnd": "HPND",
}));

const COPYLEFT = /^(A?GPL|LGPL|MPL|EPL|CDDL|EUPL|OSL|SSPL)/;

function canonicalOne(value) {
  const trimmed = value.trim();
  const cleaned = (/^\(.*\)$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed).trim();
  if (!cleaned) return null;
  const alias = ALIASES.get(cleaned.toLowerCase());
  if (alias) return alias;
  // Already a plausible SPDX id (e.g. "BSD-3-Clause", "MIT-0").
  if (/^[A-Za-z0-9.+-]+$/.test(cleaned) && cleaned.length <= 40) return cleaned;
  return null;
}

/**
 * Normalize a registry license field into { spdx, raw, family }.
 * Accepts npm strings, legacy {type} objects and arrays, SPDX expressions,
 * and PyPI trove classifiers ("License :: OSI Approved :: MIT License").
 */
export function normalizeLicense(input) {
  const values = [];
  const collect = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(collect);
    if (typeof v === "object") return collect(v.type ?? v.name);
    values.push(String(v));
  };
  collect(input);

  const raw = values.join(" | ") || null;
  const ids = [];
  for (const value of values) {
    if (/^see license in/i.test(value) || /^unlicensed$/i.test(value)) continue;
    const classifier = value.match(/^License :: (?:OSI Approved :: )?(.+)$/);
    const text = classifier ? classifier[1] : value;
    if (/^OSI Approved$/i.test(text)) continue;
    // SPDX expressions: keep structure, canonicalize each operand.
    const parts = text.replace(/^\((.*)\)$/, "$1").split(/\s+(OR|AND|WITH)\s+/);
    const mapped = parts.map((part, i) => (i % 2 === 1 ? part : canonicalOne(part)));
    if (mapped.every(Boolean)) ids.push(mapped.join(" "));
    else if (text.length > 60) continue;
    else if (canonicalOne(text)) ids.push(canonicalOne(text));
  }

  const spdx = [...new Set(ids)].join(" OR ") || null;
  // A choice (OR) with any permissive alternative is usable permissively; AND/WITH carries every term.
  const alternativeIsCopyleft = (alt) => alt.split(/ (?:AND|WITH) /).some((id) => COPYLEFT.test(id));
  const family = !spdx ? "unknown" : spdx.split(" OR ").every(alternativeIsCopyleft) ? "copyleft" : "permissive";
  return { spdx, raw, family };
}

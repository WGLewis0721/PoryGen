// CycloneDX-compatible SBOM generation from a scan's dependency findings.
// Intentionally minimal: one `component` per dependency with whatever
// license/version data the scan actually resolved. No vulnerability feed, no
// transitive-graph enrichment — that's the Enterprise-preview roadmap, not
// this MVP (see docs/ARCHITECTURE.md).

import type { DependencyLicenseFinding } from "./types.ts";

export interface CycloneDxSbom {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  serialNumber: string;
  version: 1;
  metadata: { timestamp: string; component: { type: "application"; name: string } };
  components: Array<{
    type: "library";
    name: string;
    version?: string;
    purl: string;
    licenses: Array<{ license: { id: string } }>;
  }>;
}

const PURL_TYPE: Record<DependencyLicenseFinding["ecosystem"], string> = {
  npm: "npm",
  pypi: "pypi",
  cargo: "cargo",
  go: "golang",
  unknown: "generic",
};

export function buildCycloneDxSbom(
  repositoryName: string,
  dependencies: DependencyLicenseFinding[],
): CycloneDxSbom {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: "application", name: repositoryName },
    },
    components: dependencies.map((dep) => ({
      type: "library",
      name: dep.name,
      version: dep.version,
      purl: `pkg:${PURL_TYPE[dep.ecosystem]}/${dep.name}${dep.version ? `@${dep.version}` : ""}`,
      licenses: [{ license: { id: dep.license } }],
    })),
  };
}

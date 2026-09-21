import { describe, expect, it } from "vitest";
import {
  detectLicenseFromText,
  scanLicenseFiles,
  policyForLicense,
  parseDependencyManifests,
  evaluateDependencyLicenses,
  summarizePolicy,
  staticLicenseLookup,
  normalizeSpdx,
  createRegistryLicenseLookup,
} from "../src/scanner/license.js";

describe("license file detection", () => {
  it("recognizes MIT license text", () => {
    const text = "MIT License\n\nPermission is hereby granted, free of charge, to any person...";
    expect(detectLicenseFromText(text)).toBe("MIT");
  });

  it("recognizes AGPL-3.0 license text", () => {
    const text = "                    GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007";
    expect(detectLicenseFromText(text)).toBe("AGPL-3.0");
  });

  it("returns Unknown for unrecognized text", () => {
    expect(detectLicenseFromText("Do whatever you want, I guess.")).toBe("Unknown");
  });

  it("scans only recognized license filenames", () => {
    const findings = scanLicenseFiles({
      "LICENSE": "MIT License\nPermission is hereby granted, free of charge",
      "src/index.ts": "MIT License text here should be ignored",
    });
    expect(findings).toEqual([{ path: "LICENSE", detected: "MIT" }]);
  });
});

describe("policy evaluation", () => {
  it("marks permissive licenses CLEAR", () => {
    expect(policyForLicense("MIT")).toBe("CLEAR");
    expect(policyForLicense("Apache-2.0")).toBe("CLEAR");
  });
  it("marks weak copyleft REVIEW", () => {
    expect(policyForLicense("LGPL-3.0")).toBe("REVIEW");
    expect(policyForLicense("MPL-2.0")).toBe("REVIEW");
  });
  it("marks strong copyleft BLOCKING", () => {
    expect(policyForLicense("AGPL-3.0")).toBe("BLOCKING");
    expect(policyForLicense("GPL-3.0")).toBe("BLOCKING");
  });
  it("marks Unknown as UNKNOWN", () => {
    expect(policyForLicense("Unknown")).toBe("UNKNOWN");
  });

  it("summarizes overall policy as the worst status present", () => {
    expect(
      summarizePolicy([{ path: "LICENSE", detected: "MIT" }], [
        { name: "x", ecosystem: "npm", license: "AGPL-3.0", source: "registry-lookup", policy: "BLOCKING" },
      ]),
    ).toBe("BLOCKING");
  });
});

describe("dependency manifest parsing", () => {
  it("parses package.json dependencies", () => {
    const deps = parseDependencyManifests({
      "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" }, devDependencies: { vite: "^8.0.0" } }),
    });
    expect(deps).toEqual(
      expect.arrayContaining([
        { name: "react", version: "^19.0.0", ecosystem: "npm" },
        { name: "vite", version: "^8.0.0", ecosystem: "npm" },
      ]),
    );
  });

  it("parses requirements.txt", () => {
    const deps = parseDependencyManifests({ "requirements.txt": "django==4.2.0\n# a comment\nrequests>=2.0\n" });
    expect(deps.map((d) => d.name)).toEqual(["django", "requests"]);
  });

  it("tolerates malformed package.json without throwing", () => {
    expect(() => parseDependencyManifests({ "package.json": "{not json" })).not.toThrow();
  });
});

describe("evaluateDependencyLicenses", () => {
  it("resolves known packages via the static lookup and evaluates policy", async () => {
    const findings = await evaluateDependencyLicenses(
      { "package.json": JSON.stringify({ dependencies: { react: "^19.0.0", "gpl-sample-dependency": "1.0.0" } }) },
      staticLicenseLookup,
    );
    const react = findings.find((f) => f.name === "react");
    const gpl = findings.find((f) => f.name === "gpl-sample-dependency");
    expect(react?.policy).toBe("CLEAR");
    expect(gpl?.license).toBe("AGPL-3.0");
    expect(gpl?.policy).toBe("BLOCKING");
  });
});

describe("normalizeSpdx", () => {
  it("maps plain identifiers and common long-form names", () => {
    expect(normalizeSpdx("MIT")).toBe("MIT");
    expect(normalizeSpdx("Apache License, Version 2.0")).toBe("Apache-2.0");
    expect(normalizeSpdx("The Unlicense")).toBe("Unlicense");
  });

  it("strips -only / -or-later / + suffixes", () => {
    expect(normalizeSpdx("GPL-3.0-or-later")).toBe("GPL-3.0");
    expect(normalizeSpdx("AGPL-3.0-only")).toBe("AGPL-3.0");
    expect(normalizeSpdx("GPL-2.0+")).toBe("GPL-2.0");
  });

  it("resolves OR expressions to the most permissive known choice", () => {
    expect(normalizeSpdx("(MIT OR Apache-2.0)")).toBe("MIT");
    expect(normalizeSpdx("GPL-3.0 OR MPL-2.0")).toBe("MPL-2.0");
  });

  it("resolves AND expressions to the most restrictive term, or Unknown if any part is unknown", () => {
    expect(normalizeSpdx("MIT AND GPL-3.0")).toBe("GPL-3.0");
    expect(normalizeSpdx("MIT AND Custom-Thing")).toBe("Unknown");
  });

  it("returns Unknown for empty, non-string, or unrecognised input", () => {
    expect(normalizeSpdx("")).toBe("Unknown");
    expect(normalizeSpdx(undefined)).toBe("Unknown");
    expect(normalizeSpdx({ type: "MIT" })).toBe("Unknown");
    expect(normalizeSpdx("BSD")).toBe("Unknown");
  });
});

describe("createRegistryLicenseLookup", () => {
  const respond = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it("reads npm license objects and SPDX expressions", async () => {
    expect(await createRegistryLicenseLookup(respond({ license: { type: "ISC" } }))({ name: "x", ecosystem: "npm" })).toBe("ISC");
    expect(await createRegistryLicenseLookup(respond({ license: "(MIT OR Apache-2.0)" }))({ name: "x", ecosystem: "npm" })).toBe("MIT");
  });

  it("falls back to PyPI trove classifiers", async () => {
    const lookup = createRegistryLicenseLookup(
      respond({ info: { license: "", classifiers: ["Programming Language :: Python", "License :: OSI Approved :: MIT License"] } }),
    );
    expect(await lookup({ name: "requests-thing", ecosystem: "pypi" })).toBe("MIT");
  });

  it("returns Unknown when the registry fails", async () => {
    const failing = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await createRegistryLicenseLookup(failing)({ name: "x", ecosystem: "npm" })).toBe("Unknown");
  });
});

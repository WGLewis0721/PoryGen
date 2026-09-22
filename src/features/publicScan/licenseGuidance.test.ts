import { describe, expect, it } from "vitest";
import { LICENSE_HEADLINE, LICENSE_MEANING, licensePolicy } from "./licenseGuidance";

describe("license guidance", () => {
  it("separates permissive, weak copyleft and strong copyleft", () => {
    expect(licensePolicy("MIT")).toBe("CLEAR");
    expect(licensePolicy("Apache-2.0")).toBe("CLEAR");
    expect(licensePolicy("MPL-2.0")).toBe("REVIEW");
    expect(licensePolicy("LGPL-3.0")).toBe("REVIEW");
    expect(licensePolicy("AGPL-3.0")).toBe("BLOCKING");
    expect(licensePolicy("GPL-3.0-only")).toBe("BLOCKING");
  });

  it("treats an unrecognised or missing license as unknown, never as permissive", () => {
    for (const value of [null, undefined, "", "Commercial", "NOASSERTION"]) {
      expect(licensePolicy(value)).toBe("UNKNOWN");
    }
    expect(LICENSE_MEANING.UNKNOWN).toMatch(/not automatically free to reuse/);
  });

  it("normalizes the -or-later and + suffixes rather than falling through to unknown", () => {
    expect(licensePolicy("GPL-3.0-or-later")).toBe("BLOCKING");
    expect(licensePolicy("LGPL-2.1+")).toBe("REVIEW");
  });

  it("describes obligations as possibilities, never as legal conclusions", () => {
    for (const text of [...Object.values(LICENSE_MEANING), ...Object.values(LICENSE_HEADLINE)]) {
      expect(text).not.toMatch(/\byou must\b|\bviolat|\billegal\b|\binfring/i);
    }
    expect(LICENSE_MEANING.BLOCKING).toMatch(/may be required/);
  });
});

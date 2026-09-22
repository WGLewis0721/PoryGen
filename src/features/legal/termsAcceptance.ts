export const TERMS_VERSION = "2026-09-22-v1";
const TERMS_STORAGE_KEY = "porygen.terms.acceptance";

export type TermsAcceptance = {
  version: string;
  acceptedAt: string;
};

export function getTermsAcceptance(): TermsAcceptance | null {
  try {
    const raw = localStorage.getItem(TERMS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TermsAcceptance>;
    if (parsed.version !== TERMS_VERSION || typeof parsed.acceptedAt !== "string") return null;
    return { version: parsed.version, acceptedAt: parsed.acceptedAt };
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentTerms() {
  return getTermsAcceptance() !== null;
}

export function acceptCurrentTerms(): TermsAcceptance | null {
  const acceptance: TermsAcceptance = {
    version: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify(acceptance));
    return acceptance;
  } catch {
    return null;
  }
}

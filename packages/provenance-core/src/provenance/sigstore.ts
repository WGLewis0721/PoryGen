// Sigstore signing boundary.
//
// PoryGen's attestations are always at least a "local hash-chain attestation"
// (see events.ts) and an "unsigned in-toto statement" (events.ts's
// InTotoStatement, unsigned). Genuine Sigstore signing — a Fulcio-issued
// short-lived cert bound to an OIDC identity, a Rekor transparency-log entry —
// needs a real OIDC flow this environment does not have credentials for.
//
// Rather than fake a signature, this adapter is the seam: swap
// `UnavailableSigstoreSigner` for a real `sigstore` client (the `sigstore` npm
// package implements the Fulcio/Rekor flow) once OIDC credentials exist, and
// every caller downstream — the evidence bundle, the ledger UI — already
// reads `attestationStatus()` rather than assuming a signature exists.

export type AttestationStatus =
  | "local hash-chain attestation"
  | "unsigned in-toto statement"
  | "sigstore signed";

export interface SigstoreBundle {
  mediaType: string;
  signature: string;
  certificate: string;
  rekorLogIndex: number;
}

export interface SigstoreSigner {
  readonly available: boolean;
  sign(payload: string): Promise<SigstoreBundle>;
}

/** The only signer wired up in this build: no OIDC credential is configured. */
export class UnavailableSigstoreSigner implements SigstoreSigner {
  readonly available = false;

  async sign(): Promise<SigstoreBundle> {
    throw new Error(
      "Sigstore signing unavailable in this environment: no OIDC identity token is configured. " +
        "Attestations fall back to a local hash-chain + unsigned in-toto statement.",
    );
  }
}

export function attestationStatusFor(signer: SigstoreSigner): AttestationStatus {
  return signer.available ? "sigstore signed" : "local hash-chain attestation";
}

export const defaultSigstoreSigner: SigstoreSigner = new UnavailableSigstoreSigner();

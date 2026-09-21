// SHA-256 helpers built on Web Crypto (`globalThis.crypto.subtle`), which is
// available natively in browsers, Node 20+, and Deno — one implementation,
// no dependency, runs identically in every PoryGen surface.

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function shortHash(hex: string, length = 10): string {
  return hex.slice(0, length);
}

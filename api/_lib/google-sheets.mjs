import { createSign } from "node:crypto";

// Minimal Google Sheets client for a service account. No SDK dependency:
// https://developers.google.com/identity/protocols/oauth2/service-account#httprest
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
// Per call. A cold signup makes three Sheets calls, so keep the total well
// inside the 30 s function limit.
const TIMEOUT_MS = 4_000;

export class SheetsError extends Error {
  constructor(message, status) { super(message); this.name = "SheetsError"; this.status = status; }
}

const base64url = value => Buffer.from(value).toString("base64url");

// Vercel/.env values usually carry the PEM with literal "\n" sequences.
export const normalizePrivateKey = key => String(key ?? "").replace(/\\n/g, "\n").trim();

export function signServiceAccountJwt({ clientEmail, privateKey, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey, "base64url");
  return `${header}.${claims}.${signature}`;
}

// A1 range for a tab; quotes are doubled per Sheets' sheet-name escaping.
// Without a tab name, Sheets uses the first visible tab.
const range = (tab, cells) => encodeURIComponent(tab ? `'${tab.replace(/'/g, "''")}'!${cells}` : cells);

export function createSheetsStore({ clientEmail, privateKey, spreadsheetId, tab = "", fetch = globalThis.fetch, now = Date.now }) {
  const key = normalizePrivateKey(privateKey);
  let cached = null; // { token, expiresAt } per warm instance

  async function call(url, init, what) {
    let response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new SheetsError(`${what} request failed.`, 0); }
    if (!response.ok) {
      if (response.status === 401) cached = null;
      throw new SheetsError(`${what} returned ${response.status}.`, response.status);
    }
    return response.json();
  }

  async function accessToken() {
    if (cached && cached.expiresAt > now() + 60_000) return cached.token;
    const assertion = signServiceAccountJwt({ clientEmail, privateKey: key, now: now() });
    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
    const json = await call(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, "Google token");
    if (typeof json.access_token !== "string") throw new SheetsError("Google token response had no access_token.", 502);
    cached = { token: json.access_token, expiresAt: now() + (Number(json.expires_in) || 3600) * 1000 };
    return cached.token;
  }

  const authed = async init => ({ ...init, headers: { ...init.headers, authorization: `Bearer ${await accessToken()}` } });

  return {
    // Column B holds the normalized email; row 1 is the header.
    async hasEmail(email) {
      const url = `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${range(tab, "B2:B")}?majorDimension=COLUMNS`;
      const json = await call(url, await authed({ method: "GET" }), "Sheets read");
      // toRow may have prefixed an apostrophe (formula guard); RAW stores it literally.
      return (json.values?.[0] ?? []).some(cell => String(cell).trim().replace(/^'/, "").toLowerCase() === email);
    },
    async appendRow(row) {
      // RAW stores every value as typed text, so nothing is evaluated as a formula.
      const url = `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${range(tab, "A:E")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await call(url, await authed({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [row] }) }), "Sheets append");
    },
  };
}

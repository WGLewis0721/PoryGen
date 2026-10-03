// Waitlist / beta-interest signup. Contact details are the one thing PoryGen
// deliberately persists from an anonymous visitor, so the stored shape is small
// and fixed. See docs/WAITLIST_API.md.

export const WAITLIST_CONSENT_VERSION = "2026-10-03-v1";
export const MAX_BODY_BYTES = 8 * 1024;
export const TEAM_SIZES = ["1", "2-10", "11-50", "51-200", "200+"];
// Order of columns A:J in the sheet; docs/WAITLIST_API.md lists the header row.
export const SHEET_HEADERS = ["submitted_at", "email", "name", "company", "role", "team_size", "use_case", "source", "consent_version", "status"];

const TEXT_FIELDS = { name: 100, company: 120, role: 80, useCase: 1000, source: 100 };
// Deliberately simple: one @, no spaces, a dotted domain. Delivery is the real check.
const EMAIL = /^[^\s@"<>()[\],;:\\]+@[^\s@"<>()[\],;:\\]+\.[^\s@"<>()[\],;:\\]{2,}$/;

export class WaitlistError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message); this.name = "WaitlistError"; this.code = code; this.status = status; Object.assign(this, extra);
  }
}

// Strip control characters and collapse whitespace; free text is single-line in the sheet.
const clean = (value, max) => String(value).replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Guard against spreadsheet formula injection if the sheet is exported to CSV/Excel.
export const cell = value => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export function validateSubmission(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WaitlistError("INVALID_REQUEST", "Send a JSON object.");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) throw new WaitlistError("EMAIL_REQUIRED", "Enter your email address.", 400, { field: "email" });
  if (email.length > 254 || !EMAIL.test(email)) throw new WaitlistError("INVALID_EMAIL", "Enter a valid email address.", 400, { field: "email" });
  if (body.consent !== true) throw new WaitlistError("CONSENT_REQUIRED", "Agree to be contacted about the PoryGen beta to join the waitlist.", 400, { field: "consent" });

  const fields = {};
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const value = body[field];
    if (value === undefined || value === null || value === "") { fields[field] = ""; continue; }
    if (typeof value !== "string") throw new WaitlistError("INVALID_FIELD", `${field} must be text.`, 400, { field });
    fields[field] = clean(value, max);
  }
  let teamSize = "";
  if (body.teamSize !== undefined && body.teamSize !== null && body.teamSize !== "") {
    if (!TEAM_SIZES.includes(body.teamSize)) throw new WaitlistError("INVALID_FIELD", `teamSize must be one of ${TEAM_SIZES.join(", ")}.`, 400, { field: "teamSize" });
    teamSize = body.teamSize;
  }
  return { email, teamSize, ...fields };
}

export const toRow = (entry, submittedAt) => [
  submittedAt, entry.email, entry.name, entry.company, entry.role, entry.teamSize,
  entry.useCase, entry.source, WAITLIST_CONSENT_VERSION, "waitlisted",
].map(cell);

// Best-effort, per warm instance. Vercel Firewall rate limiting is the durable layer.
export function createRateLimiter({ limit = 10, windowMs = 10 * 60_000, maxKeys = 10_000, now = Date.now } = {}) {
  const hits = new Map();
  return key => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter(at => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { allowed: false, retryAfter: Math.ceil((windowMs - (t - recent[0])) / 1000) };
    }
    recent.push(t);
    hits.delete(key); hits.set(key, recent);
    if (hits.size > maxKeys) hits.delete(hits.keys().next().value);
    return { allowed: true };
  };
}

export function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || String(req.headers?.["x-real-ip"] ?? "") || req.socket?.remoteAddress || "unknown";
}

// Same-origin by default; WAITLIST_ALLOWED_ORIGINS adds more. Requests without
// an Origin header (curl, server-to-server) are not browser CSRF and pass through.
export function originAllowed(req, allowedOrigins = []) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  return host === req.headers?.host || allowedOrigins.includes(origin);
}

const errorPayload = error => ({
  error: error.message, code: error.code, retryable: Boolean(error.retryable), ...(error.field ? { field: error.field } : {}),
});

export function createWaitlistHandler({ store, notifier = null, rateLimit = createRateLimiter(), allowedOrigins = [], now = () => new Date(), log = console }) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        throw new WaitlistError("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
      }
      if (!originAllowed(req, allowedOrigins)) throw new WaitlistError("ORIGIN_NOT_ALLOWED", "This origin cannot submit to the waitlist.", 403);
      const type = String(req.headers?.["content-type"] ?? "").split(";")[0].trim();
      if (type !== "application/json") throw new WaitlistError("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
      const limited = rateLimit(clientIp(req));
      if (!limited.allowed) {
        res.setHeader("Retry-After", String(limited.retryAfter));
        throw new WaitlistError("RATE_LIMITED", "Too many signups from this network. Try again later.", 429, { retryable: true });
      }
      const body = await readBody(req);
      // Honeypot: a hidden "website" input real visitors leave empty. Bots get a
      // normal-looking success and nothing is stored.
      if (typeof body?.website === "string" && body.website.trim()) return res.status(200).json({ ok: true, status: "joined" });
      const entry = validateSubmission(body);
      if (!store && !notifier) throw new WaitlistError("WAITLIST_UNAVAILABLE", "The waitlist is not open yet. Try again later.", 503, { retryable: true });
      const submittedAt = now().toISOString();
      const storageFailed = (what, error) => {
        log.error?.(what, error?.status ?? "", error?.message ?? error);
        return new WaitlistError("WAITLIST_STORAGE_FAILED", "We couldn't save your signup. Try again in a moment.", 502, { retryable: true });
      };
      // The sheet is the record; the email is an alert. With a sheet, a failed
      // alert is logged and the signup still succeeds. Without one, the email
      // is the only record, so its failure is the request's failure.
      let isNew = true;
      if (store) {
        try {
          isNew = !(await store.hasEmail(entry.email));
          if (isNew) await store.appendRow(toRow(entry, submittedAt));
        } catch (error) {
          throw storageFailed("waitlist storage failed", error);
        }
      }
      if (notifier && isNew) {
        try {
          await notifier.notify(entry, submittedAt);
        } catch (error) {
          if (!store) throw storageFailed("waitlist notification failed", error);
          log.error?.("waitlist notification failed (signup saved)", error?.message ?? error);
        }
      }
      // Identical response for new and existing emails, so the endpoint can't be
      // used to check who has signed up.
      return res.status(200).json({ ok: true, status: "joined" });
    } catch (error) {
      if (error instanceof WaitlistError) return res.status(error.status).json(errorPayload(error));
      log.error?.("waitlist failed", error);
      return res.status(500).json({ error: "Something went wrong. Try again later.", code: "WAITLIST_FAILED", retryable: true });
    }
  };
}

async function readBody(req) {
  let raw;
  if (req.body !== undefined) {
    // Vercel pre-parses JSON bodies; re-serialize only to enforce the size cap.
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      if (Buffer.byteLength(JSON.stringify(req.body)) > MAX_BODY_BYTES) throw new WaitlistError("REQUEST_TOO_LARGE", "Request is too large.", 413);
      return req.body;
    }
    raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
  } else {
    raw = await new Promise((resolve, reject) => {
      const chunks = []; let bytes = 0;
      const clean = () => { clearTimeout(timer); req.off("data", data); req.off("end", end); req.off("error", fail); req.off("aborted", fail); };
      const fail = () => { clean(); reject(new WaitlistError("INVALID_REQUEST", "Request interrupted.")); };
      const data = chunk => {
        const buffer = Buffer.from(chunk); bytes += buffer.length;
        if (bytes > MAX_BODY_BYTES) { clean(); req.pause(); reject(new WaitlistError("REQUEST_TOO_LARGE", "Request is too large.", 413)); }
        else chunks.push(buffer);
      };
      const end = () => { clean(); resolve(Buffer.concat(chunks)); };
      const timer = setTimeout(() => { clean(); req.pause(); reject(new WaitlistError("REQUEST_TIMEOUT", "Request timed out.", 408)); }, 5_000);
      req.on("data", data); req.on("end", end); req.on("error", fail); req.on("aborted", fail);
    });
  }
  if (raw.length > MAX_BODY_BYTES) throw new WaitlistError("REQUEST_TOO_LARGE", "Request is too large.", 413);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
  catch { throw new WaitlistError("INVALID_JSON", "Send valid UTF-8 JSON."); }
}

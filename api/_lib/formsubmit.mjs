import { WAITLIST_CONSENT_VERSION } from "./waitlist.mjs";

// Email alert for new waitlist signups via FormSubmit, the same relay the Gray
// Matter site's contact form uses: https://formsubmit.co
// The first message to a new address/site triggers a one-time activation email.

/** Every product's signups alert this inbox unless WAITLIST_NOTIFY_EMAIL overrides it. */
export const DEFAULT_NOTIFY_EMAIL = "graymattertechllc@gmail.com";
const TIMEOUT_MS = 8_000;

export class NotifyError extends Error {
  constructor(message, status) { super(message); this.name = "NotifyError"; this.status = status; }
}

// `to` may be the inbox address or the random alias FormSubmit gives after
// activation; `siteUrl` is the stable production URL FormSubmit identifies the form by.
export function createFormSubmitNotifier({ to, product, siteUrl, fetch = globalThis.fetch }) {
  const url = `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;
  return {
    async notify(entry, submittedAt) {
      const body = {
        _subject: `[${product}] New beta waitlist signup: ${entry.email}`,
        _template: "table",
        _captcha: "false",
        _replyto: entry.email,
        product,
        email: entry.email,
        name: entry.name,
        company: entry.company,
        role: entry.role,
        team_size: entry.teamSize,
        use_case: entry.useCase,
        source: entry.source,
        submitted_at: submittedAt,
        consent_version: WAITLIST_CONSENT_VERSION,
      };
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", referer: siteUrl, origin: new URL(siteUrl).origin },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new NotifyError("FormSubmit request failed.", 0);
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !(result.success === true || result.success === "true")) {
        // Includes the one-time "This form needs Activation" reply.
        throw new NotifyError(`FormSubmit did not confirm delivery (${response.status}): ${String(result.message ?? "no message")}`, response.status);
      }
    },
  };
}

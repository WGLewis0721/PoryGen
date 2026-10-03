import { useState, type FormEvent } from "react";
import "./waitlist.css";

export function WaitlistSection() {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setState("sending");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(values.get("name") || "").trim(), email: String(values.get("email") || "").trim(), website: String(values.get("website") || ""), consent: values.get("consent") === "on" }),
      });
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok || result?.ok !== true) throw new Error("Waitlist unavailable");
      // The Sheet is the record. The alert is best-effort and cannot change signup status.
      void fetch("https://formsubmit.co/ajax/graymattertechllc@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: `[PoryGen] New beta waitlist signup: ${String(values.get("email") || "").trim()}`,
          _template: "table", _captcha: "false",
          _replyto: String(values.get("email") || "").trim(),
          product: "PoryGen",
          name: String(values.get("name") || "").trim(),
          email: String(values.get("email") || "").trim(),
        }),
      }).catch(() => {});
      form.reset(); setState("success");
    } catch { setState("error"); }
  }

  return <section className="pg-waitlist" id="waitlist" aria-labelledby="pg-waitlist-title">
    <div className="shell pg-waitlist-grid">
      <div className="pg-waitlist-copy">
        <p className="pg-waitlist-overline">THE NEXT STEP</p>
        <h2 id="pg-waitlist-title" className="display">One scan catches today.<br/><em>What about tomorrow?</em></h2>
        <p>Scan a repo now without an account. Join the list for early access to connected GitHub and continuous monitoring when those features are ready.</p>
        <form className="pg-waitlist-form" onSubmit={submit}>
          <label htmlFor="pg-beta-name">Your name</label>
          <input className="pg-waitlist-name" id="pg-beta-name" type="text" name="name" autoComplete="name" placeholder="Your name" maxLength={100} required disabled={state === "sending"}/>
          <label htmlFor="pg-beta-email">Email for your beta invitation</label>
          <input className="pg-waitlist-trap" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
          <div className="pg-waitlist-fields"><input id="pg-beta-email" type="email" name="email" autoComplete="email" placeholder="you@example.com" required disabled={state === "sending"}/><button className="btn btn-primary" type="submit" disabled={state === "sending"}>{state === "sending" ? "Joining…" : "Join the beta list"}</button></div>
          <label className="pg-waitlist-consent"><input type="checkbox" name="consent" required disabled={state === "sending"}/> Email me a PoryGen beta invitation and occasional product updates. I can unsubscribe at any time.</label>
          <p className="pg-waitlist-feedback" role="status" aria-live="polite">{state === "success" ? "You're on the list. We'll email you when the beta opens." : state === "error" ? "We couldn't add you yet. Please try again later." : "No repo URL or source code is collected by this form."}</p>
        </form>
      </div>
    </div>
  </section>;
}

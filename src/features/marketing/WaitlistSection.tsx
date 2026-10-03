import { useEffect, useRef, useState, type FormEvent } from "react";
import "./waitlist.css";

export function WaitlistSection() {
  const video = useRef<HTMLVideoElement>(null);
  const [motion, setMotion] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element || !motion) { element?.pause(); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void element.play().catch(() => setMotion(false));
      else element.pause();
    }, { threshold: .2 });
    observer.observe(element);
    return () => { observer.disconnect(); element.pause(); };
  }, [motion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setState("sending");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "porygen", email: String(values.get("email") || "").trim(), consent: values.get("consent") === "on", source: "homepage" }),
      });
      const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok || result?.ok !== true) throw new Error("Waitlist unavailable");
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
          <label htmlFor="pg-beta-email">Email for your beta invitation</label>
          <div className="pg-waitlist-fields"><input id="pg-beta-email" type="email" name="email" autoComplete="email" placeholder="you@example.com" required disabled={state === "sending"}/><button className="btn btn-primary" type="submit" disabled={state === "sending"}>{state === "sending" ? "Joining…" : "Join the beta list"}</button></div>
          <label className="pg-waitlist-consent"><input type="checkbox" name="consent" required disabled={state === "sending"}/> Email me a PoryGen beta invitation and occasional product updates. I can unsubscribe at any time.</label>
          <p className="pg-waitlist-feedback" role="status" aria-live="polite">{state === "success" ? "You're on the list. We'll email you when the beta opens." : state === "error" ? "We couldn't add you yet. Please try again later." : "No repo URL or source code is collected by this form."}</p>
        </form>
      </div>
      <div className="pg-waitlist-visual">
        <video ref={video} muted loop playsInline preload="none" poster="/images/waitlist/porygen-poster.webp" aria-label="First light moves across a ridgeline"><source src="/images/waitlist/porygen-loop.mp4" type="video/mp4"/></video>
        <button type="button" aria-label={motion ? "Pause waitlist motion" : "Play waitlist motion"} aria-pressed={motion} onClick={() => setMotion(value => !value)}>{motion ? "Pause motion" : "Play motion"}</button>
      </div>
    </div>
  </section>;
}

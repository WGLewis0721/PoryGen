# PoryGen — Waitlist Promo Video Storyboard

Replaces the current 4s silent Higgsfield loop in the homepage waitlist section (`src/features/marketing/WaitlistSection.tsx`). Target: a short, premium motion-graphic cutdown that earns its place next to a sign-up form, not a feature-dump explainer.

## The one thing this video proves

**PoryGen looks at your code and tells you, with evidence, where it may have come from — without ever claiming to be an AI detector or a verdict.** The whole video is one gesture: a block of ordinary-looking code goes IN, and a calm, evidence-backed answer comes OUT. The reward is the moment the match resolves — clean, specific, undramatic. Confidence through restraint, not hype.

Tone: forensic clarity. Dark, high-contrast, technical — closer to a terminal / diagnostic tool than a startup "exciting!!" ad. No urgency music-video energy. No fake AI panic.

## Production note (read first)

Generative video models (Higgsfield included) cannot render legible, accurate on-screen code, diffs, or UI chrome — text comes out warped or nonsensical. **Do not attempt to generate the scan UI itself.** Split the work:

- **Real screen capture** (Playwright/browser recording of porygen.vercel.app/scan against a real repo) for every shot that shows actual code, the match card, or the report. This is the product — it must be legible.
- **Higgsfield-generated b-roll** only for the abstract/atmospheric connective tissue: particle fields standing for "indexed public source," light sweeps, the abstract network-of-origin visual in Scene 2, and the ambient background behind text cards.
- Composite in an editor (After Effects/Premiere/Remotion). Treat Higgsfield output as background plates, not the final frame.

## Reference videos (study these, don't clone them)

1. **Vercel homepage hero reels** — black background, one crisp UI element at a time, generous negative space, grid-snap motion. Borrow: restraint, the "one hero element per beat" pacing.
2. **Linear "Linear 2024/2025" product films** — dark UI, razor-sharp typography, motion that feels like the product's own easing curves, not stock after-effects swoops. Borrow: using the product's real cursor/keyboard interactions as the camera's subject.
3. **GitHub Copilot launch films** — code typing into an editor, suggestion appears, accepted with a keystroke. Borrow: the beat structure of "input → quiet pause → resolved answer," and using a monospace font as a hero typographic element.
4. **Grammarly "see it work" demos** — text gets a colored underline, a card pops with the specific reasoning, user accepts. Borrow directly: PoryGen's match-highlight-and-explain moment is structurally the same gesture as Grammarly's correction card — steal that card choreography, not the brand.
5. **Arc Browser "Little Arc" / tab-boop ads** — ultra-minimal motion, a single object (a tab, a card) moves with physical weight and a satisfying snap-to-rest. Borrow: the snap/settle timing for the match card landing in place.

## Spec sheet

- Length: 18–22s hero cut; also deliver a seamless 4–6s loop cutdown for the homepage section (match current slot).
- Resolution: 1920×1080 min source, export H.264 mp4 + webp poster, matching existing `public/images/waitlist/porygen-*` naming.
- No voiceover. Captions/on-screen text only (the form sits right next to it — silence is correct, per the current component).
- Palette: pull exact hex/tokens from `src/features/marketing/waitlist.css` and the site's existing dark theme — do not invent new brand colors.
- Typography: monospace for all code/match text (the product's own scan output font), sans for UI chrome labels.
- Loop seam: last frame must match first frame's composition (same code block idle state) so the 4–6s cutdown can tile invisibly if autoplay runs continuously.

## Storyboard

| # | Time | Visual | Motion / camera | On-screen text | Why |
|---|---|---|---|---|---|
| 1 | 0:00–0:02 | Blank dark canvas, cursor blinking in an empty editor pane | Static, slow push-in | — | Cold open on nothing — sets the "ordinary moment" tone |
| 2 | 0:02–0:05 | Real screen capture: a believable snippet of plain-looking JS/TS code types/paste in (real capture, not generated) | Camera holds; text appears via real typing capture, not a fake generative "typing" effect | — | This is the input — looks like any code, which is the point |
| 3 | 0:05–0:08 | Cut to Higgsfield b-roll: abstract field of thousands of tiny glowing fragments (standing for the 50,633-file indexed corpus), camera drifting through it | Slow dolly through the particle field, shallow depth of field | "1,017 packages. 50,633 files indexed." (small, bottom-left, understated) | Establishes scale without claiming the internet is searched — matches CLAUDE.md's "always describe coverage as limited" |
| 4 | 0:08–0:11 | Cut back to real screen capture: scan runs, a quiet progress state, then specific lines in the pasted code get a thin colored underline (Grammarly-style, but sparse — 2–3 lines, not the whole block) | Camera holds on the editor; underline draws on with a fast, precise line-draw animation | — | The "detection" moment — intentionally undramatic, specific |
| 5 | 0:11–0:15 | Real screen capture: a match card slides/snaps into place beside the underlined lines (Arc-style physical snap), showing package name, license, side-by-side excerpt | Card enters from off-frame right, snaps to rest with a tiny overshoot-settle | "Possible source found." then beneath it, smaller: "Not proof of copying. Evidence, not a verdict." | This is the core promise and the required honesty language from CLAUDE.md — it must be on screen, not just implied |
| 6 | 0:15–0:18 | Pull back to show the full report view: match card, license tag, "Review / Dismiss" actions, clean and calm | Slow pull-back/zoom-out revealing the whole report layout | — | Shows the product is a workflow tool, not a one-off trick |
| 7 | 0:18–0:20 (**the reward**) | Hard cut to a clean, high-contrast title card: PoryGen wordmark, the question restated | Wordmark assembles from the same particle material as Scene 3 — ties the abstract "indexed source" visual to the brand itself, then resolves to crisp, still type | **"Does this code meaningfully resemble code that exists somewhere else?"** then a beat, then: **"Find out. Join the beta."** | The reward isn't a feature flex — it's the product's one real question, answered calmly, landing on the CTA the form sits under |
| 8 | 0:20–0:22 | Settle on the title card, held static for the loop seam | Static hold | small print: "Scan a repo, ZIP, or folder — no account required." | Matches the live CTA; last frame composition should echo Scene 1's emptiness for loop tiling |

## Reward design note

The "reward for staying" is deliberately *quiet* — a resolved, specific, honestly-hedged answer, not a confetti burst. That restraint is the brand. If anything in the cut feels like a dopamine-farm reveal (particle explosion, triumphant swell), cut it — PoryGen's whole positioning is "not proof, not certification, not an AI detector."

## Higgsfield production guidance

- Use **generate_video** for Scenes 3 and 7's particle material only — prompt for "field of thousands of tiny glowing geometric fragments drifting in dark space, shallow depth of field, cinematic, dark blue/graphite palette, no text, no UI" — keep it abstract and text-free since Higgsfield will mangle any attempted on-screen code or logos.
- Do not use `motion_control` or UI-replacement tools to try to animate real app screenshots — composite the real screen captures manually instead.
- If a product-shot/mockup workflow is used for the wordmark assembly (Scene 7), treat the Higgsfield output as the particle plate underneath type that's set normally in the editor, not as generated typography.

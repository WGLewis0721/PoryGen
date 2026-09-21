# PoryGen design system

Direction: premium, cinematic, founder-first. Closer to an excellent outdoor/editorial brand
than a security console. Written for an AI-fatigued audience, so it deliberately avoids 2024–26
AI SaaS conventions: no purple/blue gradients, glass, glows, bento grids, floating pills, fake
dashboards, logo walls, or scattered uppercase eyebrows. Tokens: `src/styles/tokens.css`.

## Mood

Composed, warm, expansive. Rules out: neon, cyber, gamified, "AI magic".

## Typography

| Role | Face | Notes |
|---|---|---|
| Display (headlines, wordmark, big numbers) | **Newsreader** (Production Type, OFL) | Self-hosted subset `public/fonts/newsreader-opsz-latin.woff2`: Latin, optical size pinned to the 56pt display cut, weight 340–560 (47 KB), preloaded. Weight 400–450, tracking −0.015 to −0.022em, line-height 1.02. |
| UI and body | **Public Sans** (USWDS, OFL) | Fontsource variable, Latin split. 400 body, 600 labels/buttons. |
| Code | **JetBrains Mono** (OFL) | Code panes and paths only. Ligatures off (`=>` must read as `=>`). |
| Handwritten notes | **Caveat** (OFL) | Subset: lowercase, digits, basic punctuation, weight 500 (16 KB). One or two annotations per page, never body copy. |

Fallbacks are metric-matched to avoid layout shift: Newsreader → Georgia (`size-adjust` 98.9%,
ascent 74.3%, descent 26.8%); Public Sans → Arial (105.2%, 90.3%, 21.4%).

Scale: `--text-2xs` 11px … `--text-4xl` clamp(2.5rem → 4.25rem); hero clamp(2.75rem → 9.25rem).
Sentence case everywhere (a deliberate exception to Title Case conventions). Headings use
`text-wrap: balance`; quotes and apostrophes in display copy are typographic (“ ” ’).

Regenerating the font subsets: instance and subset with fontTools (`fontTools.varLib.instancer`
then `fontTools.subset`, WOFF2 via brotli) from the Fontsource packages; recompute fallback
overrides from letter-frequency-weighted advance widths.

## Color

| Token | Value | Role |
|---|---|---|
| `--ink-950` | #0b0d10 | Page ground (graphite, near black) |
| `--ink-900/850/800` | #101317 / #151a20 / #1b2129 | Raised surfaces, code panes |
| `--slate-800` | #1c283f | Deep slate blue — the brand's core surface (product section, active nav, recommended plan) |
| `--cloud-100` | #eeebec | Primary text on dark |
| `--mist-400/500` | #a0a2a9 / #7d8088 | Secondary / tertiary text (both ≥ 4.5:1 on ink) |
| `--sand-100` | #f4eee4 | Paper — the one light editorial section per page |
| `--sunrise-500` | #f0913a | The accent. Primary CTA, focus ring, matched-line edge, handwriting. One accent per view. |
| `--clear` / `--common` / `--review` / `--strong` | #7fb08a / #8ea3c2 / #e3a53e / #e8674d | Finding vocabulary, always paired with an icon and a word — never color alone |

Focus: 2px sunrise outline, 3px offset (darker `--sunrise-600` on sand).

## Layout and rhythm

12-column feel, generous margins (`--gutter` clamp 16–40px, shell 1240px), section padding
clamp(5rem → 11rem). Hairline rules instead of boxes; the only card-like surfaces are functional
(the finding card, code panes, the action panel, plan columns). Page rhythm on the homepage:
cinematic image → dark type → deep slate → sand paper → split image → dark → image.

## Components

- **Buttons**: 2px radius, 44px min height. Primary = sunrise fill, dark ink, uppercase 0.1em
  tracking. Secondary = hairline outline. Ghost for tertiary actions.
- **Tags** (finding vocabulary, status): small rectangles with a wash, a Lucide icon, and a word.
- **CodeCompare**: two dark panes (your code / possible source), line numbers, matched lines
  washed and edged in sunrise, unmatched lines dimmed; stacks under 860px.
- **EvidenceList**: definition list, term column + detail; `evidence-stacked` variant for grids.
- **ResolutionTimeline**: five-stage rail (Found → Reviewed → Remediated → Rescanned → Resolved),
  vertical on phones; history list with system/user markers.
- **Scrawl**: hand-drawn SVG underline and arrow in sunrise — the single human gesture.

Icons: Lucide at 1.4–1.6 stroke, matching the reference board (code, shield-check, pencil,
refresh, history).

## Motion

One orchestrated load on the homepage hero: image settles (opacity + 1.05 → 1 scale, 2.2s), the
two headline lines rise with a 150ms stagger, then lede, CTAs, note. Sections fade up once on
first view. The demo animates its scan progress and panel transitions. Only transform and
opacity animate; `prefers-reduced-motion` removes all of it (the demo also skips its scan
animation).

## Imagery

Cinematic landscape at first/last light, subject small in frame, deep shadows, warm highlights,
35mm grain. Generated for PoryGen and documented in VISUAL-PLAN.md. Always under a scrim or
beside type, never behind body copy without one.

## Responsive

Mobile-first; verified at 320px with no horizontal overflow. The hero moves copy to the top on
narrow screens so the runner stays visible; split sections stack image-first; code panes stack;
the app sidebar becomes a top bar with a disclosure menu.

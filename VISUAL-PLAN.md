# Visual plan

All photography-style imagery on the site was **generated for PoryGen** with Higgsfield's
`soul_location` model on 2026-09-21, on the project owner's Higgsfield account. None of it depicts a
real person or a real product. The footer states "Landscape imagery generated for PoryGen." The
design reference board (`src/styles/Gemini_Generated_Image_34rhpa34rhpa34rh.jpg`) is a direction
document, not shipped.

| Asset | Placement | Purpose | Subject / art direction | Desktop | Mobile | Negative space | Source job | Files | Budget | Alt intent |
|---|---|---|---|---|---|---|---|---|---|---|
| `hero-ridge` | Homepage hero, full bleed | The promise: momentum and open territory | Lone trail runner mid-stride on an alpine ridge at first light, warm dust lit by the low sun, mist-filled valley, graphite shadows, 35mm film | 21:9 (2560×1072) | 900×1072 crop centred on the runner (`hero-ridge-portrait`), used ≤ 900px | Left half and sky for the headline; runner sits right of copy | `385eb81e-eb1f-4ecb-aa7a-4905935d7405` | AVIF + WebP at 960 / 1600 / 2560 (portrait 720 / 900) | 44 KB AVIF at 2560 | Runner crossing a ridge at sunrise, mist below |
| `lookout-dusk` | "Stay protected" split section (right half) | Continuous watch, without a fake dashboard | Wooden fire lookout on a forested ridge at blue hour, one lit window, town lights, orange horizon band | 16:9 (2048×1152), cropped to the tower | Same image at 4:3, image-first | None needed (type sits beside it) | `e831e5e3-cb8b-4db2-bb11-9147837b988f` | AVIF + WebP at 960 / 1600 / 2048 | 26 KB AVIF at 2048 | Lookout at dusk, one window lit |
| `desk-window` | Final CTA (full bleed) and auth pages | The founder at work — calm, human | Wooden desk by a window at golden hour, laptop and notebook, desert mountains outside; room in shadow | 16:9 (2048×1152) | Same, copy moves to the bottom | Dark interior on the right for the CTA | `65c438ba-755f-4f5f-a177-c9aab733602c` (bezel pseudo-text retouched out) | AVIF + WebP at 960 / 1600 / 2048 | 47 KB AVIF at 2048 | Laptop and notebook by a window, mountains in evening light |
| `og-image` | Open Graph / social card | Share preview | Crop of `hero-ridge` | 1200×630 JPEG | — | — | derived | `og-image.jpg` | 52 KB | — |
| `favicon.svg` | Browser tab | Mark | Newsreader "P" glyph outline + sunrise dot on deep slate | 64×64 SVG | — | — | drawn from the font with fontTools | `public/favicon.svg` | 1.2 KB | — |

Processing: generated PNGs → sharp (AVIF q52 / WebP q74) in a scratch workspace; `<picture>`
with art-directed sources, explicit dimensions, `fetchpriority="high"` + an inline preload for the
hero on `/`, lazy loading for everything below the fold.

Do not regenerate approved assets; add new rows here before generating anything new.

# Opus handoff

Non-blocking aesthetic/interaction refinement only. Everything below is explicitly
optional — the product is complete and demoable without any of it. Each item below also
exists as an inline `<!-- OPUS_TASK: ... -->` comment at its usage site.

## 1. Bit-Critter gaze kinematics

**Where**: `src/components/BitCritter.tsx` (comment above the `BitCritter` export).

**Current behavior**: the sensor lens (`.pg-critter-lens` / `.pg-critter-lens-glint`) is
static aside from its autonomic blink animation.

**Desired improvement**: pointer-following sensor/gaze movement and subtle head
attitude, so the critter appears to track the cursor on the marketing hero.

**Constraints**: `requestAnimationFrame` + spring interpolation, not a raw
`pointermove` → `transform` binding. Clamp apparent head rotation to ~±5°. Disable
entirely under `prefers-reduced-motion: reduce` (checked via `matchMedia`, since this is
JS-driven, not CSS-only). Must not regress keyboard or touch behavior — this is a
pointer-only enhancement.

## 2. Scanner physiological choreography

**Where**: `src/features/scanner/ScanPage.tsx` (documented in the component; not yet
marked with an inline comment — add one if picking this up).

**Current behavior**: the Bit-Critter's state (`idle`/`ingesting`/`healthy`/`review`/
`blocking`) is driven directly by `scan.status`/`scan.risk_level`, with CSS-only
autonomic animation per state (breathing, blink, scanline sweep, glitch).

**Desired improvement**: richer physical behavior keyed to scan *microstates* (e.g. a
distinct beat when `analyzing_licenses` finds something, a different rhythm for
`fingerprinting` vs `indexing`) and terminal-output rhythm synchronized to it.

**Constraints**: event-driven and deterministic — no random animation loops. Preserve
reduced-motion behavior (already implemented for the existing states).

## 3. Deterministic provenance telemetry player

**Where**: `src/features/provenance/ProvenanceLedgerPage.tsx`.

**Current behavior**: the ledger renders the full seeded event list statically, with
source-type filtering.

**Desired improvement**: a playback controller (play/pause/reset/1×/2×) over the seeded
event timeline, synchronizing event-stream scroll position, attestation-panel
highlighting, and Bit-Critter vital response to simulated "current time" as it advances
through the real `event_timestamp` sequence.

**Constraints**: deterministic timeline data (the real seeded events, already ordered),
not random DOM mutation. Preserve reduced-motion behavior.

## Explicitly not Opus's

Per the scope contract this build followed: authentication, database tables, RLS,
routing, Stripe, scanner architecture, API integration, the core provenance ledger, and
error handling all belong to the Sonnet pass and are done. Nothing above touches any of
those.

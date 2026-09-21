# Demo flow

Two demos exist, for two audiences.

## 1. Public sample demo — `/demo` (no account)

For a prospective customer who should understand PoryGen in about 90 seconds without signing up,
confirming an email, configuring anything, or installing an extension.

**What's real and what isn't.** The repository ("Lattice", `lattice-app`) and the "public
source" projects (under `git.example.org`, a reserved domain) are fictional and written for the
demo. The scan is real: `src/features/demo/sampleEngine.ts` runs the production
`runScanPipeline` in the browser with a `sample-corpus` provider built on the same
`createStaticCorpusProvider` as real scans. 307 of the sample's 312 files are simulated as clear
(paths only); the five real sample files are scanned. The page is labelled *Sample interactive
demo* throughout. No backend calls, nothing written.

**Guided path:**

1. **Start** — context: the agent committed `a3f9c21` "Add API rate limiting". *Run sample scan.*
2. **Scanning** — progress over file paths and pipeline phases (skipped under reduced motion).
3. **Summary** — 312 files checked: 309 clear · 1 common pattern · 1 review suggested · 1 strong
   source match. Findings list with scores and licenses. *Open finding.*
4. **Finding** — *Strong source match in `src/api/rateLimit.ts`*: your code beside the possible
   source with matched lines highlighted; similarity 93% (74 of 80 structural fingerprints);
   possible source `git.example.org/sample-oss/slidewindow` (fictional); license GPL-3.0 and what
   it means; the engine's "why it was flagged" sentence; what was compared against. Actions:
   *Replace it — simulate the fix* (recommended), *Start review*, *Dismiss as false positive*,
   *Accept the risk*.
5. **Fix** — the replacement in `b81e0d4`: a different design (fixed-window counter on the app's
   cache). *Record fix and rescan.*
6. **Rescan** — the real pipeline runs on the new revision.
7. **Resolved** — 93% → 6% (below the 55% threshold), counts update (0 strong), the stage rail
   reads FOUND → REVIEWED → REMEDIATED → RESCANNED → RESOLVED, and the history lists detected,
   fix recorded, clean rescan.
8. **End** — "Want PoryGen watching your real repo?" → *Scan your repo* (`/sign-up`).

**Alternate paths:** *Dismiss* and *Accept the risk* require a reason (an empty reason is
refused with an inline error), record it in history, and explain that the decision survives
rescans; *Try the fix path instead* reopens the finding and the history keeps the detour.

Covered by `src/features/demo/DemoPage.test.tsx` (full guided path and the reason rule) and
`sampleEngine.test.ts`, which also keeps the homepage's pinned sample numbers identical to the
engine's output.

## 2. Authenticated walkthrough

1. **Account** — `/sign-up` → confirmation email (Supabase Auth) → `/sign-in`.
2. **Scan** — `/repositories/new` → a public GitHub URL (e.g. `https://github.com/expressjs/cors`)
   → *Run scan*. The scan page shows each phase live, then per-file results (clear / common
   pattern / review suggested / strong source match), *Needs attention*, informational rows, and
   *What this scan compared against*.
3. **Finding** — open a flagged finding: what PoryGen found, where it is and what it might
   resemble (side by side), how strong the evidence is, license context, why it matters, and
   *Did the fix pass?*. Actions on the right: start review, record a fix (with a revision), dismiss
   or accept risk (reason required), add a note, rescan.
4. **Rescan** — *Rescan repository*. `sync_tracked_findings` resolves what the scan re-checked
   and no longer sees, records a failed fix if it's still there, and reopens anything that came
   back.
5. **Overview** — `/dashboard`: *Your codebase today* (clear changes, review suggested, open
   source collisions, resolved), open findings, recent activity and resolutions, repositories.
6. **History** — `/history`: every resolution event across repositories; *Editor attribution*
   shows the optional VS Code ledger.
7. **Evidence** — from a scan, *Export evidence*: JSON download or print summary, including
   resolution history and coverage.
8. **Sample repository** — `porygen/lattice` (public, read-only) shows all three outcomes: a
   strong match in review, an AGPL dependency with an accepted risk and its reason, and a legacy
   file resolved by a clean rescan after it was deleted. Actions are disabled there.

Requires the resolution-history migration; without it, steps 3–6 show an explicit "not enabled
on this deployment yet" state.

## 3. Billing (operator)

`/billing` shows the current plan (derived from verified webhooks), usage against the plan
(displayed, not enforced), and plan options. With subscription prices unconfigured, checkout is
disabled and `create-checkout` answers `PLAN_NOT_CONFIGURED`. `/billing/diagnostics` shows
non-secret Stripe state, subscription price status, and the separate APEX dogfood section — see
[APEX_DOGFOOD.md](APEX_DOGFOOD.md).

## Quality checks

```bash
npm install
npm run build   # tsc -b && vite build
npm test        # vitest, all workspaces + PGlite database tests
npm run lint    # oxlint (warnings only)
```

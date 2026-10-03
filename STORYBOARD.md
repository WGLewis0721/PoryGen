# PoryGen waitlist product film

## Purpose

Make a 20-second silent PoryGen film that earns its last reveal with proof: **the exact source evidence behind a meaningful code-origin finding**. It must position PoryGen as an evidence-first source scanner, not an AI-content detector and not a fake “originality certificate.”

## Product truth to preserve

PoryGen scans a public GitHub URL, ZIP, or local folder without requiring an account. It supports JavaScript/TypeScript/Python and treats private uploaded source as non-persistent. It retrieves candidates and validates them using structural representations plus source-specific lexical evidence. Ordinary patterns remain possible/common; a clean result means no sufficiently specific match was found in the scanned scope—not that code is globally original.

## Reference grammar

Use [Snyk Open Source security management](https://snyk.io/product/open-source-security-management/) as the reference for a developer-first `scan → prioritize → evidence → act` narrative. Do not imitate Snyk’s design, language, dashboard, product claims, or security framing.

## Deliverable and placement

- Master: 3840 × 2160, 16:9, 20.0 seconds, 30 fps, ProRes 422 HQ.
- Web: 1440 × 810 muted H.264 MP4 plus WebP poster; target under 8 MB.
- Autoplay only while visible; do not loop. Hold the evidence end state with a replay control. Reduced motion uses its final poster.
- Use the existing dark PoryGen visual world and real scanner UI states. Code must be real-looking, readable, and licensed/fictional—not scraped from an unapproved repository.

## Film sentence

**A source scan should end with evidence you can inspect, not a verdict you have to trust.**

## Beat grid

| Time | Picture and motion | On-screen copy | Product proof |
| --- | --- | --- | --- |
| 0:00–0:02.5 | A compact GitHub URL field and code fragment sit on the dark PoryGen horizon. The URL snaps into a scan target; no huge “AI detector” type. | `Scan the source.` | Public GitHub input is concrete and developer-native. |
| 0:02.5–0:05.0 | A scoped scan begins. Three small lanes appear: `structure`, `candidate sources`, `validation`. The code stays present beneath the progress indicator. | `Look beyond a pattern.` | Explains that scanning is more than a raw text search. |
| 0:05.0–0:08.0 | Candidate cards surface, then most fade to `common pattern`. One remains as `requires review`—an intentional act of discernment. | `Possible is not proof.` | Ordinary code does not become a false accusation. |
| 0:08.0–0:12.0 | The surviving finding opens into a clear side-by-side evidence view: local file and candidate source, with matching identifiers/structure highlighted. | `Show me why.` | Source-specific evidence, not a mysterious score. |
| 0:12.0–0:15.0 | A provenance drawer reveals `source`, `license`, `version`, and `scope`. It is marked `Sample scan` to avoid presenting a live third-party finding. | `Inspect the context.` | The reviewer gets actionable context. |
| 0:15.0–0:17.5 | A gentle split happens: the rejected `common pattern` card rests on one side; the evidence-backed finding stays on the other. | `Evidence, not a verdict.` | Clearly communicates abstention and distinction. |
| 0:17.5–0:20.0 | **Final reward.** The end frame holds the full source-evidence panel with the exact code relationship, provenance, and a decisive `Review finding` action. | `Know what PoryGen found.`<br>`Join the beta` | The delayed payoff is inspectable evidence. |

## Art and motion direction

- Dark, cinematic, precise, and calm. Let code, line highlights, and evidence edges create texture; avoid green terminal rain, lock/shield tropes, cyberpunk particles, or red “plagiarism detected” alarms.
- Each candidate must have a fate: it is narrowed, rejected as common, or opened with evidence. Use geometry to show the filtering process.
- Keep source and local code line numbers large enough for an engineering audience. Use one accent color for validated evidence and neutral tones for ordinary patterns.
- Transition by expanding a line highlight into the next surface; do not smash-cut between dashboards.

## Required assets before animation

1. Current scan-input, progress, candidate, evidence, and provenance UI captures.
2. An approved fictional/sample repository pair whose code can be shown and compared legally.
3. Brand mark, fonts, dark-surface tokens, scan/evidence icons, and a text-safe code font.
4. A specific sample finding with correct source URL, license/version labels, and an accurate scope statement.

## Honest-demo rules and acceptance test

- Never call the product an AI detector or claim it proves originality, copyright infringement, or legal compliance.
- The displayed candidate must have a real relationship to the sample local code; if it does not, replace it with a no-finding story.
- Do not store/claim persistence of private uploads in the video.
- Muted viewers must understand: source goes in → candidates are evaluated → one finding is backed by evidence and provenance.
- Freeze the final evidence view for at least 2.5 seconds; it is the product reward, not a logo end card.

## Implemented production treatment

The final render is a silent 20-second product walkthrough with seven workflow beats, a short Higgsfield materials transition, and a held final UI outcome. Exact UI and copy are deterministic, fixture-based reconstructions of the current components. Native 3840×2160 H.264 masters and 1440×810 web exports are produced by `scripts/film/render.py`; H.264 replaces the proposed ProRes archival format. See `scripts/film/README.md` for reproducible rendering and playback acceptance. The original waitlist form contract remains unchanged.

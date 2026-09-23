# Source Match Report

After a completed `/scan`, choose **Download Source Match Report**. The browser
creates a standalone HTML file. Open it offline, or use the browser Print menu
and Save as PDF. There is no report API, hosted sharing, or new storage.

The export captures the displayed scan and current decisions, including dismissed
findings and reasons. It does not use edits to the input form after that scan.
The project label is the scanned repository, ZIP filename, or selected folder.
Completion time is browser-observed, explicitly labelled; it is not a server audit
timestamp. Git commits and upload content digests are labelled separately.

Coverage includes checked paths, incomplete reasons, exclusions, server omission
counts and folder omissions before upload. Client and server exclusion counts
are separate. Empty scans never imply a clean project. Upload scope does not
establish original-project completeness. Possible finding counts disclose any
server evidence cap. In-review status is not completed approval.

Evidence includes affected/source ranges, pinned URLs provided by the engine,
full recorded commits, license links, explanation, metrics and excerpts capped
at 4,000 characters each (explicitly marked when shortened). Nothing is inferred
about missing versions or licenses. Strong findings include dismissed items.

The HTML escapes untrusted text, permits only HTTPS metadata links without URL
credentials, has no scripts or external assets, and includes a restrictive CSP.
Exported excerpts are deliberately saved to the user's device; the UI states this
before download. The existing upload privacy behavior and matching semantics are
unchanged. The report is editable and unsigned, not an originality certificate
or legal advice.

Checks: `npx vitest run src/features/publicScan` and `npm run build`.

# All-public-repository report smoke test

Production commit: `117e4af`. Tested 2026-09-23 through the live browser UI.

30 public repositories discovered via GitHub account search. 29 completed scans and actual HTML downloads verified against visible scan counts, possible totals, empty/partial states and limitations. No strong findings returned in these scans; this is not proof of originality. Three partial scans, three completed zero-file scans. Scan-reported median 1.1 seconds, maximum 7.6 seconds; excludes UI/download overhead.

One reproduced failure: `Obby-CyberTruck` has no commits. GitHub commit resolution returns 409 with `Git Repository is empty.` and the adapter previously surfaced only HTTP 409. A narrow fix maps only this explicit response to the existing zero-file scan pipeline with no invented commit. Generic 409 remains an error. Fix tested locally, not yet deployed.

Automation initially navigated away before eight downloads completed; those exports were repeated and actual files verified. This was a test timing issue. PDF appearance was not tested. No matcher benchmarks or threshold changes.

| Repository | Production result | Observed state |
| --- | --- | --- |
| openclaw-wgl | PASS | Partial scan: 150 files checked. No strong source match in the files checked. |
| itsm-tier1-agent | PASS | No eligible source files were scanned |
| Codex-test-wgl | PASS | 79 files checked. No strong source match. |
| K8s-Ai-WGL | PASS | No eligible source files were scanned |
| AWS-Labs | PASS | No eligible source files were scanned |
| William-Lewis-Eng | PASS | 5 files checked. No strong source match. |
| Studigo-ai | PASS | 91 files checked. No strong source match. |
| apex | PASS | 68 files checked. No strong source match. |
| jobhound-ai | PASS | Partial scan: 150 files checked. No strong source match in the files checked. |
| PoryGen | PASS | Partial scan: 150 files checked. No strong source match in the files checked. |
| Cassidy_singer | PASS | 1 file checked. No strong source match. |
| laundry-delivery | PASS | 10 files checked. No strong source match. |
| Obby-Cybertruck-Lincoln | PASS | 1 file checked. No strong source match. |
| SIEM-copilot- | PASS | 8 files checked. No strong source match. |
| mypc | PASS | 39 files checked. No strong source match. |
| Graymattertechllc- | PASS | 57 files checked. No strong source match. |
| Obby-CyberTruck | FAIL | GitHub HTTP 409; repository has no commits |
| 36Chambers-Barbershop | PASS | 28 files checked. No strong source match. |
| Songvault-ksb- | PASS | 2 files checked. No strong source match. |
| AGT-2026 | PASS | 8 files checked. No strong source match. |
| stormchasers | PASS | 1 file checked. No strong source match. |
| afoqt-coach-ai | PASS | 9 files checked. No strong source match. |
| Ollama-WebUI-Log-Agent | PASS | 16 files checked. No strong source match. |
| Shaolin-slurp | PASS | 3 files checked. No strong source match. |
| fundmatch | PASS | 140 files checked. No strong source match. |
| Rosie-scanner | PASS | 28 files checked. No strong source match. |
| gme-church-website | PASS | 22 files checked. No strong source match. |
| voting-al-website | PASS | 1 file checked. No strong source match. |
| soul-broth-co | PASS | 4 files checked. No strong source match. |
| robinson-architecture | PASS | 6 files checked. No strong source match. |

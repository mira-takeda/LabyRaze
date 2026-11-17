# Release and licensing audit ? private preparation

The original software is GPL-3.0-only; see LICENSE and LICENSE-SCOPE.md. No public repository, remote or release has been created. LABYRAZE remains a provisional title, and visible KiroBit identity is unchanged.

## Dependencies and notices

| Package | Pinned version | Installed licence field | Scope |
| --- | --- | --- | --- |
| @types/node | 26.6.6 | MIT | development |
| eslint | 10.14.0 | MIT | development |
| fast-check | 4.10.2 | MIT | development |
| happy-dom | 21.0.4 | MIT | development |
| puppeteer-core | 25.17.0 | Apache-2.0 | development |
| tsx | 4.23.15 | MIT | development |
| typescript | 6.0.3 | Apache-2.0 | development |
| typescript-eslint | 8.72.2 | MIT | development |
| vite | 8.3.8 | MIT | development |
| vitest | 5.1.0 | MIT | development |

There are no runtime npm dependencies. All lockfile packages are marked development-only. The production bundle does contain Vite's module-preload helper; THIRD-PARTY-NOTICES.md retains its MIT copyright and permission notice and is emitted into the production build alongside LICENSE and LICENSE-SCOPE.md. Development tools retain their own licence terms. No blanket first-party authorship claim is made.

## Soundtrack

Opus: 3,548,469 bytes; SHA-256 33A527904CFE23F497B38FAA912BC5C6DDFD36A686068895DA68B77C380C776C.

Audio-only MP3 fallback: 2,739,456 bytes; SHA-256 03168C4CD278417399A9048DA9C756E15F7E5D4C9D0AF5A2F0A2641C165EC5BA. The original MPEG frames were copied without re-encoding, excluding ID3 artwork and auxiliary metadata.

Master WAV: 33,926,694 bytes; SHA-256 137D2DF0ABD3C5ED079D0B1B80858D7F14C4D0AE1E9C4DC43A2F5BBC7AE13147. Preserved outside the distribution, not edited. The owner reports generation with Flow. Exact provider/model, generation date, applicable terms and permission for public music redistribution remain owner-supplied evidence to collect. Neither the code licence nor a matching hash proves music rights.

## Artwork and trademarks

ASSETS.md records the Kiro-derived mascot's traced reference. Kiro/AWS marks and reference art remain subject to their owners' rights. GPL code licensing and hackathon participation do not grant mascot or brand permission. Resolve permission or approve independently designed replacement art before public distribution. Code-defined artwork and the favicon have separate, currently reserved asset scope. No new art was generated or replaced. See REBRANDING-PLAN.md for the proposed lantern character and saved-data preservation plan. LABYRAZE and final character-name trademark availability are not cleared.

## Verification and evidence

Actual sequential gate results, durations, commands and exit codes are recorded in docs/verification/latest.json with sanitized transcripts. A RUNNING or FAIL record is not a successful release verification. Muse's earlier reported summary is retained separately in docs/verification/muse-reported.txt; it is not a raw independently captured final test transcript.

The historical balance baseline and all working .kiro files are protected by docs/protected-files.json. Gameplay defaults, AI, difficulties, skins, scores, localStorage keys and cheat sequences remain unchanged. One pre-existing Ghost Hunt rescue-after-expiry lifecycle defect was corrected to enforce the existing never-reimprison-rescued rule; before/after hashes and the reproducible failing case are recorded in docs/verification/core-correction.json. Other protected files remain unchanged. The shared compatibility check pins the five post-baseline defaults rather than rewriting historical measurements. It does not claim a new 500-seed measurement.

Raw local recovery and verification outputs remain ignored in .release-local. The public-source exporter redacts personal machine paths in a separate local candidate, including historical evidence, while preserving numerical measurements. The working .kiro tree remains byte-for-byte intact; its historical machine path is redacted only in the export.

## Remaining blockers

Public publication requires music and artwork permissions, Kiro-derived art clearance/replacement, provisional-name checks and confirmation of hackathon terms. Review current dependency advisories; a development-only dependency is not automatically safe. Browser automation checks actual decode/playback and loop behavior, but owner listening and supported-device checks are still needed for sound quality. See RELEASE-CHECKLIST.md. No publishing tool is invoked by release verification or export.

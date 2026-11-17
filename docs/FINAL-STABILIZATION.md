# LABYRAZE final stabilization ? private release preparation

Latest production build: http://localhost:4173/ (same existing preview origin; current index and script hashes verified). No publication, push, remote creation or visibility change occurred. Displayed KiroBit branding remains unchanged pending approved artwork and name clearance.

## Outcome

Final complete suite: 1,003 passed across 156 files; zero failed, pending or skipped. Required local gates all exited 0. Full sanitized JSON assertions and transcripts are in verification/. Earlier failed runs are retained in attempt-1, attempt-2 and attempt-3; iterations.json explains the corrections. The network dependency audit exited 1 because its advisory endpoint request failed: it remains UNVERIFIED, not a clean security result.

## Behavior and preservation

AI, difficulty presets, speed/tuning defaults, score/storage formats, skins, cheat keyboard sequences, rendering and animation durations remain unchanged. All working .kiro evidence and the historical baseline are byte-identical to recovery. The original WAV and downloaded MP3 retain their original SHA-256. One pre-existing Ghost Hunt lifecycle error was corrected: a newly rescued captive could leave a returning/inactive ally associated with the cage after hunt expiry. The read-only rescued flag is now reconciled before movement/refresh. No rescue flags or carried keys are written by Ghost Hunt. See verification/core-correction.json for before/after hashes and deterministic regressions. No 500-seed measurement was rerun or baseline rewritten.

## Audio

Preferred Opus remains 3,548,469 bytes. MP3 fallback is 2,739,456 bytes, made by copying MPEG frames unchanged and removing ID3 cover art and auxiliary metadata. Gapless technical headers were retained. Chrome decoded both to 8,215,552 samples, stereo, 48 kHz, 171.157333 seconds. Real buffer and stream playback, loop crossing, unsupported-Opus selection, Opus loading failure recovery, total loading failure and stream-timeout disconnection passed. Late playback completion is prevented from reviving an abandoned source; downloads are aborted on timeout. No WAV is present in public/ or dist/. The missing WAV URL returns the preview index HTML, not audio. Listening quality and other supported-device checks remain owner review.

## Performance

Final browser: frame-work p95 2.7 ms, rAF delta p95 18.1 ms, max eligible ticks 1, raw FIFO queue residence 4 ticks, 73 consumed inputs, no discarded/pending/overdue inputs, 11 held inputs, 4,032 ms intentional pauses, no page errors, high quality tier. The original four-tick result measured queue residence during deliberate holds. Budgets remain 16.7 ms work and one eligible tick; no speed or animation duration changed. The 18.1 ms scheduling statistic is reported separately and does not certify perfect display cadence. Simulation p95 0.797 ms (2 ms budget); generation p95 29.75 ms (50 ms budget). The unchanged, time-scaled balance smoke passed 190 units with two workers.

## Licensing, identity and Git

GPL-3.0-only applies to original software, with separate scope for artwork, music, third-party material and historical evidence. LICENSE, LICENSE-SCOPE.md and THIRD-PARTY-NOTICES.md ship with the build. Recorded music and Kiro-derived art are not automatically declared ours or GPL-covered. Public release is blocked pending asset permissions, exact Flow terms, provisional LABYRAZE/name clearance and hackathon-rule confirmation. The proposed original mascot is a six-sided copper lantern with a turquoise light core, short handle and asymmetric fins, fitting the current 18 x 24 canvas and animation/Workshop slots; no art was generated or replaced. See REBRANDING-PLAN.md.

Git initialized locally, but staging/committing was denied at .git/index.lock by managed filesystem permissions. No repeated Git write attempts or system changes were made. Recovery remains in .release-local/recovery. The sanitized source export is prepared separately by release:export; review it and choose the owner's commit identity before future GitHub publication.

## Recorded gates

| Gate | Exit | Seconds |
| --- | ---: | ---: |
| typescript | 0 | 8.2 |
| typescript-core | 0 | 1.5 |
| eslint | 0 | 7.2 |
| determinism | 0 | 0.6 |
| baseline | 0 | 1.7 |
| soundtrack | 0 | 0.6 |
| test-runner-guards | 0 | 3.4 |
| regressions | 0 | 28.3 |
| simulation-performance | 0 | 10.9 |
| production-build | 0 | 0.7 |
| browser-audio | 0 | 16.7 |
| browser-performance | 0 | 32.8 |
| balance-smoke | 0 | 19.8 |
| complete-suite | 0 | 679.4 |

Additional served-build check: exit 0. Dependency advisory request: exit 1, UNVERIFIED.

## Exact changed source and release files

- `src/audio/audioEngine.ts`
- `src/audio/audioPort.ts`
- `src/audio/soundtrack.ts`
- `src/core/ghostHunt.ts`
- `src/shell/input.ts`
- `src/shell/main.ts`
- `src/shell/perfHarness.ts`
- `tests/assets/soundtrack.test.ts`
- `tests/audio/codecFallback.test.ts`
- `tests/audio/mockAudio.ts`
- `tests/balance/consistency.test.ts`
- `tests/fixtures/soundtrack.json`
- `tests/ghostHunt/rescueState.test.ts`
- `tests/shell/input.test.ts`
- `tests/shell/perfHarness.test.ts`
- `tests/smoke/assets.test.ts`
- `tests/smoke/readme.test.ts`
- `tests/smoke/releaseAudit.test.ts`
- `tools/balance/cli.ts`
- `tools/balance/compatibility.ts`
- `tools/balance/pool.ts`
- `tools/balance/verifyBaseline.ts`
- `tools/checkSoundtrack.ts`
- `tools/exportRelease.mjs`
- `tools/perfBrowser.ts`
- `tools/registerTypeScript.mjs`
- `tools/runTests.mjs`
- `tools/typescriptLoader.mjs`
- `tools/verifyAudioBrowser.ts`
- `tools/verifyRelease.mjs`
- `tools/verifyTestRunner.mjs`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `public/audio/Pixel Pulse.mp3`
- `.gitignore`
- `ASSETS.md`
- `eslint.config.js`
- `LICENSE`
- `LICENSE-SCOPE.md`
- `package-lock.json`
- `package.json`
- `README.md`
- `REBRANDING-PLAN.md`
- `RELEASE-AUDIT.md`
- `RELEASE-CHECKLIST.md`
- `THIRD-PARTY-NOTICES.md`
- `vite.config.ts`
- `vitest.config.ts`

New evidence artifacts are under docs/verification; protected expected hashes are in docs/protected-files.json. The public-source export redacts machine paths in a copy, retaining original working evidence and numerical measurements.

## Sanitized source candidate

`.release-local/public-source-1794872234974` was verified with exit 0: 478 files, all 27 .kiro files, no personal machine-path remnants, no WAV files, unchanged historical baseline bytes and 95 matching export hashes. Machine paths were redacted in 26 copied text files. Working historical evidence remains intact. This is a local review candidate, not a published release or Git commit. See verification/source-export.json.

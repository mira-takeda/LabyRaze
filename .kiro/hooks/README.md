# Kiro hooks

Format: current native Kiro hook schema (https://kiro.dev/docs/hooks/). Each file is `.kiro/hooks/<id>.json`:
`{ "version": "v1", "hooks": [{ "name", "description", "trigger", "matcher", "action": { "type": "command", "command" }, "timeout" }] }`.
Triggers are PascalCase (`PostFileSave`, `PostFileCreate`, `PostFileDelete`). `matcher` is a regex tested against the file path.

Deviation note: the older `<name>.kiro.hook` shape (`when`/`then`, `fileEdited`, `askAgent`) is the pre-1.0 format and is not used. The task text (`trigger`/`matcher`/`action`, `*.json`) matches the current docs.

Commands are `npm.cmd run <script>`. Command actions run in the project root, and `npm.cmd` avoids the PowerShell block on `npm.ps1` on Windows. Matchers accept `/` and `\` separators.

| Hook | Trigger | Script |
|------|---------|--------|
| sim-tests-on-save | PostFileSave `src/core/**/*.ts` | test:sim |
| balance-smoke-on-save | `src/core/maze/**`, `src/core/config.ts` | balance:smoke |
| determinism-lint-on-save | `src/core/**/*.ts` | lint:determinism |
| audio-tests-on-save | `src/audio/**/*.ts` | test:audio |
| mechanics-tests-on-save | core `bombs`, `ghostHunt`, `score`, `maze/placement`, `maze/partition` | test:mechanics (runs tests/bombs, tests/ghostHunt incl. rescue-state preservation, tests/wisps) |
| balance-baseline-check-on-save | `tools/balance/**/*.ts` | balance:check |
| soundtrack-integrity-on-change | PostFileSave, PostFileCreate, PostFileDelete on `public/audio/**` (three hook entries in one file) | check:soundtrack (read-only) |
| build-check-on-save | `src/**/*.ts`, `tools/**/*.ts` | build |

Notes:
- sim-tests and determinism-lint both fire on `src/core` saves by design: one is a test run, the other a fast scan.
- Overlap with mechanics-tests, balance-smoke and build-check is intentional and scoped by matcher. Timeouts bound each run.
- No hook writes to `public/audio`. `check:soundtrack` only reads size and SHA-256, so `Pixel Pulse.wav` is never modified.

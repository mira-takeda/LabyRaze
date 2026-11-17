# Implementation Plan: KiroBit Halloween Maze

## Overview

This plan builds KiroBit in the order the requirements demand: scaffolding, steering files and hooks first (so they guide later execution), then the deterministic `core` Simulation with all mechanics (maze, doors, movement, powers, rescue, lives, Bombs, Ghost Hunt, Spirit Wisps, Hunter AI, progression) and its mandatory tests, then the Balance_Simulator with a measured baseline and evidence-based tuning, then the Phase 1 placeholder shell and the Phase 1 gate. Phase 2 adds sprites, lighting, particles, the user's Soundtrack with reactive audio, procedural sound effects, menus and high scores. The plan ends with a post-polish balance re-run, performance verification, an end-to-end simulation run, and the README.

Implementation language: TypeScript (Vite, Canvas 2D, Vitest, fast-check, Web Audio). All files stay inside the workspace (Requirements 1.5, 25.7).

## Execution Rules (apply to every task)

- Work autonomously: implement, run the task's `Verify:` command, diagnose any failure, fix the code, and rerun until it passes. Do not start the next task with a failing check (Requirements 25.6, 32.1).
- Ask the user only for genuine product decisions, meaning the Open Design Questions whose status is `needsDecision` (rows 1 to 7, 15, 16). Everything determinable by tests or simulation is decided by the agent (Requirement 32.2).
- Never access projects outside the workspace. Use no paid services, do not publish the project, and perform no destructive operations (no recursive deletes, no force pushes, no data removal) (Requirements 32.3, 32.4).
- NEVER modify, delete, move, rename, re-encode, or overwrite `public/audio/Pixel Pulse.wav`. Only read-only operations are allowed (size, SHA-256, header bytes, HTTP GET). No script may write to `public/audio` (Requirements 26.3, 32.5). Quote the path in PowerShell, because the file name contains a space.
- `src/core/**` must never import DOM, render, audio, input, or shell code and must never use wall-clock time, frame timing, or unseeded randomness (Requirements 2.2, 2.4, 2.6).
- Files shared by several tasks (`types.ts`, `events.ts`, `config.ts`, `sim.ts`, `rules.ts`, `renderer.ts`, `main.ts`): tasks in the same wave never edit the same file. If a task finds a missing field in a shared type, it makes a minimal additive edit and reruns `npx tsc --noEmit`.
- Test tasks without an asterisk are mandatory: do not skip them. Tasks with `*` are optional extras.
- NEVER let Ghost Hunt change `captives`, the Rescued_Captive count, or `carriedKeys`. Ghost Hunt is never a Rescue; allies never block the Cage entrance. The state slice `ghostHunt` has no access to those fields (Requirements 29.11, 29.12, 31.5).
- Phase 2 tasks (groups 24 to 34) start only after the Phase 1 gate (task 23) passes (Requirement 13.4). Groups 11 to 13 (Bombs, Ghost Hunt, Spirit Wisps) are headless Simulation rules without visuals or audio. They are built before the shell because the Simulation and its tests precede rendering and audio (Requirement 25.1, 13.5). Their visuals and sounds belong to Phase 2.
- Checkpoint tasks (3, 6, 21, 23, 35) are verification-only and are not graph nodes. Run the listed commands, fix failures autonomously, and ask the user only for `needsDecision` questions (Requirement 32.1, 32.2). Wave 26 starts only after task 23 has passed; every prerequisite of task 23 is in waves 0 to 25.
- A `Verify:` path names the test file(s) of the task itself or of earlier required tasks. If a required task's Verify path matches no existing file, or only a file of an optional (`*`) task, the task writes a minimal unit test at that path as part of its work. A Verify that matches zero test files is never accepted as a pass. A required task never depends on an optional task.
- Until `generateMaze` exists (task 5.7), tests use hand-built Mazes from `tests/helpers/fixtures.ts`. Tests that need generated Mazes live in waves 10 and later.
- Placeholder values from the requirements (5th percentile at least 1.3, median at most 3.0, 500 Mazes, 480 Ticks, 2.5 Cells, 3 Bombs, wisp density 0.5, Combo window 120 Ticks) are provisional. Tasks 19.1 to 19.7 replace them with measured values or confirm them with recorded evidence (Requirements 20.7, 29.16).

## Tasks

- [x] 1. Scaffolding and tooling
  - [x] 1.1 Scaffold the Vite + TypeScript project and npm scripts
    - Create `package.json` with pinned versions: Vite, TypeScript, Vitest, fast-check, ESLint, `typescript-eslint`, `@types/node`, `tsx`, `happy-dom` (no browser-automation package here; `puppeteer-core` is added only by task 32.2)
    - Define ALL npm scripts now: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `test` (all suites except `tests/perf`), `test:sim` (tests/core, maze, doors, hunter, powers, bombs, ghostHunt, wisps, rules, progression), `test:mechanics` (tests/bombs, ghostHunt, wisps), `test:audio` (tests/audio, tests/assets), `test:perf`, `test:e2e`, `lint`, `lint:determinism`, `check:soundtrack`, `balance:measure`, `balance:calibrate`, `balance:check`, `balance:smoke`, `balance:full`, `perf:browser` (`tsx tools/perfBrowser.ts`)
    - Create `index.html`, `tsconfig.json`, `src/core/tsconfig.json` (no `DOM` lib), `vitest.config.ts` (node default project, happy-dom for render and shell tests, a separate perf project, `passWithNoTests`), the folders from the design Module Layout, and `tests/smoke.test.ts`
    - Create stub entry files `tools/lintDeterminism.ts`, `tools/checkSoundtrack.ts`, `tools/balance/cli.ts`, `tools/perfBrowser.ts` that print "stub" and exit 0 (replaced by tasks 1.4, 1.5, 18.6, 32.2)
    - No script may write to `public/audio`
    - Verify: `npm install`, `npm run build`, `npm test`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 25.2, 25.7_

  - [x] 1.2 Configure Vite to serve `public/` and handle the space in `Pixel Pulse.wav`
    - Create `vite.config.ts`: `publicDir: 'public'`, `base: '/'`, `server.fs.strict: true` limited to the workspace, no plugin that transforms `.wav`
    - Add `tests/smoke/vite.test.ts` that starts a Vite server through the Vite API on a free port, sends `GET` and `HEAD` for `/audio/Pixel%20Pulse.wav`, and asserts HTTP 200 and the recorded byte length, then closes the server (read-only)
    - Verify: `npx vitest run tests/smoke/vite`, then `npm run build` and confirm `dist/audio/Pixel Pulse.wav` exists with the same size (the source file stays untouched)
    - _Requirements: 1.3, 26.1, 26.3, 32.5_

  - [x] 1.3 Configure ESLint determinism and layering rules
    - Create `eslint.config.js` with `no-restricted-globals` and `no-restricted-properties` for `Date`, `performance`, `Math.random`, `requestAnimationFrame`, `crypto.getRandomValues`, `setTimeout`, `setInterval` inside `src/core/**`
    - Add `no-restricted-imports` so `src/core/**` cannot import `render`, `audio`, `input`, or `shell`
    - Verify: `npm run lint` passes; the probe `echo "Math.random()" | npx eslint --stdin --stdin-filename src/core/probe.ts` fails (the probe is piped through stdin, so no temporary file is created in `src/core` and parallel tasks are not disturbed)
    - _Requirements: 2.2, 2.4, 2.6, 24.4_

  - [x] 1.4 Implement the determinism lint script
    - Replace the stub `tools/lintDeterminism.ts` (`npm run lint:determinism`): strip comments and string literals, scan `src/core/**/*.ts` for `Date.`, `performance.`, `Math.random`, `requestAnimationFrame`, `crypto.getRandomValues`, `setTimeout`, `setInterval`
    - Print `file:line` for each match; exit 1 on any match, exit 0 otherwise
    - Add `tests/smoke/lintDeterminism.test.ts` running the scanner on temporary fixture strings (clean, offending, comment-only)
    - Verify: `npx vitest run tests/smoke/lintDeterminism` and `npm run lint:determinism`
    - _Requirements: 2.4, 24.4, 24.5_

  - [x] 1.5 Implement read-only Soundtrack integrity tooling
    - Create `ASSETS.md` (initial version: Soundtrack row with the existing recorded size 33,926,694 bytes and the SHA-256 from design.md `137D2DF0ABD3C5ED079D0B1B80858D7F14C4D0AE1E9C4DC43A2F5BBC7AE13147`, sprites and sound-effect categories pending)
    - Replace the stub `tools/checkSoundtrack.ts` (`npm run check:soundtrack`): read-only size and SHA-256 with Node `fs` and `crypto`, compared with `tests/fixtures/soundtrack.json` and `ASSETS.md`; exit 1 with a clear message if the file is missing, changed, or deleted; never open the file for writing
    - Write `tests/fixtures/soundtrack.json` once from the recorded values (size, SHA-256, RIFF/WAVE header facts: PCM, 2 channels, 48,000 Hz, 16-bit); create `tests/assets/soundtrack.test.ts` asserting presence, size, checksum, header format facts, and agreement with `ASSETS.md`
    - If the computed values differ from the recorded ones, stop and report to the user. Do not change the file and do not silently overwrite the fixture
    - Verify: `npm run check:soundtrack` and `npx vitest run tests/assets`
    - _Requirements: 22.4, 26.3, 26.4, 32.5_

- [x] 2. Kiro steering files and hooks (early, so they guide later tasks)
  - [x] 2.1 Write the invariant steering files
    - Create in `.kiro/steering/` with `inclusion: always` front matter: `product.md` (Phase 1 and Phase 2 scope, Glossary incl. Bomb, Ghost_Hunt, Allied_Ghost, Spirit_Wisp, Combo), `architecture.md` (60 Hz Tick_Rate, PRNG only, no wall clock, layering, Ghost Hunt and rescue separation), `product-rules.md` (approved rules, win conditions, Bomb and Ghost Hunt rules, the Spirit_Wisp design decision and the pellet accounting rule that Wisps never count as Ordinary_Pellets), `technical-constraints.md` (stack, no network, workspace-only files, Windows paths with spaces, quoting and URL-encoding of `public/audio/Pixel Pulse.wav`, determinism lint scope, no destructive operations), `art-audio.md` (original assets only, no Pac-Man material, procedural SFX only, the Soundtrack is user-owned and must never be edited, re-encoded, moved, renamed, or deleted)
    - State explicitly in `architecture.md` and `product-rules.md`: Ghost Hunt never changes Captives, the Rescued_Captive count, or Carried_Keys and is never a Rescue; and in `art-audio.md` and `technical-constraints.md`: `public/audio/Pixel Pulse.wav` is never modified (read-only checks only)
    - Verify: each file exists and starts with valid front matter (checked by task 2.4)
    - _Requirements: 22.1, 22.2, 23.1, 23.2, 23.5, 23.6, 23.7, 23.8, 26.3, 32.3, 32.4, 32.5_

  - [x] 2.2 Write the remaining steering files
    - `testing.md` (`fileMatch` on `tests/**` and `tools/**`): Vitest and fast-check conventions, tag `Feature: kirobit-halloween-maze, Property N`, `numRuns`, measure / calibrate / check Balance_Baseline procedure, mandatory test categories of Requirements 17 to 20 and 31 (including the Ghost Hunt rescue-preservation property), and the rule that no test or script writes to `public/audio`
    - `performance.md` (`fileMatch` on `src/render/**`, `src/core/**`): Requirement 21 budgets, reference modest hardware (browser on a laptop-class CPU without a discrete GPU, exact target recorded here), explosion and ally effect budgets
    - `quality-standards.md` (`fileMatch` on `tests/**`, `tools/**`): definition of done (build, lint, determinism lint, tests green, no skipped mandatory test)
    - `visual-identity.md` (`fileMatch` on `src/render/**`, `public/**`): Kiro-style ghost, Squareman square silhouette, Captive and Ally palettes (pink `#ff6fb5`, teal `#3fd6c6`, orange `#ff9f43`), warm pellets versus cool wisps
    - `audio.md` (`fileMatch` on `src/audio/**`, `public/audio/**`): buffer-primary playback with stream fallback, bus layout, bitcrush and urgency limits, SFX list, volume persistence, never touch the Soundtrack file
    - `open-decisions.md` (`inclusion: manual`): status table of Open Design Questions 1 to 20 (needsDecision, tuning, resolved) with a section where tuned values and evidence are recorded
    - Verify: each file exists with valid front matter (checked by task 2.4)
    - _Requirements: 23.1, 23.3, 23.4, 23.7, 25.5_

  - [x] 2.3 Create the Kiro hook files
    - Create `.kiro/hooks/*.json` in the Kiro hook schema (`version`, `hooks[]` with `name`, `trigger`, `matcher`, `action`): `sim-tests-on-save` (`^src/core/.*\.ts$` runs `npm run test:sim`), `balance-smoke-on-save` (`^src/core/(maze/.*|config)\.ts$` runs `npm run balance:smoke`), `determinism-lint-on-save` (`^src/core/.*\.ts$` runs `npm run lint:determinism`), `audio-tests-on-save` (`^src/audio/.*\.ts$` runs `npm run test:audio`), `mechanics-tests-on-save` (matches `src/core/bombs.ts`, `ghostHunt.ts`, `score.ts`, `maze/placement.ts`, `maze/partition.ts`; runs `npm run test:mechanics`), `balance-baseline-check-on-save` (`^tools/balance/.*\.ts$` runs `npm run balance:check`), `soundtrack-integrity-on-change` (PostFileSave, PostFileCreate, PostFileDelete on `^public/audio/.*` runs `npm run check:soundtrack`, read-only), `build-check-on-save` (`^(src|tools)/.*\.ts$` runs `npm run build`)
    - Hook rules: no hook command writes to `public/audio` (the Soundtrack hook only runs the read-only `check:soundtrack`, so `Pixel Pulse.wav` is never modified); `mechanics-tests-on-save` runs `tests/ghostHunt`, which includes the property that Ghost Hunt never changes Captives, the rescued count, or Carried_Keys
    - Verify: `node -e` JSON parse of every file (full schema check in task 2.4)
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 26.4, 32.5_

  - [x] 2.4 Write smoke tests for steering and hook files
    - In `tests/smoke/kiro.test.ts` assert all 11 steering files exist with valid front matter and inclusion modes (`always`, `fileMatch` with `fileMatchPattern`, `manual`) and required keywords (`60`, `PRNG`, `Balance_Baseline`, `16.7`, `Pac-Man`, `Pixel Pulse.wav`, `never`)
    - Assert every hook file parses, has the required keys, uses an npm script that exists in `package.json`, and that no hook command or script writes to `public/audio`
    - Verify: `npx vitest run tests/smoke`
    - _Requirements: 23.1, 23.7, 24.1, 32.5_

- [ ] 3. Checkpoint - Scaffolding, steering and hooks in place
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 1 core foundations
  - [x] 4.1 Define core types and events
    - Create `src/core/types.ts`: `Dir`, `Cell`, `Input` (`pressed`, `bomb`, `continue`), `Character`, `GameState` (incl. `bombs`, `walls: WallLayer`, `derived`, `ghostHunt`, `comboCount`, `comboTicksLeft`), `Maze`, `DoorSpec`, `DoorState`, `ItemState` (collector masks, counters), `GhostHuntState`, `Ally`, tile codes (`Floor`, `Wall`, `WallHard`, `CageInterior`, `CageGate`, `Door`)
    - Create `src/core/events.ts`: the full `GameEvent` union from the design (incl. `BombCollected`, `BombActivated`, `BombDetonated`, `WallsDestroyed`, `GhostHuntStarted`, `GhostHuntEnded`, `WispCollected`, `ComboReset`, `LevelStarted`) and a freeze helper
    - `phase` union is `playing | levelEnd | gameOver` only (no victory phase)
    - Verify: `npx tsc --noEmit -p src/core`
    - _Requirements: 2.6, 7.8, 12.3, 28.14_

  - [x] 4.2 Implement the seeded PRNG
    - Create `src/core/prng.ts`: mulberry32, explicit `[value, nextState]` helpers, `deriveSeed(runSeed, levelNumber, stream, retryIndex)` for streams `maze`, `doors`, `hunter`, `repair`, `items` (Bomb, Ghost_Hunt and Spirit_Wisp placement)
    - Verify: `npx tsc --noEmit -p src/core` (behaviour covered by 4.7)
    - _Requirements: 2.2, 4.1_

  - [x] 4.3 Implement Game_Config and validation
    - Create `src/core/config.ts` with the full `GameConfig` (design Data Models: core, Bombs, Ghost Hunt, Spirit Wisps, audio, balance) and `DEFAULT_CONFIG`; `ConfigError`; `validateConfig` incl. `doorWarnTicks >= 30`, speed cap turnable at 60 Hz, `doorMinOpenRatio` in (0,1], odd maze size, `bombRadius` in (0, 6], `bombCapacity` 3, `wispDensity` in [0, 0.9], `comboCap >= 1`, `ghostHuntTicks >= 1`, `allyFactor > 0`, `soundtrackMaxRateShift <= 0.08`, `soundtrackDistortionMs` in 50..1000, non-empty `bombKey`
    - Mark provisional placeholders in code comments: `balanceBand` 1.3 / 3.0, `balanceFullSeeds` 500, `ghostHuntTicks` 480, `bombRadius` 2.5, `bombsPerLevel` 3, `wispDensity` 0.5 (replaced from evidence by tasks 19.2 to 19.6)
    - Verify: `npx tsc --noEmit -p src/core`
    - _Requirements: 4.7, 5.3, 5.9, 11.7, 12.6, 20.7, 26.12, 27.6, 28.6, 29.15, 30.2_

  - [x] 4.4 Implement the Open Design Questions registry
    - Create `src/core/openQuestions.ts`: entries 1 to 20 with `id`, `question`, `configKeys`, `defaultValue` (read from `DEFAULT_CONFIG`), `status`, `note`
    - Statuses: `needsDecision` for 1 to 7, 15, 16; `tuning` for 8, 9, 10, 12, 14, 17, 18, 19, 20; `resolved` for 11 and 13
    - Update the status table in `.kiro/steering/open-decisions.md` from the same data
    - Verify: `npx tsc --noEmit -p src/core` (the 20-entry, config-key and status assertions run in task 4.7, `tests/core/openQuestions`)
    - _Requirements: 11.7, 12.5, 20.7, 28.6, 29.15, 30.2_

  - [x] 4.5 Implement the grid module
    - Create `src/core/grid.ts`: cell indexing, 4-neighbour lookup in fixed order, wrap-pair resolution, passability helper taking a door mask and a wall tile array
    - Verify: `npx tsc --noEmit -p src/core`
    - _Requirements: 3.1, 3.7_

  - [x] 4.6 Create shared test helpers and arbitraries
    - Create `tests/helpers/arbitraries.ts` (`arbSeed`, `arbLevel`, `arbInputSeq`, `arbInput` with bomb about 3 percent, `arbConfig`, `arbBombScenario`, `arbGhostHuntScenario`, `arbComboSequence`, `arbEvent`, `arbAudioBlob`, `arbLoadOutcome`, `arbScoreList`, `arbStorageBlob`) and `tests/helpers/fixtures.ts` (hand-built small Maze and GameState builders). Because `generateMaze` does not exist yet, `arbBombScenario`, `arbGhostHuntScenario` and any arbitrary that needs a Maze use seeded fixture Mazes from `fixtures.ts`; task 5.7 switches them to `generateMaze`
    - Verify: `npx tsc --noEmit` including tests
    - _Requirements: 17.1, 19.12, 31.1_

  - [x] 4.7 Write unit tests for PRNG, config and the registry
    - Same seed gives the same sequence; streams differ (incl. `items`); default config validates; each invalid config reports a problem; registry statuses match the table (rows 14 to 20 included)
    - Verify: `npx vitest run tests/core/prng tests/core/config tests/core/openQuestions`
    - _Requirements: 2.2, 4.1, 11.7_

- [x] 5. Maze generation
  - [x] 5.1 Implement maze carving, cage, loops and wall hardness
    - Create `src/core/maze/carve.ts`: iterative randomized DFS on the odd lattice, central Cage block with one gate, loop pass (`loopCount`, `minLoopSpan`, `deadEndRemoval`)
    - Mark wall hardness flags: outer boundary, Cage perimeter and gate frame become `WallHard`; every other wall is a destructible `Wall`
    - Verify: `npx vitest run tests/maze/carve`
    - _Requirements: 4.2, 4.4, 4.6, 28.7_

  - [x] 5.2 Implement door placement
    - Create `src/core/maze/doorPlacement.ts`: Tarjan non-articulation candidates, spacing, exclusion near starts and Cage entrance, `doorCount`, single and pair closure acceptance, `openRatio` and period from the `doors` stream
    - Verify: `npx vitest run tests/maze/doorPlacement`
    - _Requirements: 4.2, 4.7, 5.6, 5.7, 5.9_

  - [x] 5.3 Implement start, key, power, speed, bomb and Ghost_Hunt placement
    - Create `src/core/maze/placement.ts`: starts in opposite quadrants, three Keys in distinct regions with distance bounds and `keyFairnessDelta`, Power_Pellets (default 4) and Speed_Pellets (default 3) with fairness deltas, Bombs (`bombsPerLevel`, `bombMinStartDist`, `bombFairnessDelta`, distinct thirds) and Ghost_Hunt items (`ghostHuntPerLevel`, `ghostHuntMinCageDist`, cycle Cells) from the `items` stream; all reachable, player-only flagged
    - Verify: `npx vitest run tests/maze/placement`
    - _Requirements: 4.2, 4.5, 7.1, 28.11, 29.17_

  - [x] 5.4 Implement the wisp and pellet partition
    - Create `src/core/maze/partition.ts`: blocks of side `itemBlock`, per-block `w_b = clamp(round(wispDensity * |R_b|), 1, |R_b| - 1)`, odd/even rule for single-Cell blocks, seeded shuffle from the `items` stream, path-coverage repair over key paths with `coverageWindow`, disjoint `wisps` and `ordinary` whose union is the eligible set
    - Verify: `npx vitest run tests/maze/partition`
    - _Requirements: 30.1, 30.10_

  - [x] 5.5 Implement maze validity checks
    - Create `src/core/maze/validate.ts`: checks 1 to 7b of the design (connectivity, mutual reachability, Cage central, dimensions and Door count, single and pair Door closure, item counts incl. Bombs and Ghost_Hunt, fairness deltas, disjointness and coverage, wall flags); each returns `{ ok, reason }`
    - Verify: `npx vitest run tests/maze/validate` (valid and deliberately broken mazes)
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 28.7, 28.10, 30.1_

  - [x] 5.6 Implement maze repair passes
    - Create `src/core/maze/repair.ts`: pass A connectivity, pass B door safety, pass C placement and coverage swaps, all from the `repair` stream, bounded by `maxRepairs`
    - Verify: `npx vitest run tests/maze/repair`
    - _Requirements: 4.8_

  - [x] 5.7 Wire `generateMaze` with regenerate and fallback
    - Create `src/core/maze/generate.ts`: carve, doors, placement, partition, wall flags, validate, repair, regenerate up to `maxAttempts`, deterministic fixed-template fallback; record `generation.attempts` and `repairs`; mix `retryIndex` into the seed; switch the Maze-based arbitraries in `tests/helpers/arbitraries.ts` from fixture Mazes to `generateMaze`
    - Verify: `npx vitest run tests/maze` and `npx tsc --noEmit`
    - _Requirements: 4.1, 4.3, 4.8_

  - [x] 5.8 Write property test for maze generation determinism
    - **Property 7: Maze generation is deterministic**
    - Verify: `npx vitest run tests/maze/determinism`
    - **Validates: Requirements 4.1, 4.3, 17.3**

  - [x] 5.9 Write property test for connectivity and reachability
    - **Property 8: Maze connectivity and reachability**
    - Verify: `npx vitest run tests/maze/reachability`
    - **Validates: Requirements 4.4, 4.5, 17.1, 17.2**

  - [x] 5.10 Write property test for maze structure and limits
    - **Property 9: Maze structure and limits**
    - Use `numRuns: 200` and `arbLevel` 1 to 200; include Bomb, Ghost_Hunt and wisp counts
    - Verify: `npx vitest run tests/maze/structure`
    - **Validates: Requirements 4.2, 4.6, 4.7, 12.4, 17.4**

  - [x] 5.11 Write property test for wisp and pellet coverage
    - **Property 43: Wisp and pellet coverage**
    - Check disjointness, block minimums over quadrants, and sliding windows along Player start, Keys, Cage entrance and Hunter start paths, for many Seeds; report min, 5th percentile and mean counts
    - Verify: `npx vitest run tests/wisps/coverage`
    - **Validates: Requirements 30.1, 30.10**

  - [x]* 5.12 Write unit and performance tests for regeneration and generation time
    - Forced validator failure triggers regeneration; forced exhaustion uses the valid fallback; 100 mazes generate within 50 ms at p95 (in `tests/perf`)
    - Verify: `npx vitest run tests/maze` and `npm run test:perf`
    - _Requirements: 4.8, 4.9_

- [ ] 6. Checkpoint - Maze generator complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Pathfinding and dynamic doors
  - [x] 7.1 Implement pathfinding and version-keyed distance fields
    - Create `src/core/pathfinding.ts`: BFS over open Doors, wrap pairs and the current wall layer; `DistanceField` cache keyed by `(doorMask, walls.version)`; multi-source BFS; fixed neighbour tie-break; `doorLookaheadTicks` foresight
    - Verify: `npx vitest run tests/core/pathfinding` (a changed `walls.version` never serves a stale field)
    - _Requirements: 5.8, 8.1, 8.7, 28.9_

  - [x] 7.2 Implement door schedule, warnings and occupancy gate
    - Create `src/core/doors.ts`: per-Door state machine from `period`, `phaseOffset`, `openRatio`; `warning` and `nextChangeIn`; warn window at least 30 Ticks; close postponed while a character is on or entering the Door Cell (Player and Hunter only, never allies); emits `DoorWarning` and `DoorChanged`
    - Verify: `npx vitest run tests/doors/schedule`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.9_

  - [x] 7.3 Implement the door reachability gate and connectivity tables
    - Extend `src/core/doors.ts`: per-`doorMask` connectivity table and time-to-restore table built by an exported `rebuildDerived(walls, doors)` (reused by Bombs); postpone a close when disconnection or confinement would exceed `maxDisconnectTicks`
    - Verify: `npx vitest run tests/doors/gate`
    - _Requirements: 5.6, 5.7, 5.8, 28.9_

  - [x] 7.4 Write property test for door schedule shape
    - **Property 10: Door schedule shape**
    - Include an example that every Door emits `DoorWarning` at least 30 Ticks before `DoorChanged`
    - Verify: `npx vitest run tests/doors/scheduleShape`
    - **Validates: Requirements 5.1, 5.3, 5.9, 18.5**

- [x] 8. Grid movement and buffered turns
  - [x] 8.1 Implement movement and buffered turns
    - Create `src/core/movement.ts`: fixed-point `CELL_UNITS = 1000` progress, boundary direction resolution (buffered, continue, hold), buffer replacement, mid-step reverse, hold at walls and closed Doors, wrap-pair placement
    - Verify: `npx vitest run tests/core/movement`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 8.2 Implement the pure interpolation function
    - Create `src/render/interp.ts`: `interpolate(character, alpha)` on the segment between current and next Cell, clamped to [0,1]
    - Verify: `npx tsc --noEmit`
    - _Requirements: 3.6_

  - [x]* 8.3 Write property test for interpolation
    - **Property 6: Interpolated position lies between Cells**
    - Verify: `npx vitest run tests/render/interp`
    - **Validates: Requirements 3.6**

  - [x]* 8.4 Write example test for wrap pairs
    - A hand-built Maze with a wrap pair places the character at the paired Cell
    - Verify: `npx vitest run tests/core/wrap`
    - _Requirements: 3.7_

- [x] 9. Powers, speed and cancellation
  - [x] 9.1 Implement power and speed rules
    - Create `src/core/powers.ts`: single `grantPower` writer that zeroes the other holder and signals `RoleReversed`; refresh; expiry events; speed grant, refresh, expiry; multiplier applied only to movement units; same-Tick double pickup tie-break by `tick % 2` with `PowerDenied`; no reference to allies
    - Verify: `npx vitest run tests/powers`
    - _Requirements: 9.2, 9.4, 9.5, 9.6, 9.9, 9.10, 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.2 Write property test and examples for power cancellation
    - **Property 17: Single power holder with cancellation**
    - Examples: a Squareman Power_Pellet cancels the Player Power_State on the same Tick; a Player Power_Pellet cancels the Squareman Power_State on the same Tick
    - Verify: `npx vitest run tests/powers/cancellation`
    - **Validates: Requirements 9.4, 9.5, 9.6, 19.5, 19.6, 31.7**

  - [x]* 9.3 Write property test for power timing and refresh
    - **Property 18: Power timing and refresh**
    - Verify: `npx vitest run tests/powers/timing`
    - **Validates: Requirements 9.2, 9.9, 9.10**

  - [x] 9.4 Write property test for the speed state
    - **Property 20: Speed state**
    - Verify: `npx vitest run tests/powers/speed`
    - **Validates: Requirements 10.1, 10.2, 10.4, 10.5, 10.7, 19.7**

- [x] 10. Pickups, keys, rescue, collisions, lives
  - [x] 10.1 Implement pickups, keys and rescue
    - Create `src/core/rules.ts` (part 1): item pickup with the single collector-mask check (Ordinary and Hunter-only, Keys, Bombs, Ghost_Hunt, Wisps Player-only, Power and Speed shared) with an extension point for the Bomb, Ghost_Hunt and Wisp handlers wired in task 16.3; Key pickup; Cage entrance Rescue (`min(carriedKeys, unreleased)`, monotone `captives`); `ordinaryRemaining` handling; Player-win outcome on the third release; rescue and pickup events. `rules.ts` must not import `ghostHunt.ts`
    - Verify: `npx vitest run tests/rules/rescue`
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 8.3, 8.4, 28.12, 29.2, 30.4_

  - [x] 10.2 Write property test for rescue accounting
    - **Property 16: Rescue accounting**
    - Examples for the one-key, two-key and three-key delivery strategies; level completes only after three releases
    - Verify: `npx vitest run tests/rules/rescueAccounting`
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 19.2, 19.3, 19.4**

  - [x] 10.3 Implement collisions, lives, respawn and dropped Keys
    - Extend `src/core/rules.ts` (part 2): same-Cell and swap collision, eat rules by power state, invulnerability, Player eaten (lives, respawn, Combo reset, drop carried Keys on nearest reachable Cells outside the Cage, Bomb_Inventory kept), Hunter eaten with respawn countdown and grace, game over at 0 lives, shared eaten handler with `by: 'player' | 'ally'`
    - Verify: `npx vitest run tests/rules/collisions`
    - _Requirements: 9.1, 9.3, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 29.7, 29.8_

  - [x] 10.4 Write property test for eating rules
    - **Property 19: Eating rules**
    - Verify: `npx vitest run tests/rules/eating`
    - **Validates: Requirements 9.1, 9.3, 11.8**

  - [x] 10.5 Write property test for eaten Player consequences
    - **Property 21: Eaten Player consequences**
    - Hand-built fixture Mazes (the generated-Maze variant runs in task 17.5); check Key conservation, distinct Cells, outside the Cage, Start_Cell respawn, exactly one life lost
    - Verify: `npx vitest run tests/rules/eatenPlayer`
    - **Validates: Requirements 11.2, 11.3, 11.4, 31.6**

- [x] 11. Bombs
  - [x] 11.1 Implement Bomb inventory and detonation
    - Create `src/core/bombs.ts` (part 1): guarded pickup (cap 3, Bomb stays on the Cell at 3), guarded consume, pure `detonate` with the integer squared-distance test on Cell centres from the exact mid-step Player position, only `Wall` tiles destroyed (never `WallHard`, `CageGate`, `CageInterior`, `Door`), copy-on-write `WallLayer` with `version + 1` only when `n > 0`, no effect on Squareman or pellets (`bombAffectsHunter` and `bombAffectsPellets` false)
    - Verify: `npx vitest run tests/bombs/detonate`
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.7, 28.8, 28.13_

  - [x] 11.2 Implement the derived-data refresh and Bomb events
    - Extend `src/core/bombs.ts` (part 2): when `n > 0` rebuild connectivity and time-to-restore tables with `rebuildDerived`, bump `walls.version`, clear the Hunter route and every ally route, emit `BombActivated`, `BombDetonated`, `WallsDestroyed` in the same Tick; an empty explosion consumes the Bomb and leaves caches unchanged
    - Verify: `npx vitest run tests/bombs/refresh`
    - _Requirements: 28.9, 28.10, 28.14_

  - [x] 11.3 Write property test for Bomb inventory accounting
    - **Property 30: Bomb inventory accounting**
    - Include the Space bomb key press mapping and a press at 0 Bombs changes nothing
    - Verify: `npx vitest run tests/bombs/inventory`
    - **Validates: Requirements 28.1, 28.2, 28.3, 28.4**

  - [x] 11.4 Write property test for the blast set
    - **Property 31: Blast destroys exactly the destructible walls in range**
    - Examples: blast passes through walls, mid-step centre, radius 2.5 on a single wall layer
    - Verify: `npx vitest run tests/bombs/blast`
    - **Validates: Requirements 28.3, 28.5, 28.6, 28.8, 31.3**

  - [x] 11.5 Write property test for indestructible tiles
    - **Property 32: Indestructible tiles are preserved**
    - Outer boundary, Cage perimeter, gate, interior, and Door Cells keep their tile code; Floor stays Floor
    - Verify: `npx vitest run tests/bombs/indestructible`
    - **Validates: Requirements 28.7, 28.10, 31.3**

- [x] 12. Ghost Hunt
  - [x] 12.1 Implement the Ghost Hunt state machine
    - Create `src/core/ghostHunt.ts` (part 1): `stepGhostHunt(gh, view, cfg)` with a `GhostHuntView` that has no `captives` or `carriedKeys`; start (`ticksLeft`, staggered `spawnIn`, all three allies from the Cage entrance), refresh, expiry to `returning`, `leaving` fade, level-end cleanup; no inventory; events `GhostHuntStarted` and `GhostHuntEnded`
    - Verify: `npx vitest run tests/ghostHunt/lifecycle`
    - _Requirements: 29.1, 29.3, 29.9, 29.10, 29.12, 29.14_

  - [x] 12.2 Implement ally AI, movement and catches
    - Extend `src/core/ghostHunt.ts` (part 2): ally speed (`allyFactor`), BFS pursuit over current Doors and walls with per-ally lead (`allyLeadTicks * i`), hold near the Squareman start when the Hunter is inactive, return to the Cage entrance, non-solid and non-colliding with the Player, catch detection (same Cell or swap with alive, non-grace Hunter) through the shared eaten handler; allies never touch power fields
    - Verify: `npx vitest run tests/ghostHunt/allyAI`
    - _Requirements: 29.4, 29.5, 29.6, 29.7, 29.8, 29.13_

  - [x] 12.3 Write property test that Ghost Hunt preserves rescue state
    - **Property 38: Ghost Hunt never changes Captives or Carried_Keys**
    - Start, refresh, expiry, level-end cleanup and ally movement leave `captives`, the rescued count and `carriedKeys` deeply equal
    - Verify: `npx vitest run tests/ghostHunt/rescueState`
    - **Validates: Requirements 29.11, 29.12, 31.5**

  - [x] 12.4 Write property test that allies respect the Maze
    - **Property 39: Allies respect the Maze and never harm the Player**
    - Verify: `npx vitest run tests/ghostHunt/respect`
    - **Validates: Requirements 29.4, 29.5, 29.8, 29.12**

- [x] 13. Spirit Wisps and scoring
  - [x] 13.1 Implement score weights, wisp scoring and Combo
    - Create `src/core/score.ts`: `scoreWeights` (ordinary, captive, hunterEaten, level), pure Combo transition (`comboCount`, `comboTicksLeft`, `wispPoints * comboCount`, `ComboReset`), per-Tick window decrement, Combo reset on Player eaten; Combo changes `score` only
    - Verify: `npx vitest run tests/wisps/combo`
    - _Requirements: 16.1, 30.2, 30.3, 30.6, 30.7, 30.8_

  - [x]* 13.2 Write unit tests for score weights
    - Each weight and a combined example
    - Verify: `npx vitest run tests/core/score`
    - _Requirements: 16.1_

  - [x]* 13.3 Write property test for Combo semantics
    - **Property 44: Combo semantics**
    - Verify: `npx vitest run tests/wisps/comboProperty`
    - **Validates: Requirements 30.2, 30.3, 30.6, 30.7, 30.8**

- [x] 14. Squareman hunter AI
  - [x] 14.1 Implement mode selection and COLLECT utility
    - Create `src/core/hunter.ts` (part 1): FLEE / CHASE / COLLECT selection with FLEE first (flee sources are the Player when it holds power plus every hunting ally), utility scoring over Ordinary, Power and Speed pellets only (never Keys, Bombs, Ghost_Hunt, Wisps), jitter from the `hunter` stream, commitment hysteresis, route cleared on `DoorChanged` and `WallsDestroyed`
    - Verify: `npx vitest run tests/hunter/collect`
    - _Requirements: 8.1, 8.2, 8.7, 8.8, 28.12, 29.2, 30.4_

  - [x] 14.2 Implement FLEE, CHASE and respawn behaviour
    - Extend `src/core/hunter.ts` (part 2): FLEE over multi-source distance (Player power and allies), exits and Door-risk scoring; CHASE toward the predicted Player Cell within `hunterChaseDistance` only while Squareman holds power and no ally hunts; respawn and grace handling
    - Verify: `npx vitest run tests/hunter`
    - _Requirements: 8.5, 8.6, 11.5, 29.6_

  - [x] 14.3 Write property test for hunter route validity
    - **Property 13: Hunter routes respect current Doors**
    - Include the first decision after a Door change and after an explosion
    - Verify: `npx vitest run tests/hunter/routes`
    - **Validates: Requirements 5.8, 8.1, 8.7**

  - [x]* 14.4 Write property test for flee and chase behaviour
    - **Property 14: Hunter flee and chase behavior**
    - Verify: `npx vitest run tests/hunter/fleeChase`
    - **Validates: Requirements 8.5, 8.6**

  - [x] 14.5 Write example tests for hunter reroute and pellet collection
    - Hunter recomputes its route after a Door state change; Hunter collects Ordinary_Pellets and ignores Bombs, Ghost_Hunt items and Wisps
    - Verify: `npx vitest run tests/hunter/examples`
    - _Requirements: 18.4, 19.1_

- [x] 15. Progression
  - [x] 15.1 Implement progression and endless levels
    - Create `src/core/progression.ts`: `levelSpeedFactor(n)` capped and shared by both characters, level seed with `retryIndex`, Player-win flow (next Maze, `levelWinScore`, extra life every 5 levels), Hunter-win and pellet-starved policy switches from config, game-over policy, no victory phase
    - Verify: `npx vitest run tests/progression`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 15.2 Write property test for level speed progression
    - **Property 22: Level speed progression**
    - Speed factor part here (shared, non-decreasing, increment per win, cap); the no-final-phase part is completed in task 17.16
    - Verify: `npx vitest run tests/progression/speed`
    - **Validates: Requirements 12.2, 12.6, 19.8**

- [x] 16. Simulation assembly
  - [x] 16.1 Implement `createRun` and level setup
    - Create `src/core/sim.ts` (part 1): validate config (throw `ConfigError`), derive seeds, generate Maze, build initial `GameState` (walls copy, derived tables, empty Ghost Hunt, Combo 1, Bombs 0), level transition helper
    - Verify: `npx vitest run tests/core/createRun`
    - _Requirements: 4.1, 11.1, 12.1_

  - [x] 16.2 Implement the core `step` function
    - Extend `src/core/sim.ts` (part 2): per-Tick order of the design for input buffering, Door update, Hunter decision, movement, base pickups, collisions, Rescue, timers, outcome (Rescue before the Squareman clear, `simultaneousWinTieRule` default `playerWins`), events; pure `{ state, events }`; `continue` input from `levelEnd`
    - Verify: `npx vitest run tests/core`
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 9.6, 12.7_

  - [x] 16.3 Integrate Bombs, Ghost Hunt and Wisps into `step`
    - Extend `src/core/sim.ts` (part 3): step 2 Bomb resolution on `input.bomb`; step 5 Ghost Hunt update after the Hunter decision and ally movement; step 7 pickups for Bombs, Ghost_Hunt and Wisps via the collector mask handlers; step 8 ally catches after the Player-vs-Hunter collision; step 10 Combo and ally timers; step 11 Ghost Hunt cleanup when the level ends
    - Verify: `npx vitest run tests/core tests/bombs tests/ghostHunt tests/wisps`
    - _Requirements: 28.3, 28.9, 29.1, 29.7, 29.9, 30.3, 30.5_

  - [x] 16.4 Add development invariant assertions
    - Create `src/core/invariants.ts` (`assertValidState`: single power holder, characters on passable Cells, Key conservation, Cage and Door tiles intact, items on passable Cells, tables equal fresh recomputation) and call it after each Tick in non-production builds, stripped in production
    - Verify: `npx vitest run tests/core/invariants` (assertions fire on a deliberately corrupted state)
    - _Requirements: 9.6, 11.4, 28.10_

  - [x] 16.5 Implement the HUD view-model
    - Create `src/core/hud.ts`: pure `buildHud(state, cfg)` returning lives, level, carried Keys, released Captives, remaining Ordinary_Pellets (never Wisps), power and speed seconds per character, Bomb_Inventory as `filled: boolean[3]`, Ghost_Hunt remaining seconds, Combo multiplier and window fraction
    - Verify: `npx vitest run tests/core/hud`
    - _Requirements: 7.7, 13.2, 13.3, 28.16_

  - [x]* 16.6 Write property test for HUD completeness
    - **Property 23: HUD view-model completeness**
    - Verify: `npx vitest run tests/core/hudProperty`
    - **Validates: Requirements 7.7, 13.2, 13.3**

- [x] 17. Mandatory integration and property tests (full `step`)
  - [x] 17.1 Write property test for simulation determinism
    - **Property 1: Simulation determinism**
    - Two runs with the same Seed and input sequence (incl. Bomb presses and Ghost Hunt) compare equal after every Tick
    - Verify: `npx vitest run tests/core/determinism`
    - **Validates: Requirements 2.2, 2.3, 8.8, 19.12**

  - [x] 17.2 Write property test for pellet accounting
    - **Property 15: Pellet accounting and Hunter win**
    - Verify: `npx vitest run tests/rules/pelletAccounting`
    - **Validates: Requirements 8.3, 8.4, 19.1**

  - [x] 17.3 Write property test that Wisps never change pellet accounting
    - **Property 42: Spirit_Wisps never change the Ordinary_Pellet accounting**
    - Verify: `npx vitest run tests/wisps/accounting`
    - **Validates: Requirements 30.1, 30.5, 30.8, 30.11**

  - [x] 17.4 Write property test and examples for the two victory conditions
    - **Property 50: Two competing victory conditions**
    - Examples: Squareman clears the last Ordinary_Pellet; the third Captive is released; both on the same Tick gives a Player win; Wisp pickups cannot satisfy or block either condition
    - Verify: `npx vitest run tests/rules/victory`
    - **Validates: Requirements 7.6, 8.4, 12.5, 31.10**

  - [x] 17.5 Write property test for the lives, respawn and dropped-Key lifecycle
    - **Property 49: Lives, respawn and dropped-Key lifecycle**
    - Examples: invulnerability window, Squareman respawn delay and grace, game over at 0 lives
    - Verify: `npx vitest run tests/rules/lives`
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 31.6**

  - [x] 17.6 Write property test for Doors never trapping a character
    - **Property 11: Doors never trap a character**
    - Example: a character on the Door Cell at the closing Tick delays the close
    - Verify: `npx vitest run tests/doors/occupancy`
    - **Validates: Requirements 5.5, 18.3**

  - [x] 17.7 Write property test for door reachability and confinement
    - **Property 12: Door reachability and confinement bounds**
    - `numRuns: 200` over a long horizon
    - Verify: `npx vitest run tests/doors/reachability`
    - **Validates: Requirements 5.6, 5.7, 18.1, 18.2**

  - [x] 17.8 Write door examples through `step`
    - Squareman recomputes its route on the Tick after a Door change; every Door emits a warning before its state change
    - Verify: `npx vitest run tests/doors/stepExamples`
    - _Requirements: 5.8, 18.4, 18.5_

  - [x] 17.9 Write property test for connectivity after explosions
    - **Property 33: Destruction only improves connectivity and Door safety**
    - Verify: `npx vitest run tests/bombs/connectivity`
    - **Validates: Requirements 28.9, 28.10, 5.6, 5.7, 31.1, 31.2**

  - [x] 17.10 Write property test for state validity after explosions
    - **Property 34: State is valid after every explosion**
    - Verify: `npx vitest run tests/bombs/validity`
    - **Validates: Requirements 28.9, 28.10, 31.1**

  - [x] 17.11 Write property test for pathfinding refresh after explosions
    - **Property 35: Pathfinding refreshes in the same Tick as the explosion**
    - Example: Squareman takes the new shortcut on the Tick after the blast
    - Verify: `npx vitest run tests/bombs/pathRefresh`
    - **Validates: Requirements 28.9, 31.4**

  - [x] 17.12 Write property test that Squareman cannot collect player-only items
    - **Property 36: Player-only items are never collected by Squareman**
    - Verify: `npx vitest run tests/bombs/playerOnly`
    - **Validates: Requirements 28.11, 28.12, 28.13, 29.2, 29.17, 30.4**

  - [x] 17.13 Write property test for Ghost Hunt activation and power neutrality
    - **Property 37: Ghost Hunt activation, refresh and power neutrality**
    - Examples: activation on the same Tick, no inventory, refresh restarts duration, all three allies spawn
    - Verify: `npx vitest run tests/ghostHunt/activation`
    - **Validates: Requirements 29.1, 29.3, 29.13, 29.14**

  - [x] 17.14 Write property test that Ghost Hunt ends cleanly
    - **Property 40: Ghost Hunt ends cleanly**
    - Rescued allies absent and still rescued, imprisoned allies back in the Cage and still captive, level end empties the state
    - Verify: `npx vitest run tests/ghostHunt/ending`
    - **Validates: Requirements 29.9, 29.10, 29.11, 31.5**

  - [x] 17.15 Write property test for fleeing and ally catches
    - **Property 41: Squareman flees allies and ally catches follow the eaten rule**
    - Verify: `npx vitest run tests/ghostHunt/catches`
    - **Validates: Requirements 29.6, 29.7, 29.8**

  - [x] 17.16 Write endless progression integration tests
    - After a large number of consecutive Player wins no final or victory phase exists, speed never exceeds the cap, Maze size and Door count do not grow, a Hunter win applies the configured consequence; completes **Property 22**
    - Verify: `npx vitest run tests/progression/endless`
    - **Validates: Requirements 12.1, 12.3, 12.5, 19.9, 31.8**

  - [x]* 17.17 Write property test for movement on passable Cells
    - **Property 4: Movement stays on passable Cells**
    - Verify: `npx vitest run tests/core/movementProperty`
    - **Validates: Requirements 3.1, 3.5, 10.6**

  - [x] 17.18 Write property test for buffered turns
    - **Property 5: Buffered turn semantics**
    - Verify: `npx vitest run tests/core/bufferedTurns`
    - **Validates: Requirements 3.2, 3.3, 3.4, 19.10**

  - [x] 17.19 Write same-Tick power cancellation tests through `step`
    - Squareman and Player collect Power_Pellets on the same Tick (tie-break and `PowerDenied`); Ghost Hunt active does not change either `power` field
    - Verify: `npx vitest run tests/powers/stepCancellation`
    - _Requirements: 9.4, 9.5, 9.6, 19.5, 29.13, 31.7_

- [ ] 18. Balance tooling (`tools/balance/`)
  - [x] 18.1 Implement automated Player policies
    - Create `tools/balance/policies.ts`: `oneKey`, `twoKey`, `threeKey`, `bombAggressive` (detonate when saving at least `bombMinSaving` Cells, detour below `bombMaxDetour`), `bombNone`, `ghostHuntOpportunistic` (detour below `ghostHuntMaxDetour`), `ghostHuntNone`, `wispSweep`; BFS over current Doors and wall layer, fixed tie-break, replan on `DoorChanged` and `WallsDestroyed`
    - Verify: `npx vitest run tests/balance/policies`
    - _Requirements: 20.4, 20.5_

  - [x] 18.2 Implement balance statistics
    - Create `tools/balance/stats.ts`: integer-based percentile with linear interpolation, ratio summary (mean, median, p5, p95, min, max, count), band and tolerance check that returns the offending statistic and the worst Seed
    - Verify: `npx tsc --noEmit`
    - _Requirements: 20.3, 20.9_

  - [x] 18.3 Implement the simulator `measure` mode
    - Create `tools/balance/simulator.ts` (part 1): decoupled race (hunter-only `pelletClearTicks`, player-only `rescueTicks` per policy) and contested race (win rates, lives lost, Ghost Hunt catches per pickup, Bomb usage, wisp effect, generation attempts); levels 1, 5, 10, 20, 40; feature toggles Bombs, Ghost_Hunt and Wisps on/off; runs the real `createRun` and `step`; no band is enforced in `measure`
    - Verify: `npx vitest run tests/balance/measure`
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 18.4 Implement the simulator `calibrate` and `check` modes
    - Extend `tools/balance/simulator.ts` (part 2): `calibrate` sweeps for `ghostHuntTicks` (240 to 900 step 60), `bombRadius` (1.5 to 3.5 step 0.5), `bombsPerLevel` (1 to 4) with `bombFairnessDelta` (0 to 5), `wispDensity` (0.2 to 0.7) using `calibrationSeeds` and the selection rules of the design; `check` enforces committed bands with `relTol`, prints the offending statistic, observed and expected values, policy, level and worst Seed, exit code 1 on failure; `check` never rewrites the baseline
    - Verify: `npx vitest run tests/balance/calibrate tests/balance/check`
    - _Requirements: 20.6, 20.7, 20.8, 20.9, 29.16_

  - [x] 18.5 Implement `worker_threads` execution
    - Create `tools/balance/worker.ts` and `tools/balance/pool.ts` (new files; `simulator.ts` is not edited here): canonical sorted `(level, seed, policy, featureSet)` units split into contiguous chunks, default `min(cpuCount - 1, 8)` workers, results merged in canonical order, no timestamps in output, budget check by the parent only
    - Verify: `npx vitest run tests/balance/worker`
    - _Requirements: 20.1, 20.11, 20.12_

  - [ ] 18.6 Implement the balance CLI and baseline I/O
    - Replace the stub `tools/balance/cli.ts`: commands `measure`, `calibrate`, `check`, `smoke` (40 Mazes from `smokeBaseSeed`, levels 1 and 10, 30 s budget with a self-test that scales Seeds down on slow machines, reports it), `full`; `--n`, `--base-seed`, JSON and table output; baseline read/write (`tools/balance/baseline.json`) with `seedSetHash`, `configHash`, `gitDescribe`, tool version; only `measure` rewrites the baseline; non-zero exit on failure or budget exceeded
    - Verify: `npm run balance:smoke -- --n 4` and `npx vitest run tests/balance/cli`
    - _Requirements: 20.6, 20.8, 20.9, 20.12, 24.3_

  - [x] 18.7 Write policy tests
    - Each policy completes a Rescue on sample Mazes; `bombNone` never picks up a Bomb; `ghostHuntNone` ignores Ghost_Hunt items
    - Verify: `npx vitest run tests/balance/policyBehaviour`
    - _Requirements: 20.4, 20.5_

  - [x] 18.8 Write property test for balance statistics
    - **Property 29: Balance statistics consistency**
    - `measure` never fails on a band; `check` reports offending statistic and worst Seed
    - Verify: `npx vitest run tests/balance/stats`
    - **Validates: Requirements 20.3, 20.6, 20.8, 20.9**

  - [x] 18.9 Write property test for balance determinism
    - **Property 28: Balance simulator determinism**
    - Same Seed set, policies and toggles give identical output for 1 and N workers (metadata excluded)
    - Verify: `npx vitest run tests/balance/determinism`
    - **Validates: Requirements 20.1, 20.11, 31.11**

- [ ] 19. Baseline measurement and evidence-based tuning
  - [ ] 19.1 MEASURE: produce and commit `baseline.json`
    - Run `npm run balance:measure` with the provisional `balanceFullSeeds` (500 Mazes), levels 1, 5, 10, 20, 40, all policies and feature toggles; write `tools/balance/baseline.json` (ratio mean, median, p5, p95 per policy and level, win rates, lives lost, Bomb, Ghost Hunt, wisp and generation metrics); apply no band
    - Record in `.kiro/steering/open-decisions.md` that the 1.3 / 3.0 / 500 values were provisional and that this measurement exists
    - Verify: `npm run balance:measure` completes within `balanceFullBudgetMs`, the file validates against the baseline schema, and a second run produces identical output
    - _Requirements: 20.1, 20.3, 20.5, 20.6, 20.7_

  - [ ] 19.2 Choose `ghostHuntTicks` by simulation
    - Run `npm run balance:calibrate -- ghostHunt`: sweep 240 to 900 Ticks in steps of 60 (12 values) with the `ghostHuntOpportunistic` policy in the contested race over `calibrationSeeds`; record per value mean and p95 catches per pickup, fraction with zero catches, pellet-clear delta, rescue-time delta, Squareman win rate
    - Selection rule: the smallest duration with mean catches per pickup at least 0.5, p95 catches at most 3, and Squareman win rate not below `hunterWinRateFloor` (0.15); if none qualifies, widen the sweep and report why
    - Write the sweep table and justification (satisfied constraints and runner-up) to `baseline.json` `ghostHunt.chosen`; set `ghostHuntTicks` in `src/core/config.ts`; update `open-decisions.md` and keep the status `tuning` in `openQuestions.ts`
    - Verify: `npx vitest run tests/balance/ghostHuntChoice` and `npm run balance:smoke`
    - _Requirements: 29.15, 29.16, 20.5_

  - [ ] 19.3 Choose `bombRadius` from evidence
    - Run `npm run balance:calibrate -- bombRadius`: sweep 1.5 to 3.5 in steps of 0.5 with `bombAggressive` and `bombNone`; rule: mean walls destroyed per Bomb at most `bombMaxWalls` (10) and median-ratio shift at most `bombRatioShift` (0.15), preferring the radius that opens one wall layer
    - Set `bombRadius` in `config.ts`, record the sweep in `baseline.json` `bombs`, and note the evidence in `open-decisions.md`
    - Verify: `npx vitest run tests/balance/bombChoice` and `npm run balance:smoke`
    - _Requirements: 28.6, 20.5_

  - [ ] 19.4 Choose `bombsPerLevel` and `bombFairnessDelta` from evidence
    - Run `npm run balance:calibrate -- bombs`: sweep 1 to 4 Bombs and delta 0 to 5; rule: `bombAggressive` Player win rate stays at most `playerWinRateCeiling` (0.9) and does not drop below `bombNone` by more than the margin
    - Set both in `config.ts`; record in `baseline.json` and `open-decisions.md`
    - Verify: `npx vitest run tests/balance/bombChoice` and `npm run balance:smoke`
    - _Requirements: 28.11, 20.5_

  - [ ] 19.5 Choose `wispDensity` from evidence
    - Run `npm run balance:calibrate -- wisps`: sweep 0.2 to 0.7; rule: Squareman `pelletClearTicks` median stays above the Player `threeKey` median `rescueTicks` by the band margin and block coverage minimums hold for at least 99.9 percent of Seeds
    - Also measure Combo statistics under `wispSweep` (median and p95 Combo reached, share of Wisp points in the score) for `comboWindowTicks` 60 to 180 step 30; keep the provisional `comboWindowTicks = 120`, `wispPoints = 20`, `comboCap = 5` unless the evidence shows the cap is never reached or always reached, and record the decision either way
    - Set `wispDensity` (and any changed Combo value) in `config.ts`; record in `baseline.json` `wisps` and `open-decisions.md`
    - Verify: `npx vitest run tests/maze/partition tests/wisps/coverage` and `npm run balance:smoke`
    - _Requirements: 30.2, 30.10, 20.5_

  - [ ] 19.6 Set Balance_Bands and seed counts from evidence
    - Re-run `npm run balance:measure` with the tuned config; derive `p5Min = floor(baseline_p5 * (1 - bandMargin))` and `medianMax = ceil(baseline_median * (1 + bandMargin))` (`bandMargin` 0.1); set `balanceBand`, `balanceRelTol`, and `balanceFullSeeds` from the evidence in `config.ts`; write bands to `baseline.json`; replace the 1.3 / 3.0 / 500 placeholders
    - Update `open-decisions.md` and the `tuning` notes in `openQuestions.ts`
    - Verify: `npm run balance:check` passes and `npm run balance:smoke` passes
    - _Requirements: 20.6, 20.7, 20.8_

  - [ ] 19.7 Add the analytic balance pre-filter
    - Extend `src/core/maze/validate.ts` with check 8: cheap analytic race-ratio bound with `prefilterBand` taken from the baseline p5 and p95 widened by a factor
    - Re-run `npm run balance:measure` if generation output changed, then confirm the check
    - Verify: `npx vitest run tests/maze/validate`, `npm run balance:check`, `npm run balance:smoke`
    - _Requirements: 4.8, 20.7_

  - [ ] 19.8 Write the balance smoke integration test
    - Run the simulator on a smaller fixed Seed set and assert the result lies within the committed Balance_Baseline bands; a deliberately shifted statistic fails with the offending statistic and worst Seed
    - Verify: `npx vitest run tests/balance/smoke`
    - _Requirements: 20.8, 20.9, 20.10, 31.11_

  - [ ] 19.9 Write the baseline consistency test
    - Assert that `baseline.json` contains the Ghost Hunt sweep and chosen value, `config.ghostHuntTicks`, `bombRadius`, `bombsPerLevel`, `wispDensity` and `balanceBand` equal the baseline's chosen values, no placeholder value remains unrecorded, and `open-decisions.md` mentions each tuned value
    - Verify: `npx vitest run tests/balance/consistency`
    - _Requirements: 20.6, 20.7, 29.16_

- [ ] 20. Core performance check
  - [x] 20.1 Write the Tick performance test
    - In `tests/perf/tick.perf.test.ts` measure `step` over at least 10,000 Ticks including scripted Bomb detonations and Ghost Hunt events and assert p95 at most 2 ms; expose through `npm run test:perf`
    - Verify: `npm run test:perf`
    - _Requirements: 21.3, 21.7_

- [ ] 21. Checkpoint - Core, balance baseline and performance
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Phase 1 shell with placeholder graphics
  - [x] 22.1 Implement placeholder drawing
    - Create `src/render/placeholders.ts`: flat shapes behind a `drawCharacter/drawItem` interface for the Player ghost, Captives, square Squareman, pellets (warm), Wisps (cool orbs), Keys, Bombs, Ghost_Hunt item, allied ghosts as simple coloured shapes, Cage, Doors with open/closed colours
    - Verify: `npx vitest run tests/render/placeholders` using a recording mock 2D context
    - _Requirements: 5.4, 6.5, 13.1, 29.18, 30.9_

  - [x] 22.2 Implement the static maze layer
    - Create `src/render/staticLayer.ts`: offscreen walls and floor rendered once per level, `patch(cells)` that redraws destroyed Cells and their 8 neighbours from `walls.tiles`
    - Verify: `npx vitest run tests/render/staticLayer`
    - _Requirements: 21.4, 28.15_

  - [x] 22.3 Implement keyboard input capture
    - Create `src/shell/input.ts`: arrow/WASD mapping, ordered press queue drained once per Tick, `bomb` input for Space (one Tick per press), `continue` input for level end
    - Verify: `npx vitest run tests/shell/input`
    - _Requirements: 21.2, 28.3_

  - [x] 22.4 Implement the accumulator frame loop and event bus
    - Create `src/shell/loop.ts`: accumulator with clamped frame delta, fixed 60 Hz stepping, alpha for the Renderer, synchronous `EventBus` publication after each Tick batch
    - Verify: `npx vitest run tests/shell/loop`
    - _Requirements: 2.5, 21.2_

  - [x] 22.5 Implement frame composition in the Renderer
    - Create `src/render/renderer.ts`: layers (static, items, doors with warning pulse, characters via `interpolate`, allied ghosts, HUD from `buildHud`); Squareman always a square; Power blink and invulnerability blink with distinct periods; HUD with Lives, Level, Keys, Captives, pellets, three Bomb slots, Ghost_Hunt timer, Combo, remaining Power and Speed seconds; call `staticLayer.patch` on `WallsDestroyed`
    - Verify: `npx vitest run tests/render/renderer`
    - _Requirements: 3.6, 5.3, 5.4, 7.7, 9.7, 10.3, 13.2, 13.3, 28.15, 28.16_

  - [x] 22.6 Implement minimal screens
    - Create `src/shell/screens.ts`: level outcome screen (outcome and Level_Number), game over screen, continue handling
    - Verify: `npx vitest run tests/shell/screens`
    - _Requirements: 11.6, 12.7_

  - [x] 22.7 Wire the bootstrap and play loop
    - Create `src/shell/main.ts` and finish `index.html`: canvas (plain text error page if no 2D context), create run with a Run Seed, connect input, loop, Simulation, Renderer, screens
    - Verify: `npm run build` and `npx vitest run tests/shell`
    - _Requirements: 1.3, 13.1, 13.2_

  - [x] 22.8 Add the browser performance and latency harness
    - Create `src/shell/perfHarness.ts` and the `?perf=1` hook in `main.ts`: scripted bot for 30 seconds, `requestAnimationFrame` delta Frame_Time p95, input latency to next Tick consumption, pass/fail against the Requirement 21 budgets, result exposed as `window.__kirobitPerf`
    - Verify: `npm run build` and `npx vitest run tests/shell/perfHarness` (fake clock)
    - _Requirements: 21.1, 21.2, 21.8_

  - [x]* 22.9 Write property test for the accumulator
    - **Property 2: Accumulator tick count**
    - Verify: `npx vitest run tests/shell/accumulator`
    - **Validates: Requirements 2.5**

  - [x] 22.10 Write property test that the Renderer never mutates the Simulation
    - **Property 3: Views never mutate the Simulation** (Renderer handler part; Particle_System and Audio_Engine parts are completed in task 30.2)
    - Verify: `npx vitest run tests/render/readonly`
    - **Validates: Requirements 2.6, 2.7, 19.11**

  - [ ]* 22.11 Write renderer and input unit tests
    - Drawing-command assertions for Squareman square silhouette, Door state colours, HUD fields incl. Bomb slots; Space produces one `bomb` Tick per press; input buffering order
    - Verify: `npx vitest run tests/render tests/shell`
    - _Requirements: 5.4, 6.5, 13.2, 28.16_

- [ ] 23. Checkpoint - Phase 1 gate
  - Run `npm test`, `npm run test:sim`, `npm run test:mechanics`, `npm run test:perf`, `npm run lint`, `npm run lint:determinism`, `npm run balance:smoke`, and `npm run build`. All must pass before any Phase 2 task starts (Requirement 13.4).
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 24. Phase 2 pixel-art sprites
  - [ ] 24.1 Create original ghost, Captive and allied sprites
    - Create `src/render/sprites/ghost.ts`: palette-indexed pixel art for the rounded white Kiro-style ghost with two oval black eyes, animation frames, three distinct Captive palettes and the three allied palettes (pink `#ff6fb5`, teal `#3fd6c6`, orange `#ff9f43`) sharing silhouette and animation
    - Verify: `npx vitest run tests/render/sprites/ghost`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 22.1, 22.2, 29.18_

  - [ ] 24.2 Create original Squareman sprites
    - Create `src/render/sprites/squareman.ts`: yellow square frames for every animation and state (normal, power, speed, respawn, fleeing) keeping a square silhouette
    - Verify: `npx vitest run tests/render/sprites/squareman`
    - _Requirements: 6.5, 6.6, 22.1_

  - [ ] 24.3 Create tiles, decoration and door sprites
    - Create `src/render/sprites/world.ts`: wall and `WallHard` tiles with autotile edges, floor tiles, Halloween decoration, Cage, Door open/closed/warning frames, destroyed-wall rubble
    - Verify: `npx tsc --noEmit` and `npx vitest run tests/render/sprites/world`
    - _Requirements: 14.1, 14.3, 22.1, 22.2, 28.15_

  - [ ] 24.4 Create item sprites
    - Create `src/render/sprites/items.ts`: warm amber Ordinary_Pellet squares, cool cyan and violet glowing Spirit_Wisp orbs with bob frames, Power_Pellet, Speed_Pellet, Key, Bomb, Ghost_Hunt item
    - Verify: `npx vitest run tests/render/sprites/items`
    - _Requirements: 14.1, 22.1, 28.15, 29.19, 30.9_

  - [ ] 24.5 Implement the sprite atlas cache
    - Create `src/render/spriteCache.ts`: rasterize palette arrays once into an atlas, tinted and flipped variants, smoothing disabled, integer pixel coordinates
    - Verify: `npx vitest run tests/render/spriteCache`
    - _Requirements: 14.1, 21.4_

  - [ ] 24.6 Swap the Renderer to sprites
    - Update the adapter in `src/render/placeholders.ts` and `src/render/renderer.ts` to draw from the atlas and render Halloween decoration into the static layer; `staticLayer.patch` uses sprite tiles
    - Verify: `npx vitest run tests/render` and `npm run build`
    - _Requirements: 14.1, 6.5, 30.9_

  - [ ]* 24.7 Write sprite originality and silhouette tests
    - Squareman frames are square in every state; Captive and allied colours pairwise distinct and different from the Player; Wisp hue differs from pellet hue; sprite data is code-defined with no image file imports
    - Verify: `npx vitest run tests/render/sprites`
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 29.18, 30.9_

- [ ] 25. Lighting, doors, effects and explosions
  - [ ] 25.1 Implement lighting and glow
    - Create `src/render/lighting.ts`: pre-rendered radial gradients, half-resolution additive glow composited with `lighter`, bounded light count, short-lived explosion light, small lights for Wisps and allies, skipped at the low tier
    - Verify: `npx vitest run tests/render/lighting`
    - _Requirements: 14.2, 28.15_

  - [ ] 25.2 Implement the door animation layer
    - Create `src/render/doorsLayer.ts`: glow colour and animation distinguishing open from closed, warning pulse over at least 30 Ticks, transition animation on `DoorChanged`
    - Verify: `npx vitest run tests/render/doorsLayer`
    - _Requirements: 5.3, 5.4, 14.3_

  - [ ] 25.3 Implement power, speed and role-reversal visual effects
    - Create `src/render/effects.ts`: power blink for the full Power_Duration, role-reversal flash, invulnerability blink distinct from power blink, speed animation frame selection and trail emission requests
    - Verify: `npx vitest run tests/render/effects`
    - _Requirements: 9.7, 9.8, 10.3, 11.8_

  - [ ] 25.4 Implement allied ghost rendering
    - Create `src/render/allies.ts`: allied palettes, trailing afterimage, `leaving` fade from `leaveIn / allyLeaveTicks`, animation, derived Cage presentation (Captive drawn in the Cage when `!captives[i] && mode === 'inactive'`)
    - Verify: `npx vitest run tests/render/allies`
    - _Requirements: 29.9, 29.10, 29.18, 29.19_

  - [ ] 25.5 Implement the pixel explosion and screen shake
    - Create `src/render/explosion.ts`: pixel flash and shockwave ring from `BombDetonated` (render-side timers only, no Simulation PRNG), debris requests, at most 3 concurrent flashes, decaying screen shake that `screenShake` in config and the low tier disable
    - Verify: `npx vitest run tests/render/explosion`
    - _Requirements: 28.14, 28.15_

  - [ ] 25.6 Wire lighting, doors, effects, allies and explosions into the Renderer
    - Update `src/render/renderer.ts` to compose lighting, door layer, character effects, allies, explosion layer, particle pass and the polished HUD (task 28.5)
    - Verify: `npx vitest run tests/render` and `npm run build`
    - _Requirements: 9.7, 10.3, 14.2, 14.3, 28.15, 29.19_

- [ ] 26. Particles
  - [ ] 26.1 Implement the particle pool and emitters
    - Create `src/render/particles.ts`: struct-of-arrays pool sized by `particleCap`, free-slot reuse, drop on full, separate non-simulation PRNG, emitters for pellet bursts, pixel explosions when a character is eaten, speed trails, Key effects, rescue effects, role reversal, Wisp sparkles (4 per pickup), Bomb debris (`explosionParticleMax`), ally trails (`allyTrailMax`)
    - Verify: `npx vitest run tests/render/particles`
    - _Requirements: 10.3, 14.4, 14.6, 21.5, 28.15, 29.19, 30.3_

  - [ ] 26.2 Bind Simulation events to emitters
    - Create `src/render/particleBindings.ts` subscribing to the event bus (read-only) and mapping events to emitters; scale density by quality tier
    - Verify: `npx vitest run tests/render/particleBindings`
    - _Requirements: 2.7, 7.8, 14.4, 28.14, 29.19_

  - [ ]* 26.3 Write property test for particle pool bounds
    - **Property 24: Particle pool bounds**
    - Verify: `npx vitest run tests/render/particlePool`
    - **Validates: Requirements 14.6, 21.5**

- [ ] 27. Quality controller
  - [ ] 27.1 Implement the quality tier controller
    - Create `src/render/quality.ts`: rolling 120-frame window, step down when p95 exceeds 16.7 ms for 2 consecutive seconds, 10 s recovery hysteresis, tiers mapped to glow, particle multiplier, trail density, shake; never touches the Simulation
    - Verify: `npx vitest run tests/render/quality`
    - _Requirements: 21.6_

  - [ ]* 27.2 Write quality downgrade tests
    - Slow synthetic frames lower the tier; fast frames recover after hysteresis; Simulation state unchanged
    - Verify: `npx vitest run tests/render/qualityBehaviour`
    - _Requirements: 21.6_

- [ ] 28. Menus, transitions, HUD polish and high scores
  - [ ] 28.1 Implement the tolerant high score store
    - Create `src/shell/highScores.ts`: `StorageLike`, strict validator, key `kirobit.highscores.v1`, top 10 sorted insert, empty list on missing or corrupt data, in-memory fallback on storage errors; examples for missing, corrupt, and throwing storage
    - Verify: `npx vitest run tests/shell/highScores`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ]* 28.2 Write property test for high score invariants
    - **Property 26: High score store invariants**
    - Verify: `npx vitest run tests/shell/highScoreInvariants`
    - **Validates: Requirements 16.1, 16.2, 16.3**

  - [ ]* 28.3 Write property test for high score load robustness
    - **Property 27: High score load robustness**
    - Include a throwing storage fake
    - Verify: `npx vitest run tests/shell/highScoreRobustness`
    - **Validates: Requirements 16.4, 16.5, 16.6**

  - [ ] 28.4 Implement menus, transitions and score screens
    - Update `src/shell/screens.ts`: title menu, pause, animated transitions, level outcome transition, game over with high score entry and top-10 table
    - Verify: `npx vitest run tests/shell/screens`
    - _Requirements: 12.7, 14.5, 16.1_

  - [ ] 28.5 Implement polished HUD drawing
    - Create `src/render/hudRenderer.ts`: sprite icons for Lives, Keys, Captives, pellets, power and speed timers, three Bomb slots, Ghost_Hunt remaining-time bar, Combo multiplier with window bar; dirty tracking onto a small HUD canvas redrawn only when the view-model changes
    - Verify: `npx vitest run tests/render/hudRenderer`
    - _Requirements: 13.2, 13.3, 14.5, 28.16_

- [ ] 29. Audio: Soundtrack, reactive effects, buses and procedural sound effects
  - [ ] 29.1 Implement the audio port and mock context
    - Create `src/audio/audioPort.ts` (`AudioContextLike`, `AudioParamLike`, node-like interfaces, `AudioEngineDeps`) and `tests/audio/mockAudio.ts` (`MockAudioContext` recording nodes, connection edges, and every AudioParam automation call; `advance(seconds)`, `findNodes(type)`; injectable `fetchBytes`, `createElement`)
    - Verify: `npx vitest run tests/audio/mockAudio`
    - _Requirements: 15.10, 26.13, 31.9_

  - [ ] 29.2 Implement buses and volume/mute persistence
    - Create `src/audio/buses.ts` (master, music, sfx gains, limiter `DynamicsCompressor`, `setVolume` / `setMuted` with `setTargetAtTime`, defaults master 0.8, music 0.55, sfx 0.9) and `src/audio/audioStore.ts` (`kirobit.audio.v1`, strict tolerant load, debounced save, in-memory fallback, mute stored separately from volume)
    - Verify: `npx vitest run tests/audio/buses tests/audio/audioStore`
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6_

  - [ ] 29.3 Implement the Soundtrack loader
    - Create `src/audio/soundtrack.ts`: URL built with `%20` for `audio/Pixel Pulse.wav` resolved against the base URL; `fetch` with byte progress, `decodeAudioData`, `AudioBufferSourceNode.loop = true` as primary; fallback chain buffer, then `MediaElementAudioSourceNode` stream, then silent; `soundtrackLoadTimeoutMs`; `SoundtrackState { status, progress, method }` observable; one `console.warn` on failure, never throws; read-only on the file
    - Verify: `npx vitest run tests/audio/soundtrack`
    - _Requirements: 26.1, 26.2, 26.3, 26.5, 26.6, 26.7, 26.8_

  - [ ] 29.4 Implement the reactive music effects chain
    - Create `src/audio/effects.ts`: urgency high-shelf, equal-power dry/wet crossfade, WaveShaper bitcrush (`soundtrackCrushBits`, `oversample = 'none'`) with low-pass; `triggerCrush` (attack, hold, release, `cancelScheduledValues`, retrigger from the current value); `setUrgency` (playbackRate and shelf, off / rate / rate+filter, stream path sets element rate once); optional AudioWorklet crusher that falls back to the WaveShaper
    - Verify: `npx vitest run tests/audio/effects`
    - _Requirements: 26.9, 26.10, 26.11, 26.12_

  - [ ] 29.5 Implement procedural SFX recipes and event mapping
    - Create `src/audio/voices.ts` (recipe interpreter, oscillator and noise, `maxVoices`) and `src/audio/sfx.ts` (pure `sfxForEvent(event)` and recipe data) for every listed sound: `pellet`, `wisp` (pitch rises with Combo), `powerPellet`, `speedPellet`, `roleReversal`, `ghostHuntStart`, `ghostHuntEnd`, `bombPickup`, `bombActivate`, `bombExplode` (scaled by destroyed walls), `doorOpen`, `doorClose`, `key`, `rescue`, `allyAttack`, `hunterEaten`, `playerDefeat`, `levelComplete`, `levelTransition`, `hunterWin`, `gameOver`, `ui`; no recorded files, no Pac-Man audio
    - Verify: `npx vitest run tests/audio/sfx`
    - _Requirements: 9.8, 15.1, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9_

  - [ ] 29.6 Implement the audio engine facade
    - Create `src/audio/audioEngine.ts`: lazy context created on the first `keydown` or `pointerdown` with `resume()` inside the gesture, retry on later gestures, no-op engine when unavailable, `visibilitychange` suspend/resume, `handleEvents` dispatch (cues in order, bomb activate then explode staggered up to 20 ms, `triggerCrush` on `KeyCollected`, `setUrgency` on `LevelStarted`, Soundtrack duck on `GameOver` and `LevelEnded`), optional urgency pulse off by default; no reference to Simulation state
    - Verify: `npx vitest run tests/audio/engine`
    - _Requirements: 15.2, 15.10, 26.9, 26.11, 26.13, 27.1_

  - [ ] 29.7 Write mandatory audio property tests and Soundtrack tests
    - **Property 45: Soundtrack load outcomes always end in a safe state** (`arbLoadOutcome`: ok, fetch failure, decode failure, timeout, stream failure; buffer path with loop on success; sound effects still playable)
    - **Property 46: Key pickup triggers a bitcrush that returns smoothly** (mix within [0,1], return within `soundtrackDistortionMs` plus the tail, retrigger from the current value)
    - **Property 47: Events map to the right sound effects** (totality, distinct cues for pellets, Doors, Bomb events, Ghost Hunt events, ally catch, Wisp, Key; non-decreasing Wisp pitch)
    - **Property 25: Soundtrack urgency is monotone, bounded and disable-able**
    - Examples: URL contains `%20` and no raw space; loading state transitions while the Game stays playable; stream fallback; silent fallback with sound effects still playing
    - Verify: `npx vitest run tests/audio`
    - **Validates: Requirements 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 26.1, 26.5, 26.6, 26.7, 26.8, 26.9, 26.10, 26.11, 26.12, 31.9**

  - [ ]* 29.8 Write property test for audio settings persistence
    - **Property 48: Audio settings persistence is lossless and tolerant**
    - Verify: `npx vitest run tests/audio/audioStoreProperty`
    - **Validates: Requirements 27.3, 27.4, 27.5**

  - [ ] 29.9 Write engine and gameplay-triggered audio event tests
    - Audio graph shape (music and sfx buses into master, limiter, destination); unlock before interaction does not throw; blocked or unsupported context creates no error; only synthesized SFX, no sound-effect file request; drive real `step` runs (Key pickup, Bomb collect and explode, Ghost Hunt start and end, ally catch, Wisp, rescue, door changes, level end) into the engine with the mock and assert the expected cues and the Key bitcrush automation; audio handlers leave deep-frozen state unchanged
    - Verify: `npx vitest run tests/audio tests/assets` (`npm run test:audio`)
    - _Requirements: 2.7, 15.1, 15.2, 15.10, 26.9, 26.13, 27.1, 31.9_

  - [ ] 29.10 Implement the audio settings UI and loading indicator
    - Create `src/shell/audioSettings.ts`: master, music, sfx volume sliders and mute toggles bound to `buses` and `audioStore` (keyboard accessible, labelled), restore on start, and a small non-blocking "Loading music" indicator driven by `SoundtrackState`
    - Verify: `npx vitest run tests/shell/audioSettings`
    - _Requirements: 26.6, 27.2, 27.3, 27.4_

- [ ] 30. Phase 2 wiring and asset notice
  - [ ] 30.1 Wire Phase 2 modules into the bootstrap
    - Update `src/shell/main.ts`: sprite atlas init, particle bindings, audio engine and unlock, audio settings UI, high score store, menus and transitions, quality controller, event bus subscriptions
    - Verify: `npm run build` and `npm test`
    - _Requirements: 14.1, 14.4, 14.5, 15.2, 16.1, 21.6, 26.6_

  - [ ] 30.2 Extend the views-read-only property test
    - Complete **Property 3: Views never mutate the Simulation** for Particle_System and Audio_Engine handlers with deep-frozen state
    - Verify: `npx vitest run tests/render/readonly tests/audio`
    - **Validates: Requirements 2.6, 2.7, 19.11**

  - [ ] 30.3 Finalize ASSETS.md and its test
    - Update `ASSETS.md`: source and license of every asset category (code-defined pixel art, procedurally synthesized sound effects with their original motifs documented, procedurally generated mazes, the user-owned Soundtrack with size and SHA-256 unchanged), explicitly no Pac-Man material
    - Add `tests/smoke/assets.test.ts` asserting coverage of sprites, tiles, music, sound effects, mazes, and that the Soundtrack row still matches the fixture
    - Verify: `npx vitest run tests/smoke/assets tests/assets` and `npm run check:soundtrack`
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 26.4_

- [ ] 31. Post-polish balance
  - [ ] 31.1 Re-run balance tuning after polish
    - Run `npm run balance:check` and `npm run balance:smoke`; if outside the bands, adjust only config values and generator/AI weights named in the design, then run `npm run balance:measure`, review the `baseline.json` diff, update `config.ts`, `openQuestions.ts` (mark `tuning` rows `resolved` only when the evidence supports it) and `open-decisions.md`
    - Verify: `npm run balance:check`, `npm run balance:smoke`, `npm run test:sim`, `npx vitest run tests/balance`
    - _Requirements: 20.6, 20.7, 20.8, 20.9, 29.16_

- [ ] 32. Performance and responsiveness verification
  - [ ] 32.1 Verify Simulation and generator performance budgets
    - Run `npm run test:perf` (Tick p95 at most 2 ms with Bombs and Ghost Hunt, Maze generation at most 50 ms); optimize hot paths if a budget fails; record the measured numbers and the machine description in `.kiro/steering/performance.md`
    - Verify: `npm run test:perf`
    - _Requirements: 4.9, 21.3, 21.4, 21.5, 21.7, 25.5_

  - [ ] 32.2 Verify Frame_Time and input latency on modest Windows hardware
    - Replace the stub `tools/perfBrowser.ts` (`npm run perf:browser`): try `npm install --save-exact puppeteer-core` with no browser download; if the install fails (offline, registry error), keep the script free of that dependency and continue. The script loads `puppeteer-core` through a dynamic `import()` inside `try/catch`, looks for an installed Edge or Chrome, launches it headless against `vite preview`, runs `?perf=1`, reads `window.__kirobitPerf`, and prints pass or fail for Frame_Time p95 at most 16.7 ms and input reflected by the next Tick
    - Safe fallback: if `puppeteer-core` is missing, no browser is installed, or the launch fails, the script prints `SKIPPED: <reason>` plus the manual `?perf=1` steps (`npm run build`, `npm run preview`, open `/?perf=1`, read `window.__kirobitPerf`), records "manual check pending" in `.kiro/steering/performance.md`, and exits 0. It never blocks Run All Tasks and never downloads a browser. A measured failure with a found browser exits 1
    - Record the results and the machine (laptop-class CPU, no discrete GPU) in `.kiro/steering/performance.md`; fix any regression (the quality controller must lower the tier before the budget fails)
    - Verify: `npm run perf:browser` (exit 0 on pass or SKIPPED) and `npx vitest run tests/shell/perfHarness` (the fake-clock test is the automated proof in environments without a browser)
    - _Requirements: 21.1, 21.2, 21.6, 21.8_

- [ ] 33. Final integration run
  - [ ] 33.1 Write the end-to-end simulation run
    - Create `tests/e2e/fullRun.test.ts` (`npm run test:e2e`): headless scripted multi-level run through the real `createRun`, `step`, event bus, particle bindings, mock audio engine, and high score store, covering Key pickup, Rescue strategies, Bomb use, Ghost Hunt, Wisp Combo, Door changes, a Hunter win, a Player win, endless levels and game over; assert determinism across two runs, no thrown error, and final state invariants
    - Verify: `npm run test:e2e`
    - _Requirements: 2.3, 12.1, 12.3, 19.12, 31.8, 31.9, 31.10_

- [ ] 34. Documentation
  - [ ] 34.1 Write the README
    - Create `README.md`: what KiroBit is, requirements (Node, browser), run (`npm run dev`, `npm run build`, `npm run preview`), tests (`npm test`, `test:sim`, `test:mechanics`, `test:audio`, `test:perf`, `test:e2e`), lint (`lint`, `lint:determinism`), balance (`balance:measure`, `balance:calibrate`, `balance:check`, `balance:smoke`, `balance:full`), Soundtrack integrity (`check:soundtrack`) with the never-modify rule, controls (arrows/WASD, Space for Bombs), the `?perf=1` harness and `perf:browser` (with its SKIPPED fallback), link to `ASSETS.md`
    - Verify: `npx vitest run tests/smoke/readme` (asserts each command named in the README exists in `package.json`)
    - _Requirements: 1.3, 20.1, 21.8, 22.4, 25.2_

- [ ] 35. Final checkpoint - Everything passes
  - Run `npm test`, `npm run test:perf`, `npm run test:e2e`, `npm run lint`, `npm run lint:determinism`, `npm run balance:check`, `npm run balance:smoke`, `npm run check:soundtrack`, and `npm run build`. Confirm `public/audio/Pixel Pulse.wav` is unchanged.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 36. Playtest iteration 1 (user hands-on playtest feedback, priority order)
  - [x] 36.1 Fair respawn and anti-spawn-kill
    - Add `respawnMinHunterDist` (Cells, default 8) and keep `invulnerabilityTicks` default 120 (2 s) to `src/core/config.ts`; in `src/core/rules.ts` `applyPlayerEaten`, respawn at the reachable Floor Cell (not Cage, not a Door, no Key) that maximises path distance from Squareman and allies-free, preferring `playerStart` when it is at least `respawnMinHunterDist` away; deterministic tie-break; Squareman cannot eat an invulnerable Player (already) and invulnerability starts on the respawn Tick
    - Render: obvious invulnerability (blink plus cyan tint plus a sparkle ring from the particle pool), distinct from the power blink
    - Tests `tests/rules/respawn.test.ts`: property that the respawn Cell is passable, outside the Cage and at least `respawnMinHunterDist` from Squareman whenever such a Cell exists; no PlayerEaten within `invulnerabilityTicks` after a respawn; repeated-death scenario cannot chain deaths faster than the window
    - Verify: `npx vitest run tests/rules/respawn tests/rules/lives tests/rules/eatenPlayer`
    - _Requirements: 11.1, 11.2, 11.3, 11.8, 31.6; playtest P1_
  - [x] 36.2 Stronger death, pickup and explosion feedback
    - Player death: pixel disintegration (sprite pixels become particles), white flash, strong screen shake, brief hit-stop of the render only (Simulation unaffected); pickup bursts for Keys, Wisps, Power, Speed, Bombs and rescues with floating score text; Bomb explosion with bigger shockwave, debris, light flash and shake; all respecting quality tiers and the particle cap
    - Tests in `tests/render/feedback.test.ts` (recording mock context): each event triggers its effect, effects never mutate state, particle cap respected
    - Verify: `npx vitest run tests/render`
    - _Requirements: 14.2, 14.4, 14.6, 28.14, 28.15, 21.5; playtest P2_
  - [x] 36.3 Meaningful Spirit Wisps (points, Combo, HUD)
    - Wisp pickup shows floating `+points xN`; Combo tier visible in the HUD (multiplier, window bar, tier colour); Combo milestone bonus at the cap (`comboCapBonus`, default 100 points, score only); Wisps never count toward or block Squareman's pellet victory
    - Tests: extend `tests/wisps` for the cap bonus (score only, pellet accounting unchanged) and `tests/render/hudRenderer` for the Combo display
    - Verify: `npx vitest run tests/wisps tests/rules/pelletAccounting tests/render/hudRenderer`
    - _Requirements: 30.3, 30.5, 30.8, 30.11, 13.3; playtest P3_
  - [x] 36.4 Kiro-style ghost identity redesign
    - Redesign `src/render/sprites/ghost.ts`: Kiro-inspired rounded ghost silhouette (soft dome head, no Pac-Man skirt points, small side nubs, round eyes with highlight), same species for Player, Captives and allies with distinct palettes; update ASSETS.md
    - Verify: `npx vitest run tests/render/sprites tests/render/spriteCache tests/smoke/assets`
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 22.1; playtest P4_
  - [x] 36.5 Biome progression every 5 levels
    - `src/render/biomes.ts`: biome = floor((level - 1) / 5) mod 6 over haunted purple, red brick, jungle, metal, snow, neon; each with wall, floor, decoration palettes, pickup tints, ambient light and particle flavour; static layer and HUD use it; level-start banner names the biome
    - Gameplay flavour for snow: `src/core` deterministic ice Cells (seeded, a few patches per Maze, never on the Cage, Keys or Doors) where a moving character cannot turn mid-patch (keeps sliding to the next junction); configurable `iceEnabled`, `icePatches`; maze validity unchanged
    - Tests: biome mapping, ice determinism and that ice never traps (every Cell still reachable, Doors safe)
    - Verify: `npx vitest run tests/render/biomes tests/core/ice tests/maze tests/core/determinism`
    - _Requirements: 14.1, 14.3, 4.4, 2.3; playtest P5_
  - [x] 36.6 Control remapping in settings
    - `src/shell/keybindings.ts`: bindings for up, down, left, right, bomb, pause, confirm; key `kirobit.keys.v1`, tolerant load, conflict handling, reset to defaults; settings menu page to rebind by pressing a key; InputCapture and ShellUi use the bindings
    - Tests `tests/shell/keybindings.test.ts`
    - Verify: `npx vitest run tests/shell`
    - _Requirements: 13.1, 27.3; playtest P6_
  - [x] 36.7 30-lives cheat code
    - Title-screen secret code (typed sequence, for example `KIROGHOST`), confirmation banner and sound; run starts with 30 lives and is flagged `cheat`; high scores from cheat runs are marked and stored separately (never mixed into the normal top 10)
    - Tests `tests/shell/cheat.test.ts`
    - Verify: `npx vitest run tests/shell`
    - _Requirements: 11.1, 16.1, 16.2; playtest P7_
  - [x] 36.8 Key placement fairness review
    - Measure the distribution of Key route length (player start to Keys to Cage) and Key-vs-Squareman distance over the existing baseline Seeds; tighten placement in `src/core/maze/placement.ts` only to cut extreme tails (for example route length outside p2..p98) while keeping randomness; record before/after percentiles in `open-decisions.md`
    - If generation output changes, rerun only the affected balance smoke/check, not the 500-Seed measurement, and record the reason
    - Verify: `npx vitest run tests/maze`
    - _Requirements: 4.6, 4.7, 17.1; playtest P8_
  - [ ]* 36.9 VS mode (stretch goal, later phase)
    - Two local players: one controls the ghost, one controls Squareman; start only after 36.1 to 36.8 are complete and stable
    - _Requirements: playtest P9 (stretch)_
- [x] 37. Final arcade features: 1UP and level milestone celebrations
  - [x] 37.1 Implement core 1UP score milestones
    - Add `oneUpThresholds` (default `[10000, 25000, 50000]`) and `oneUpRepeat` (default `50000`) to `src/core/config.ts`; create `src/core/oneUp.ts` (`oneUpMilestone`, `awardOneUps`); add `GameState.oneUpsAwarded` and the `ExtraLife` event (additive edits to `types.ts`, `events.ts`); in `src/core/sim.ts` run `awardOneUps` once at the end of every `step` after every score source, add awarded lives to both `state.lives` and `progression.lives`, carry `oneUpsAwarded` across levels and retries with the score, and apply the award before a same-Tick game over
    - Do not change Squareman AI, speeds, scoring values, generation, item placement or outcome rules
    - Tests `tests/rules/oneUp.test.ts`: milestone sequence (10000, 25000, 50000, 100000, 150000); one scoring event crossing several milestones awards several lives and events; no award twice; life loss keeps score and awards; lives carry across levels; a cheat Run (livesInitial 30) gets the same awards; Property 51, Property 52 and Property 53 (fast-check, at least 100 runs, tag `Feature: kirobit-halloween-maze, Property N: <text>`)
    - Verify: `npx vitest run tests/rules/oneUp tests/rules tests/progression tests/core`
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7_
  - [x] 37.2 Implement core level milestone events
    - Add `celebrationFirstLevel` (100) and `celebrationEvery` (50) to `src/core/config.ts`; create `src/core/milestones.ts` (`isCelebrationLevel`); add the `LevelMilestone` event and the Run field `celebratedUpTo`; in `src/core/sim.ts` emit `LevelMilestone` when a new level (not a retry) is a celebration level above `celebratedUpTo`
    - Create the test helper `tests/helpers/runAt.ts` to build a Run at a chosen level (test code only, nothing in `src/` parses a level)
    - Tests `tests/progression/milestones.test.ts`: levels 100, 150, 200, 250, 300 and 1000 trigger; 99, 101, 125, 149 do not; win into level 100 emits once; retry of level 100 after a lost life emits nothing; Run continues after the event with unchanged score, lives and progression; Property 54 and Property 55
    - Verify: `npx vitest run tests/progression tests/rules tests/core`
    - _Requirements: 34.1, 34.2, 34.3, 34.5_
  - [x] 37.3 Implement 1UP and celebration presentation
    - `src/render/feedback.ts`: animated "1UP!" (scale pop plus bob), green and gold particle burst, HUD lives pulse, queued messages for several awards; create `src/render/celebration.ts`: "CONGRATULATIONS!" with "LEVEL N", fireworks and confetti from the particle pool (cap respected), golden flash, reduced-motion handling; procedural SFX `oneUp` and `fanfare` in the existing SFX module (original motifs, documented in `ASSETS.md`); shell: on `LevelMilestone` extend the level-start hold to `celebrationHoldMs` (3000), confirm key skips, play continues
    - Renderer, particles and audio stay read-only observers; the Soundtrack is untouched
    - Tests: `tests/render/celebration.test.ts` and extended `tests/render/feedback.test.ts` (recording mock context, effects never mutate state, particle cap respected); `tests/audio/arcadeSfx.test.ts` (mock AudioContext, both sounds scheduled, no file loads); `tests/shell/celebrationHold.test.ts` (hold length, skip, no Simulation step during the hold, normal play afterwards)
    - Verify: `npx vitest run tests/render tests/audio tests/shell`
    - _Requirements: 33.8, 34.4, 22.1, 26.6_
  - [x] 37.4 Development-only gallery previews, shortcut guard and Chrome verification
    - Add "1UP!", multiple 1UP and CONGRATULATIONS (levels 100, 150, 250) previews to `tools/gallery/` (dev server only); extend the Chrome verification script to capture them into `tools/gallery/shots/` and record results in `report.json`; play-check that the normal and cheat Runs still start and that the HUD lives counter updates
    - Tests `tests/smoke/noDevShortcuts.test.ts`: `src/` has no level skip, God Mode or debug query handling; the production build input excludes `tools/gallery`
    - Verify: `npx vitest run tests/smoke` and `npm run build`
    - _Requirements: 34.6, 33.8, 34.4_
- [x] 38. Release preparation without publishing
  - [x] 38.1 Clean the workspace and audit `.gitignore`
    - Move evidence files (calibration outputs, measurement summaries, balance run logs) into `tools/balance/evidence/` and list them in `tools/balance/evidence/README.md`; delete only root scratch files created by agents (`.x*`, `.h*`, `.g1-*`, `.g2-*`, `.genhash-*`, `.f*`, `.v*`, `.e*.txt`, `.w*.txt`, `.o*.txt`, `.dp2*`, `.gv.*`, `*.cmd` scratch, `v162-*`, `repro*`, `probe.cjs`, `verify.cjs`, root `*.log`, `*.done`, `ping.txt`, `npmv.txt`, `versions*.txt`), never recursively and never under `public/audio`; record the deleted and moved file lists
    - Keep `.verify-chrome.mjs` by moving it to `tools/gallery/verify-chrome.mjs`
    - Update `.gitignore`: `node_modules/`, `dist/`, `coverage/`, logs, `.env*`, secrets, `tools/gallery/shots/`, OS and editor files, root scratch patterns; ensure `.kiro/` and specs are not ignored
    - Verify: `git check-ignore` shows `.kiro/specs/kirobit-halloween-maze/requirements.md` is not ignored, and `npx vitest run tests/smoke`
    - _Requirements: 35.2, 35.3, 35.6_
  - [x] 38.2 Write the README
    - Rewrite `README.md`: what KiroBit is, requirements (Node version, browser), install, run (`npm run dev`, `npm run build`, `npm run preview`), gameplay rules, controls (arrows/WASD, Space for Bombs, pause, F fullscreen, settings and remapping), Character Workshop steps (enter, draw, save, use, restore, export and import), 1UP and level celebrations, tests, lint, balance and Soundtrack integrity commands, link to `ASSETS.md` and `RELEASE-AUDIT.md`
    - Tests `tests/smoke/readme.test.ts`: every `npm run` command in the README exists in `package.json`
    - Verify: `npx vitest run tests/smoke/readme`
    - _Requirements: 35.1_
  - [x] 38.3 Write the release and licensing audit
    - Create `RELEASE-AUDIT.md`: direct dependencies with versions and licenses (read from `node_modules`), runtime versus dev-only, asset categories with sources (code-defined pixel art, procedural SFX, procedural mazes, user-owned Soundtrack with SHA-256), fonts used, trademarks and permissions needed (the Kiro name and mascot-inspired sprite, the KiroBit name, "Squareman", Pac-Man similarity), a statement that a hackathon submission grants no commercial rights to the Kiro brand, and license and release options (source licenses, separate asset license, rebranding path) for the user to decide
    - Add no license file and change no asset rights
    - Verify: `npm run check:soundtrack`
    - _Requirements: 35.4, 35.5, 35.6, 22.4_
- [x] 39. Checkpoint - Final arcade features and release readiness
  - Run `npx tsc --noEmit`, the core TypeScript check, `npm run lint`, `npm run lint:determinism`, `npm test`, `npm run check:soundtrack` and `npm run build`; confirm the Soundtrack is unchanged and record every outcome; do not rerun the 500-Seed balance measurement because Squareman, generation and win conditions are unchanged
  - Ensure all tests pass, ask the user if questions arise.

- [x] 40. Selectable difficulty (NORMAL, VERY HARD, EXTREME)
  - [x] 40.1 Implement the Squareman speed multiplier and difficulty selection
    - Core (minimal additive edits): add `hunterSpeedPermille` (integer, default 1000, validated in 500..2000) to `src/core/config.ts`; in `src/core/sim.ts` give Squareman `round(levelUnits * hunterSpeedPermille / 1000)` units per Tick before the existing Speed_State and Power_State handling, the Player keeps `levelUnits`; nothing else in core changes (AI, generation, items, rules, scoring untouched)
    - Shell: `src/shell/difficulty.ts` with `DIFFICULTIES` (normal 1000 "NORMAL", veryHard 1150 "VERY HARD", extreme 1250 "EXTREME"), default normal, remembered in localStorage `kirobit.difficulty.v1` with a tolerant loader; a selector shown before a new Run starts (left/right or up/down plus Enter, Esc back to the title), the Run config is `{ ...cfg, hunterSpeedPermille }`; the cheat banner and 30 lives still apply in every mode
    - High scores: store `difficulty` on each entry (missing loads as normal), show it in both the normal and CHEAT RUNS tables; cheat separation unchanged
    - Display: HUD label for the difficulty during play and the difficulty on the game-over screen (VERY HARD and EXTREME in distinct warning colours)
    - Tests: `tests/core/difficulty.test.ts` (exact Squareman units per Tick at levels 1, 5, 10, 20, 40 for 1000, 1150 and 1250 equal `round(unitsPerTick(level) * p / 1000)`; Player units unchanged; Normal is identical to the default config over seeded runs with random inputs, compared Tick by Tick; the 30-lives cheat config and a 1UP award work at 1150 and 1250); `tests/shell/difficulty.test.ts` (default normal, persistence, tolerant load, selector navigation, run config built correctly); extend the high score tests for the difficulty field and legacy entries; HUD and game-over text tests with the recording mock context
    - Verify: `npx vitest run tests/core/difficulty tests/shell tests/render tests/rules/oneUp tests/core/determinism`, `npx tsc --noEmit`, `npm run lint`, `npm run lint:determinism`, `npm run build`
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.7_

## Notes

- Tasks marked with `*` are optional extras (non-critical tests); every other test task is mandatory, including all property tests for the critical categories of Requirement 31.
- Each implementation task lists a `Verify:` command (npm scripts are defined in task 1.1). If it fails, diagnose, fix, and rerun before the next task (Requirement 25.6).
- Property tests use fast-check with at least 100 runs (200 for generator and door properties) and the tag `Feature: kirobit-halloween-maze, Property N: <text>`.
- Property 22 is split across tasks 15.2 and 17.16; Property 3 across tasks 22.10 and 30.2 (both required, because Requirement 19.11 mandates the test).
- Every npm script used in a `Verify:` line or hook is defined in task 1.1 (including `perf:browser`).
- `src/core/maze/partition.ts` is a sub-module of the placement step listed in the design Module Layout, kept in its own file so the wave plan avoids two tasks editing `placement.ts`.
- Soundtrack integrity tooling (task 1.5) is early, as in design wave 0, so the `soundtrack-integrity-on-change` hook is useful from the start. Audio runtime tests are in group 29.
- Balance tuning tasks 19.2 to 19.7 edit `config.ts`, `baseline.json`, and `open-decisions.md`, so they are serialized in separate waves.

## Traceability

Mandatory test coverage (Requirement 31):
- Maze validity and reachability, including after explosions: 5.8, 5.9, 5.10, 17.9, 17.10 (31.1)
- Door safety: 7.4, 17.6, 17.7, 17.8 (31.2)
- Bomb destruction and indestructible tiles: 11.3, 11.4, 11.5 (31.3)
- Pathfinding refresh after explosions: 17.11 (31.4)
- Ghost Hunt behaviour and rescue-state preservation: 12.3, 12.4, 17.13, 17.14, 17.15 (31.5)
- Lives, respawn, dropped Keys: 10.3 to 10.5, 17.5 (31.6)
- Power-pellet cancellation: 9.2, 17.19 (31.7)
- Endless progression: 15.2, 17.16 (31.8)
- Soundtrack loading, fallback, gameplay-triggered audio events: 29.7, 29.9 (31.9)
- Two victory conditions: 17.2, 17.4 (31.10)
- Seeded balance run: 18.9, 19.8 (31.11)
- Wisp and pellet coverage: 5.11, 17.3

Design properties to tasks:
- P1: 17.1; P2: 22.9; P3: 22.10, 30.2; P4: 17.17; P5: 17.18; P6: 8.3; P7: 5.8; P8: 5.9; P9: 5.10
- P10: 7.4; P11: 17.6; P12: 17.7; P13: 14.3; P14: 14.4; P15: 17.2; P16: 10.2; P17: 9.2, 17.19; P18: 9.3; P19: 10.4
- P20: 9.4; P21: 10.5; P22: 15.2, 17.16; P23: 16.6; P24: 26.3; P25: 29.7; P26: 28.2; P27: 28.3; P28: 18.9; P29: 18.8
- P30: 11.3; P31: 11.4; P32: 11.5; P33: 17.9; P34: 17.10; P35: 17.11; P36: 17.12; P37: 17.13; P38: 12.3; P39: 12.4
- P40: 17.14; P41: 17.15; P42: 17.3; P43: 5.11; P44: 13.3; P45, P46, P47: 29.7; P48: 29.8; P49: 17.5; P50: 17.4

Requirements to tasks:
- R1: 1.1, 1.2, 34.1; R2: 1.3, 1.4, 4.2, 16.2, 17.1, 22.4; R3: 8.1 to 8.4, 17.17, 17.18, 22.5; R4: 4.2, 5.1 to 5.12, 19.7
- R5: 5.2, 7.2, 7.3, 7.4, 17.6 to 17.8; R6: 22.1, 24.1, 24.2, 24.7; R7: 10.1, 10.2, 16.5; R8: 14.1 to 14.5, 17.2; R9: 9.1 to 9.3, 10.4, 17.19, 25.3
- R10: 9.1, 9.4, 25.3, 26.1; R11: 10.3 to 10.5, 17.5; R12: 15.1, 15.2, 17.16, 22.6; R13: 16.5, 22.1 to 22.8, 23; R14: 24.x, 25.x, 26.x, 28.4, 28.5
- R15: 29.5, 29.6, 29.7, 29.9; R16: 28.1 to 28.4; R17: 5.8 to 5.10; R18: 7.4, 17.6 to 17.8; R19: 9.2, 9.4, 10.2, 14.5, 15.2, 17.1, 17.2, 17.16, 17.18, 22.10
- R20: 18.1 to 18.9, 19.1 to 19.9; R21: 20.1, 22.8, 27.1, 32.1, 32.2; R22: 1.5, 2.1, 24.x, 30.3; R23: 2.1, 2.2, 2.4; R24: 1.4, 2.3, 2.4
- R25: groups 1, 2, 18, 29 and this plan; R26: 1.2, 1.5, 29.3, 29.4, 29.7, 29.9; R27: 29.2, 29.8, 29.10
- R28: 11.1 to 11.5, 17.9 to 17.12, 22.5, 25.5; R29: 12.1 to 12.4, 17.13 to 17.15, 19.2, 19.9, 25.4; R30: 5.4, 5.11, 13.1, 17.3
- R31: see the mandatory list above; R32: Execution Rules, 1.5, 2.1, 2.3

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "2.1", "2.2", "4.1", "4.2", "4.3"] },
    { "id": 2, "tasks": ["2.3", "4.4", "4.5", "4.6"] },
    { "id": 3, "tasks": ["2.4", "4.7", "5.1", "7.1", "7.2", "8.1", "8.2", "9.1", "11.1", "12.1", "13.1", "15.1", "18.2"] },
    { "id": 4, "tasks": ["5.2", "7.3", "8.3", "8.4", "9.2", "9.3", "9.4", "10.1", "11.3", "11.4", "11.5", "12.2", "13.2", "13.3", "14.1", "15.2", "16.5", "18.8"] },
    { "id": 5, "tasks": ["5.3", "7.4", "10.2", "10.3", "11.2", "12.3", "12.4", "14.2", "16.6"] },
    { "id": 6, "tasks": ["5.4", "10.4", "10.5", "14.3", "14.4", "14.5"] },
    { "id": 7, "tasks": ["5.5"] },
    { "id": 8, "tasks": ["5.6"] },
    { "id": 9, "tasks": ["5.7"] },
    { "id": 10, "tasks": ["5.8", "5.9", "5.10", "5.11", "5.12", "16.1"] },
    { "id": 11, "tasks": ["16.2"] },
    { "id": 12, "tasks": ["16.3"] },
    { "id": 13, "tasks": ["16.4"] },
    { "id": 14, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7", "17.8", "17.9", "17.10", "17.11", "17.12", "17.13", "17.14", "17.15", "17.16", "17.17", "17.18", "17.19", "18.1", "20.1"] },
    { "id": 15, "tasks": ["18.3", "18.7", "22.1", "22.2", "22.3", "22.4"] },
    { "id": 16, "tasks": ["18.4", "18.5", "22.5", "22.6", "22.9"] },
    { "id": 17, "tasks": ["18.6", "22.7", "22.10", "22.11"] },
    { "id": 18, "tasks": ["18.9", "19.1", "22.8"] },
    { "id": 19, "tasks": ["19.2"] },
    { "id": 20, "tasks": ["19.3"] },
    { "id": 21, "tasks": ["19.4"] },
    { "id": 22, "tasks": ["19.5"] },
    { "id": 23, "tasks": ["19.6"] },
    { "id": 24, "tasks": ["19.7"] },
    { "id": 25, "tasks": ["19.8", "19.9"] },
    { "id": 26, "tasks": ["24.1", "24.2", "24.3", "24.4", "26.1", "27.1", "28.1", "29.1"] },
    { "id": 27, "tasks": ["24.5", "24.7", "25.1", "25.2", "25.3", "25.4", "26.2", "26.3", "27.2", "28.2", "28.3", "28.4", "29.2", "29.3", "29.4", "29.5"] },
    { "id": 28, "tasks": ["24.6", "25.5", "28.5", "29.6", "29.7", "29.8"] },
    { "id": 29, "tasks": ["25.6", "29.9", "29.10"] },
    { "id": 30, "tasks": ["30.1", "30.3"] },
    { "id": 31, "tasks": ["30.2", "31.1"] },
    { "id": 32, "tasks": ["32.1", "33.1"] },
    { "id": 33, "tasks": ["32.2"] },
    { "id": 34, "tasks": ["34.1"] }
  ]
}
```

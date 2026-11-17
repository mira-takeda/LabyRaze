---
inclusion: fileMatch
fileMatchPattern:
  - "tests/**"
  - "tools/**"
---

# Testing Conventions

## Tools

- Vitest (`node` environment for `core`, `happy-dom` for render and shell tests, separate `perf` project). Use `npx vitest run <path>`; never watch mode in autonomous runs.
- fast-check for properties. Tests co-locate by area under `tests/<area>/`: `maze`, `doors`, `hunter`, `powers`, `bombs`, `ghostHunt`, `wisps`, `rules`, `progression`, `balance`, `audio`, `assets`, `render`, `shell`, `perf`, `e2e`.
- Tests build Mazes from `tests/helpers/fixtures.ts` until `generateMaze` exists.

## Property tests

- Tag every property: `Feature: kirobit-halloween-maze, Property N: <text>` plus `**Validates: Requirements X.Y**`.
- `numRuns` is at least 100 (default 100; 200 for generator and door properties). Seeds come from `fc.integer()` and are printed on failure for replay.
- Implement only the numbered properties from `design.md`. Add a property only after it is added to the design.
- Prefer smart generators that constrain the input space. No mocks to force a pass. Audio tests use the mock `AudioContextLike`.

## Balance_Baseline procedure

Evidence first. The placeholders (p5 >= 1.3, median <= 3.0, 500 Mazes, 480 Ticks, 2.5 Cells, 3 Bombs, wisp density 0.5, Combo window 120 Ticks) enforce nothing until a baseline replaces them.

1. `npm run balance:measure`: measure ratio distributions (mean, median, p5, p95) for all policies and feature toggles. No band is applied. Only `measure` rewrites `tools/balance/baseline.json`.
2. `npm run balance:calibrate`: sweep `ghostHuntTicks`, `bombRadius`, `bombsPerLevel`, `wispDensity`; propose bands and values.
3. Commit the baseline, update `GameConfig.balanceBand` and the tuned defaults, record evidence in `open-decisions.md`.
4. `npm run balance:check` enforces the committed bands (never rewrites). `npm run balance:smoke` is the 30 s hook run.
- Simulations get no arbitrary short time limits. Use the configured budgets (`balanceFullBudgetMs`, `balanceCalibrateBudgetMs`), record duration, Seed set and results, and report a budget overrun as a failure with units completed, never silent truncation.
- Output must be identical for the same Seed set at any worker count.

## Mandatory test categories (Requirements 17 to 20, 31)

- Maze validity and reachability, including after Bomb explosions (17, 31.1).
- Random Door safety and reachability (18, 31.2).
- Bomb explosions: Destructible_Walls inside the Blast_Radius are destroyed, Indestructible_Walls never; distance fields and Squareman routes update (31.3, 31.4).
- Ghost_Hunt behavior, including the property that the rescued count, Captive flags and Carried_Keys never change through Ghost_Hunt (31.5).
- Lives, respawns, dropped Keys (31.6); Power_Pellet cancellation (31.7); endless progression (31.8); the two competing victory conditions (31.10).
- Gameplay mechanics and determinism: same Seed and inputs give identical state (19).
- Soundtrack loading, failure fallback, and gameplay-triggered audio events with a mock AudioContext (31.9).
- A reproducible seeded Balance_Simulator run across many Mazes and Levels (20, 31.11).

## Pass rules

- A missing, skipped (`it.skip`, `describe.skip`, `todo`) or unmatched test never counts as passing. A Verify path matching zero test files is a failure.
- Do not weaken or delete a mandatory test to get green. Triage a failing property: wrong test, real bug, or a spec gap to raise with the user.
- No test or script writes to `public/audio`. Soundtrack checks are read-only (size, SHA-256, header bytes, HTTP GET).

---
inclusion: manual
---

# Open Design Decisions

Statuses mirror `requirements.md` (Open Design Questions). Every default is a configurable `GameConfig` value, not a permanent rule. Registry in code: `src/core/openQuestions.ts`.

## Approval note

The user approved (this session) using the proposed lives, respawn, dropped-key and level-loss defaults as configurable initial defaults. The combo window, bomb radius, Ghost Hunt duration and balance thresholds are provisional and are tuned by simulation. The status column below stays as in the requirements; rows 1 to 7, 15 and 16 carry "approved as initial default".

## Status table

| # | Topic | Config Key | Default | Status | Note |
|---|-------|-----------|---------|--------|------|
| 1 | Invulnerability after respawn | invulnerabilityTicks | 120 Ticks (2 s) | needsDecision | approved as initial default |
| 2 | Dropped Key placement | droppedKeyPlacement | nearest reachable, outside Cage | needsDecision | approved as initial default |
| 3 | Squareman respawn delay | hunterRespawnTicks | 180 Ticks (3 s) | needsDecision | approved as initial default |
| 4 | Lives reset policy | livesResetPolicy | carry over, extra life every 5 levels | needsDecision | approved as initial default |
| 5 | Squareman level win | hunterWinConsequence | lose 1 life, new Maze same level | needsDecision | approved as initial default |
| 6 | Pellet-starved level | pelletStarvedPolicy | lose 1 life, new Maze same level | needsDecision | approved as initial default |
| 7 | Run end | gameOverPolicy | game over, then high score entry | needsDecision | approved as initial default |
| 8 | Level_Speed increment and cap | speedIncrement, speedCap | 0.03, 1.6 | tuning | |
| 9 | Speed_State multiplier and duration | speedMultiplier, speedDurationTicks | 1.5, 240 Ticks | tuning | |
| 10 | Maze size, Doors, disconnection | mazeSize, doorCount, maxDisconnectTicks, doorMinOpenRatio | 21x21, 4, 180 Ticks, 0.5 | tuning | |
| 11 | Score weights | scoreWeights | 10 / 500 / 100 / 1000 | resolved | |
| 12 | Chase distance and flee | hunterChaseDistance | 8 Cells | tuning | |
| 13 | Particle cap and quality tiers | particleCap, qualityTiers | 500, three tiers | resolved | |
| 14 | Blast_Radius | bombRadius | 3.0 Cells | tuning | tuned (19.3), user approved 3.0 over 2.5 |
| 15 | Explosion affects Squareman or pellets | bombAffectsHunter, bombAffectsPellets | false, false | needsDecision | approved as initial default |
| 16 | Who collects Bombs and Ghost_Hunt | hunterCollectsBombs, hunterCollectsGhostHunt | Player only | needsDecision | approved as initial default |
| 17 | Ghost_Hunt duration and count | ghostHuntTicks, ghostHuntPerLevel | 480 Ticks, 1 per Level | tuning | kept (19.2): no duration qualified |
| 18 | Wisp density, points, Combo window | wispDensity, wispPoints, comboWindowTicks, comboCap | 0.5, 20, 120 Ticks, 5 | tuning | kept (19.5); density 0.5 is a documented deviation |
| 19 | Soundtrack processing intensity | soundtrackDistortionMs, soundtrackMaxRateShift | 250 ms, 0.05 | tuning | |
| 20 | Bombs per Level and Bomb key | bombsPerLevel, bombKey | 3, Space | tuning | |

Balance thresholds (p5 ratio >= 1.3, median <= 3.0, 500 Mazes) were provisional placeholders. Task 19.1 measured them; task 19.6 replaced them with the measured bands (see Final values below).

## Balance methodology (tasks 18 and 19)

- The simulator runs the real `createRun` / `step`. Decoupled race: Squareman alone with the Player parked and invulnerable gives `pelletClearTicks`; the policy alone with Squareman inactive gives `rescueTicks`. Contested race: both act with real collisions, at an unlimited life count so a level always ends in a Player or Squareman win (lives lost are measured, not enforced).
- Plan: all 8 policies on the all-features set at levels 1, 5, 10, 20, 40; the 7 other feature sets (Bombs, Ghost_Hunt, Wisps on/off) with `threeKey`. The full cross product of policies and toggles would cost about 8x more for little information.
- "Wisps off" cannot be expressed through `wispDensity` (the partition keeps at least one Wisp per block by design), so the tool strips the Wisps from the very same generated Maze. The Ordinary_Pellets are identical, so the comparison is an exact A/B.
- `bombNone` / `ghostHuntNone`: walking over a Bomb or Ghost_Hunt item collects it, and the generator may place one on a cut Cell that every route to a Key crosses. These policies therefore route around the items (planning with every Door open, and holding at a closed Door rather than crossing an item) and only collect one that is unavoidable; `bombNone` never detonates. The policy test asserts exactly that.
- 500 Seeds of the full plan take about 85 minutes on this 4-core machine (3 workers), longer than the provisional 30-minute `balanceFullBudgetMs`. The 19.1 measurement ran with a one-off `--budget-ms 7200000` override instead of shrinking the experiment; 19.6 sets the Seed count and budget from the measured precision (bootstrap of the stored per-Seed ratios, `tools/balance/seedCount.ts`).
- Calibration sweeps (19.2 to 19.5) ran independently with the provisional values of the other parameters, 100 Seeds per point at levels 1 and 10; the tuned combination is then re-measured as a whole in 19.6.

## Tuned values and evidence

Record each tuned value with: row number, chosen value, previous value, command run, Seed set and size, config hash, duration, result summary, and the baseline file/commit. Update only after a `balance:measure` / `balance:calibrate` run.

| # | Value | Previous | Command | Seeds | Duration | Evidence |
|---|-------|----------|---------|-------|----------|----------|
| 36.8 | `keyRouteMin` 34, `keyRouteMax` 92 (new, provisional) | none (unbounded) | `tsx tools/balance/keyFairness.ts` (read-only, before and after) | baseline Seeds 1..500 x levels 1, 5, 10, 20, 40 (2,500 Mazes) | after run 20.4 s | Greedy Key route before: p0 24, p2 34, p50 59, p98 92, p100 109 (min 0.41x median). After: p0 34, p2 36, p50 59, p98 86, p100 92, 0 of 2,500 outside the band. Logs: `tools/balance/logs/key-fairness-before.json`, `key-fairness-after.json` |

## Key placement fairness (task 36.8)

Measured with `tools/balance/keyFairness.ts` on the 500 baseline Seeds at levels 1, 5, 10, 20, 40 (2,500 Mazes). Greedy Key route = BFS with every Door open from the Player start to the nearest remaining Key, then to the Cage entrance.

| Metric | Before p0 / p2 / p5 / p50 / p95 / p98 / p100 | After |
|--------|---------------------------------------------|-------|
| Key route length | 24 / 34 / 36 / 59 / 84 / 92 / 109 | 34 / 36 / 38 / 59 / 82 / 86 / 92 |
| Ordinary pellets / route | 0.697 / 0.848 / 0.919 / 1.328 / 2.139 / 2.353 / 3.292 | 0.804 / 0.900 / 0.950 / 1.328 / 2.077 / 2.194 / 2.412 |
| Per-Key abs(dPlayer - dHunter) | 0 / 0 / 0 / 12 / 38 / 42 / 60 | unchanged |
| Min Key distance from Cage entrance | 8 / 8 / 8 / 13 / 26 / 29 / 38 | unchanged |
| Max Key distance from Cage entrance | 9 / 12 / 13 / 25 / 37 / 39 / 40 | 9 / 12 / 13 / 25 / 37 / 39 / 40 |
| Ordinary pellets (Squareman tour proxy) | 71 / 74 / 75 / 78 / 82 / 83 / 86 | unchanged |

- Route length explains difficulty: per level, the Pearson correlation between route length and the baseline threeKey ratio samples (B1G1W1, 500 Seeds each) is -0.837 (L1), -0.791 (L5), -0.788 (L10), -0.757 (L20), -0.750 (L40).
- Decision: the lower tail was extreme (min 24 = 0.41x the median of 59, below the 0.5x threshold), so trivially short Key routes occurred. The upper tail reached 1.85x the median (not past 2x), but the band uses the measured p2..p98 (34..92) as the task specifies, which also cuts the most frustrating 2%.
- Mechanism: `placeItems` resamples the whole Key set from the same `items` stream (at most `KEY_ROUTE_RETRIES` 32 draws) until the route is in band, else keeps the draw nearest the band. A Maze whose first draw is already in band consumes the stream exactly as before. Repair pass C, when it relocates a Key, prefers cells that keep the route in band. `validateMaze` is unchanged, and the fixed fallback template is not band-constrained. The route stays random inside the band.
- Generation output changed for out-of-band Mazes: `tests/maze/nonSnowRegression.test.ts` hash 631bd64e -> 92d59cc2 (documented in the test).
- Baseline status: `tools/balance/baseline.json` (500 Seeds) was measured with the pre-36.8 generator. Tasks 36.1 (respawn), 36.3 (combo bonus) and 36.5 (ice) also changed contested-race behaviour. The baseline must be re-measured in task 19.6 before any band is enforced. It was not re-measured or edited here.

## Calibration results and final values (tasks 19.2 to 19.6)

Sweeps: `npm run balance:calibrate -- <name>`, 100 Seeds per point at levels 1 and 10, base Seed 200001, 3 workers, 2026-11-14 (ghostHunt about 10.7 min, bombRadius about 3.9, bombs about 16.7, wisps about 3.7, combo plus cap 6.8 min). Data: `tools/balance/calibration.json` (copy of the first five sweeps: `tools/balance/logs/calibration-5sweeps-2026-11-14.json`).

| Value | Previous | Final | Evidence and rule |
|-------|----------|-------|-------------------|
| ghostHuntTicks = 480 | 480 | 480 (kept) | No duration from 240 to 1200 met the rule. Mean catches per pickup 0.56 (240) to 0.92 (plateau from 660), p95 at most 2. Squareman win rate 0 at every duration, so the 0.15 floor is saturated and cannot rank durations. |
| bombRadius = 3 | 2.5 | 3.0 | Largest radius with mean walls per Bomb <= 10 (8.28) and median ratio shift <= 0.15 (0.1075). 3.5 fails (12.6 walls). 2.5 also qualifies (7.44 walls, shift 0.1042); the user chose 3.0 for more satisfying wall destruction. |
| bombsPerLevel = 3 | 3 | 3 (kept) | None of the 24 combinations (1 to 4 Bombs x delta 0 to 5) met the rule: bombAggressive wins at least 99.5% everywhere, above the 0.9 ceiling (saturated). Ratio shift stays at most 0.104 with 3 Bombs and reaches 0.15 with 4. Bomb inventory capacity stays 3. |
| bombFairnessDelta = 3 | 3 | 3 (kept) | Same sweep; no evidence to change. |
| wispDensity = 0.5 | 0.5 | 0.5 (DEVIATION) | The rule picks 0.2, the only density with wispSweep slowdown <= 0.1. The user approved keeping 0.5 so the Player has plenty of meaningful collectibles. Measured at 0.2 vs 0.5: slowdown 0.0958 vs 0.1786, race margin 4.13 vs 3.665 (floor 0.1), pellet-clear median 2075 vs 1887 Ticks, coverage 100% at both. The only criterion exceeded is the slowdown, measured by a bot that ignores Keys. Recorded as `wisps.override` in calibration.json; the consistency test accepts it only with approvedBy = user and a written reason. |
| comboWindowTicks = 120 | 120 | 120 (kept) | Median best Combo equals the cap at every window 60 to 180 (Wisp score share 0.49 to 0.51): inconclusive. |
| comboCap = 5, wispPoints = 20 | 5, 20 | kept | Cap sweep 5, 6, 7, 8, 10, 12, 15: the median best Combo equals the cap every time (Wisp score share 0.51 at 5 up to 0.70 at 15). The criterion (median strictly between 1 and the cap) never holds, so no change is justified. Inconclusive, retained. |
| p5Min = 2.68, medianMax = 5.26 | 1.3, 3.0 | measured | Final measurement (below), threeKey ratio across levels 1, 5, 10, 20, 40, bandMargin 0.1. |
| balanceFullSeeds = 500 | 500 | 500 (confirmed) | Precision table: worst-cell p5 error 0.12 and median error 0.087 at 200 Seeds, 0.20 and 0.12 at 60 (check Seeds). 500 keeps the full measurement well inside the noise. |

## Final measurement (task 19.6)

- Command: `tsx tools/balance/cli.ts measure --budget-ms 10800000` (one-off override; the config budget is 1,800,000 ms and the run takes about 58 minutes). Log: `tools/balance/logs/measure-final-500.log`. Exit code 0.
- 57,500 units (500 Seeds x levels 1, 5, 10, 20, 40; 8 policies and 7 feature toggles), 3 workers, 3,507,773 ms (58 min 28 s), 2026-11-14 15:33 to 16:31.
- Config hash 2f2f11a8aec2760f (all gameplay fields; the balance-tool fields are excluded). Seed-set hash 294492e0da6adc28. Previous baseline kept as `tools/balance/logs/baseline-pre-final-2026-11-14.json`.
- threeKey ratio p5 / median / p95: level 10 3.01 / 4.49 / 7.10, level 20 3.15 / 4.71 / 7.52, level 40 3.24 / 4.78 / 7.44. Player win rate at least 0.984 for every policy; bombNone loses at most 1.6% of races.
- Bands from the minimum threeKey p5 and maximum median across levels with margin 0.1: p5Min = 2.68, medianMax = 5.26.
- Not applied: the analytic pre-filter (task 19.7). `prefilterBand` stays inactive, because enabling it changes Maze generation output and would invalidate this baseline.

## Partition repair oscillation fix (after the final measurement)

- Failure: `tests/maze/partition.test.ts`, property "leaves a key-path window with one kind only when the block minimum blocks every flip", counterexample seed 15, level 5 (fast-check seed -1419643758, path "3"). Now a permanent regression test in the same file.
- Root cause (algorithm bug, not the test or the block minimum): cell (11,2) lies on two key paths. The window on path 0 flipped it pellet -> Wisp, the window on path 2 flipped it straight back, on all 12 passes (24 flips), so the raw partition ended with a 4-pellet, 0-Wisp window although every pellet in it was flippable. Raising the pass cap to 400 did not help.
- Fix (`src/core/maze/partition.ts`): when the preferred flip would turn a mixed window on any key path into a one-kind window, the best-scoring candidate that breaks no window is taken instead; without one the preferred flip is kept. Block minimums and the selection rule are unchanged.
- Generation impact, measured on the baseline set (Seeds 1..500 x levels 1, 5, 10, 20, 40 = 2,500 Mazes, `tools/balance/logs/genhash-before-partition-fix.csv` / `genhash-after-partition-fix.csv`): 75 Mazes (3.0%) differ, and in every one of them only the Wisp / Ordinary_Pellet split of the item cells changes (1 to 3 cells; 62 change the Wisp count). Tiles, Doors, Keys, Power, Speed, Bomb and Ghost_Hunt items, starts, ice, the set of item cells and generation attempts are identical in all 2,500 (structural hash comparison, 0 differences). Coverage repairs in generateMaze: 1,109 -> 1,084.
- Measurements: the final 500-Seed baseline (config hash 2f2f11a8aec2760f) and the calibration sweeps were not re-run. The change touches 3% of Mazes by at most 3 of about 180 item cells, so the measured bands and ratios are not materially affected; the next scheduled `balance:measure` (task 31.1) picks it up. `tests/maze/partition.test.ts` "seed 26 level 1" now asserts the stronger outcome (the raw partition is valid and generateMaze needs no coverage repair) instead of the old one-kind window.

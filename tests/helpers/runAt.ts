// Test-only: builds a Run at a chosen level using the existing core builders.
// Nothing in src/ parses a level or offers a skip.

import { ConfigError, validateConfig } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { createHunterBrain } from '../../src/core/hunter';
import { initialProgression } from '../../src/core/progression';
import { buildLevelState } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';

export function runAt(runSeed: number, cfg: GameConfig, level: number, retryIndex = 0): Run {
  const problems = validateConfig(cfg);
  if (problems.length > 0) throw new ConfigError(problems);
  const progression = { ...initialProgression(cfg), levelNumber: level, retryIndex };
  const state = buildLevelState(runSeed, progression, cfg);
  const brain = createHunterBrain(runSeed, level, retryIndex);
  return { state, brain, progression, runSeed, cfg, celebratedUpTo: 0 };
}

/** Forces the run into the level-end phase with the given outcome. */
export function endLevel(run: Run, outcome: 'playerWin' | 'hunterWin'): Run {
  return { ...run, state: { ...run.state, phase: 'levelEnd', outcome } };
}

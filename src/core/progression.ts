// Progression and endless levels: level speed, level seeds, lives policy.
// Pure functions. No DOM, no wall clock, no unseeded randomness.
// The game is endless: there is no final level and no victory phase (Requirement 12.3).

import { deriveSeed } from './prng';
import type { PrngState } from './prng';
import type { GameConfig } from './config';

/** Extra life cadence under livesResetPolicy 'carryPlusExtraEvery5'. */
export const EXTRA_LIFE_EVERY_LEVELS = 5;

export type LevelOutcome = 'playerWin' | 'hunterWin' | 'pelletStarved';

/** Progression slice of the run. Level_Speed is shared by both characters. */
export interface ProgressionState {
  readonly levelNumber: number; // >= 1
  readonly levelsWon: number;
  readonly lives: number; // >= 0
  /** Number of failed attempts at the current Level_Number; mixed into the Maze seed. */
  readonly retryIndex: number;
  readonly gameOver: boolean;
}

export interface LevelSeeds {
  readonly maze: PrngState;
  readonly doors: PrngState;
  readonly hunter: PrngState;
  readonly repair: PrngState;
  readonly items: PrngState;
}

/** Shared Level_Speed factor for Player and Squareman (Requirement 12.2). */
export function levelSpeedFactor(
  levelNumber: number,
  cfg: Pick<GameConfig, 'speedIncrement' | 'speedCap'>,
): number {
  const n = Math.max(1, Math.floor(levelNumber));
  return Math.min(cfg.speedCap, 1 + cfg.speedIncrement * (n - 1));
}

/** Integer fixed-point movement units per Tick at the given level (before Speed_State). */
export function unitsPerTick(
  levelNumber: number,
  cfg: Pick<GameConfig, 'speedIncrement' | 'speedCap' | 'baseUnitsPerTick'>,
): number {
  return Math.round(cfg.baseUnitsPerTick * levelSpeedFactor(levelNumber, cfg));
}

/** Seed of a Maze: deriveSeed(runSeed, levelNumber, stream, retryIndex). */
export function levelSeed(runSeed: number, levelNumber: number, retryIndex = 0): PrngState {
  return deriveSeed(runSeed, levelNumber, 'maze', retryIndex);
}

/** All substream seeds for one level attempt. */
export function levelSeeds(runSeed: number, levelNumber: number, retryIndex = 0): LevelSeeds {
  return {
    maze: deriveSeed(runSeed, levelNumber, 'maze', retryIndex),
    doors: deriveSeed(runSeed, levelNumber, 'doors', retryIndex),
    hunter: deriveSeed(runSeed, levelNumber, 'hunter', retryIndex),
    repair: deriveSeed(runSeed, levelNumber, 'repair', retryIndex),
    items: deriveSeed(runSeed, levelNumber, 'items', retryIndex),
  };
}

/** Initial progression for a new run. */
export function initialProgression(cfg: Pick<GameConfig, 'livesInitial'>): ProgressionState {
  return {
    levelNumber: 1,
    levelsWon: 0,
    lives: cfg.livesInitial,
    retryIndex: 0,
    gameOver: cfg.livesInitial <= 0,
  };
}

type PolicyCfg = Pick<
  GameConfig,
  'livesResetPolicy' | 'hunterWinConsequence' | 'pelletStarvedPolicy' | 'gameOverPolicy'
>;

function loseLife(s: ProgressionState): ProgressionState {
  // Policy 'loseLifeNewMazeSameLevel': lose 1 life, same Level_Number, new retryIndex.
  const lives = Math.max(0, s.lives - 1);
  return { ...s, lives, retryIndex: s.retryIndex + 1, gameOver: lives <= 0 };
}

/**
 * Applies a level outcome. Does nothing once the run is over.
 * Policies come from config; each enum currently has one value, so each switch is exhaustive.
 */
export function applyOutcome(
  s: ProgressionState,
  outcome: LevelOutcome,
  cfg: PolicyCfg,
): ProgressionState {
  if (s.gameOver) return s;
  switch (outcome) {
    case 'playerWin': {
      const levelsWon = s.levelsWon + 1;
      let lives = s.lives;
      switch (cfg.livesResetPolicy) {
        case 'carryPlusExtraEvery5':
          if (levelsWon % EXTRA_LIFE_EVERY_LEVELS === 0) lives += 1;
          break;
      }
      return { levelNumber: s.levelNumber + 1, levelsWon, lives, retryIndex: 0, gameOver: false };
    }
    case 'hunterWin':
      switch (cfg.hunterWinConsequence) {
        case 'loseLifeNewMazeSameLevel':
          return loseLife(s);
      }
      return s;
    case 'pelletStarved':
      switch (cfg.pelletStarvedPolicy) {
        case 'loseLifeNewMazeSameLevel':
          return loseLife(s);
      }
      return s;
  }
}

/** Seed of the Maze for the current progression state. */
export function currentMazeSeed(runSeed: number, s: ProgressionState): PrngState {
  return levelSeed(runSeed, s.levelNumber, s.retryIndex);
}

// Shared level runner for the Balance_Simulator and integration tests.
// Drives the real `createRun` / `step` with a Policy. Pure and deterministic.

import type { GameConfig } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createHunterBrain } from '../../src/core/hunter';
import type { ProgressionState } from '../../src/core/progression';
import { buildLevelState, createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { GameState, Input } from '../../src/core/types';
import type { Policy } from './policies';

/** A respawn countdown long enough that the Hunter never acts during a measured level. */
export const HUNTER_DISABLED = 1_000_000_000;

export type RaceMode = 'contested' | 'playerOnly';

export interface LevelResult {
  outcome: 'playerWin' | 'hunterWin' | 'timeout' | 'gameOver';
  ticks: number;
  livesLost: number;
  events: GameEvent[];
  final: GameState;
}

/** Freezes the Hunter for a Player-only race (no movement, pickups, decisions or collisions). */
export function disableHunter(run: Run): Run {
  return { ...run, state: { ...run.state, hunter: { ...run.state.hunter, respawnIn: HUNTER_DISABLED } } };
}

export interface PlayOptions {
  mode?: RaceMode;
  maxTicks?: number;
  /** Keep all events (memory heavy for long runs); default true. */
  keepEvents?: boolean;
  /** Called after every Tick with the new state and the Tick's events. */
  onTick?: (state: GameState, events: readonly GameEvent[], input: Input) => void;
}

/** Plays the current level of `run` until it ends or `maxTicks` elapse. */
export function playLevel(run: Run, policy: Policy, opts: PlayOptions = {}): { run: Run; result: LevelResult } {
  const maxTicks = opts.maxTicks ?? 20_000;
  const keep = opts.keepEvents ?? true;
  let r = opts.mode === 'playerOnly' ? disableHunter(run) : run;
  const startLives = r.state.lives;
  const events: GameEvent[] = [];
  let t = 0;
  while (t < maxTicks && r.state.phase === 'playing') {
    const input = policy(r.state);
    const out = step(r, input);
    r = out.run;
    if (keep) events.push(...out.events);
    opts.onTick?.(r.state, out.events, input);
    t++;
  }
  const s = r.state;
  const outcome: LevelResult['outcome'] =
    s.phase === 'gameOver' ? 'gameOver' : s.phase === 'levelEnd' ? (s.outcome === 'playerWin' ? 'playerWin' : 'hunterWin') : 'timeout';
  return { run: r, result: { outcome, ticks: t, livesLost: startLives - s.lives, events, final: s } };
}

/** Convenience: a fresh run of `seed` with the given config. */
export function freshRun(seed: number, cfg: GameConfig): Run {
  return createRun(seed, cfg);
}

/**
 * A run that starts directly at `level` (first attempt), with the same Maze, seeds and Hunter
 * brain the run would have reached there. Used to measure deep levels without playing up to them.
 */
export function runAtLevel(seed: number, level: number, cfg: GameConfig): Run {
  const base = createRun(seed, cfg);
  if (level <= 1) return base;
  const progression: ProgressionState = { ...base.progression, levelNumber: level, levelsWon: level - 1 };
  const state = buildLevelState(seed, progression, cfg);
  const brain = createHunterBrain(seed, level, 0);
  return { ...base, state, brain, progression };
}

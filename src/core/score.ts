// Score weights, Spirit Wisp scoring and the Combo state machine (design: Spirit Wisps and Combo).
// Pure and deterministic: every function returns new values and never mutates its inputs.
// The Combo changes `score` only. It never touches pellet accounting or win conditions.

import type { GameConfig } from './config';
import type { GameEvent } from './events';
import type { Cell } from './types';

/** The slice of GameState the Combo reads and writes. */
export interface ComboState {
  comboCount: number; // 1..comboCap
  comboTicksLeft: number; // 0 = no active window
}

export type ScoreWeights = GameConfig['scoreWeights'];
export type ScoreEvent = 'ordinary' | 'captive' | 'hunterEaten' | 'level';

export const INITIAL_COMBO: Readonly<ComboState> = { comboCount: 1, comboTicksLeft: 0 };

/** Points for one scoring event, from the configured weights. */
export function scoreFor(weights: ScoreWeights, kind: ScoreEvent): number {
  return weights[kind];
}

export interface WispResult {
  combo: ComboState;
  points: number;
  event: Extract<GameEvent, { t: 'WispCollected' }>;
}

/** Player collects a Wisp: +1 inside an active window (capped), else restart at 1. */
export function collectWisp(
  combo: ComboState,
  cell: Cell,
  cfg: Pick<GameConfig, 'wispPoints' | 'comboWindowTicks' | 'comboCap' | 'comboCapBonus'>,
): WispResult {
  const active = combo.comboTicksLeft > 0;
  const comboCount = active ? Math.min(cfg.comboCap, combo.comboCount + 1) : 1;
  const points = cfg.wispPoints * comboCount;
  // Milestone: awarded once each time a chain climbs onto the cap, never while it stays there.
  const reachedCap = cfg.comboCap >= 2 && comboCount === cfg.comboCap && (!active || combo.comboCount < cfg.comboCap);
  const bonus = reachedCap ? cfg.comboCapBonus : 0;
  return {
    combo: { comboCount, comboTicksLeft: cfg.comboWindowTicks },
    points,
    event: { t: 'WispCollected', cell, combo: comboCount, points, bonus },
  };
}

export interface TickResult {
  combo: ComboState;
  events: GameEvent[];
}

/** Per-Tick window countdown. Reaching 0 resets the multiplier and emits ComboReset. */
export function tickCombo(combo: ComboState): TickResult {
  if (combo.comboTicksLeft <= 0) return { combo: { ...combo }, events: [] };
  const left = combo.comboTicksLeft - 1;
  if (left > 0) return { combo: { comboCount: combo.comboCount, comboTicksLeft: left }, events: [] };
  return {
    combo: { comboCount: 1, comboTicksLeft: 0 },
    events: [{ t: 'ComboReset', reason: 'expired' }],
  };
}

/** Player eaten: reset immediately. Emits ComboReset only if a Combo was running. */
export function resetComboOnEaten(combo: ComboState): TickResult {
  const active = combo.comboTicksLeft > 0 || combo.comboCount > 1;
  return {
    combo: { comboCount: 1, comboTicksLeft: 0 },
    events: active ? [{ t: 'ComboReset', reason: 'playerEaten' }] : [],
  };
}

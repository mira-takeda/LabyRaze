// HUD view-model (design.md: HUD View-Model). Pure: no DOM, no wall clock, no randomness.
// The Renderer only draws this structure. The state is never mutated.

import type { GameConfig } from './config';
import { powerHolder, speedTicksLeft, ticksLeft } from './powers';
import { levelSpeedFactor } from './progression';
import type { GameState, Who } from './types';

export interface HudCharacter {
  /** Remaining power seconds (0 = none). */
  readonly powerSeconds: number;
  /** Fraction of the full power duration left, in [0, 1]. */
  readonly powerFraction: number;
  /** Remaining speed seconds (0 = none). */
  readonly speedSeconds: number;
  /** Fraction of the full speed duration left, in [0, 1]. */
  readonly speedFraction: number;
  /** True while this character is in Speed_State. */
  readonly speedActive: boolean;
  /** True only for the current power holder (the empowered character blinks). */
  readonly blink: boolean;
}

export interface HudModel {
  readonly score: number;
  readonly lives: number;
  readonly level: number;
  readonly speedFactor: number;
  readonly carriedKeys: number;
  /** Rescued Captives out of `rescuedTotal`, computed ONLY from `captives`. */
  readonly rescued: number;
  readonly rescuedTotal: 3;
  /** Remaining Ordinary_Pellets (never Wisps). */
  readonly pelletsRemaining: number;
  readonly pelletsTotal: number;
  /** Bomb_Inventory as three slots. */
  readonly bombs: { readonly filled: readonly [boolean, boolean, boolean] };
  readonly combo: {
    readonly multiplier: number;
    readonly windowFraction: number;
    /** Combo tier, 1..cap (same as the multiplier). */
    readonly tier: number;
    readonly cap: number;
    /** Tier progress in [0, 1]: (tier - 1) / (cap - 1), 1 at the cap (or cap 1). */
    readonly tierFraction: number;
    /** Points earned by the running chain (0 when no window is open). */
    readonly chainPoints: number;
  };
  /** Spirit_Wisps collected this level out of those placed in the Maze. Never Ordinary_Pellets. */
  readonly wisps: { readonly collected: number; readonly total: number };
  readonly powerHolder: Who | null;
  readonly player: HudCharacter;
  readonly hunter: HudCharacter;
  readonly ghostHunt: {
    readonly active: boolean;
    readonly secondsLeft: number;
    readonly fraction: number;
  };
  /** 0..1, from level speed and pellets remaining; for audio and visuals. */
  readonly urgency: number;
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function frac(left: number, full: number): number {
  return full > 0 ? clamp01(left / full) : 0;
}

type HudCfg = Pick<
  GameConfig,
  | 'tickRate'
  | 'powerTicks'
  | 'speedDurationTicks'
  | 'ghostHuntTicks'
  | 'comboWindowTicks'
  | 'comboCap'
  | 'speedIncrement'
  | 'speedCap'
>;

export function buildHud(state: GameState, cfg: HudCfg): HudModel {
  const holder = powerHolder(state);
  const character = (who: Who): HudCharacter => {
    const p = ticksLeft(state, who);
    const s = speedTicksLeft(state, who);
    return {
      powerSeconds: p / cfg.tickRate,
      powerFraction: frac(p, cfg.powerTicks),
      speedSeconds: s / cfg.tickRate,
      speedFraction: frac(s, cfg.speedDurationTicks),
      speedActive: s > 0,
      blink: holder === who,
    };
  };

  const filledCount = Math.min(3, Math.max(0, Math.floor(state.bombs)));
  const filled: [boolean, boolean, boolean] = [filledCount >= 1, filledCount >= 2, filledCount >= 3];

  const rescued = state.captives.filter(Boolean).length;
  const total = state.maze.ordinary.length;
  const remaining = Math.max(0, state.items.ordinaryRemaining);

  const speedFactor = levelSpeedFactor(state.levelNumber, cfg);
  const speedSpan = cfg.speedCap - 1;
  const speedNorm = speedSpan > 0 ? clamp01((speedFactor - 1) / speedSpan) : 0;
  const scarcity = total > 0 ? clamp01(1 - remaining / total) : 0;
  const urgency = clamp01(0.5 * speedNorm + 0.5 * scarcity);

  const gh = state.ghostHunt.ticksLeft;

  return {
    score: state.score,
    lives: state.lives,
    level: state.levelNumber,
    speedFactor,
    carriedKeys: state.carriedKeys,
    rescued,
    rescuedTotal: 3,
    pelletsRemaining: remaining,
    pelletsTotal: total,
    bombs: { filled },
    combo: {
      multiplier: state.comboCount,
      windowFraction: state.comboTicksLeft > 0 ? frac(state.comboTicksLeft, cfg.comboWindowTicks) : 0,
      tier: Math.min(Math.max(1, state.comboCount), Math.max(1, cfg.comboCap)),
      cap: cfg.comboCap,
      tierFraction:
        cfg.comboCap > 1
          ? clamp01((Math.min(Math.max(1, state.comboCount), cfg.comboCap) - 1) / (cfg.comboCap - 1))
          : 1,
      chainPoints: state.comboTicksLeft > 0 ? Math.max(0, state.comboChainPoints) : 0,
    },
    wisps: {
      total: state.maze.wisps.length,
      collected: Math.max(0, Math.min(state.maze.wisps.length, state.maze.wisps.length - state.items.wispsRemaining)),
    },
    powerHolder: holder,
    player: character('player'),
    hunter: character('hunter'),
    ghostHunt: {
      active: gh > 0,
      secondsLeft: Math.max(0, gh) / cfg.tickRate,
      fraction: frac(gh, cfg.ghostHuntTicks),
    },
    urgency,
  };
}

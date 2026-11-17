// Power and speed rules (design.md: Powers, Cancellation and Speed). Pure functions:
// no DOM, no wall clock, no randomness. Only the two characters are involved.

import type { GameConfig } from './config';
import type { GameEvent } from './events';
import type { Character, Who } from './types';

/** The two characters that can hold power. */
export interface Duo {
  player: Character;
  hunter: Character;
}

export interface PowerResult extends Duo {
  events: GameEvent[];
}

export function other(who: Who): Who {
  return who === 'player' ? 'hunter' : 'player';
}

/** Who currently holds offensive power, or null. Used by the Renderer for blinking. */
export function powerHolder(s: Duo): Who | null {
  if (s.player.power > 0) return 'player';
  if (s.hunter.power > 0) return 'hunter';
  return null;
}

/** Remaining power Ticks of `who` (0 = none). */
export function ticksLeft(s: Duo, who: Who): number {
  return s[who].power;
}

/** Remaining speed Ticks of `who` (0 = none). */
export function speedTicksLeft(s: Duo, who: Who): number {
  return s[who].speed;
}

/**
 * The single writer that starts or refreshes power. It always zeroes the other
 * holder and signals RoleReversed when that cancels a running power.
 */
export function grantPower(s: Duo, who: Who, cfg: Pick<GameConfig, 'powerTicks'>): PowerResult {
  const events: GameEvent[] = [];
  const opp = other(who);
  const next: Duo = { player: s.player, hunter: s.hunter };
  if (s[opp].power > 0) {
    next[opp] = { ...s[opp], power: 0 };
    events.push({ t: 'PowerEnded', who: opp });
    events.push({ t: 'RoleReversed', to: who });
  }
  next[who] = { ...s[who], power: cfg.powerTicks };
  events.push({ t: 'PowerStarted', who }); // also emitted on refresh
  return { ...next, events };
}

/**
 * Resolves Power_Pellet pickups of one Tick. When both characters pick one up on
 * the same Tick, parity of `tick` orders them (even: Player first, odd: Hunter
 * first). The loser still consumes its pellet but gains nothing (PowerDenied).
 */
export function resolvePowerPickups(
  s: Duo,
  tick: number,
  picked: { player: boolean; hunter: boolean },
  cfg: Pick<GameConfig, 'powerTicks'>,
): PowerResult {
  const events: GameEvent[] = [];
  let cur: Duo = s;
  if (picked.player && picked.hunter) {
    const winner: Who = tick % 2 === 0 ? 'player' : 'hunter';
    const loser = other(winner);
    const r = grantPower(cur, winner, cfg);
    cur = r;
    events.push(...r.events, { t: 'PowerDenied', who: loser });
  } else if (picked.player || picked.hunter) {
    const r = grantPower(cur, picked.player ? 'player' : 'hunter', cfg);
    cur = r;
    events.push(...r.events);
  }
  return { player: cur.player, hunter: cur.hunter, events };
}

/** Starts or refreshes Speed_State; independent of power. */
export function grantSpeed(
  s: Duo,
  who: Who,
  cfg: Pick<GameConfig, 'speedDurationTicks'>,
): PowerResult {
  const next: Duo = { player: s.player, hunter: s.hunter };
  next[who] = { ...s[who], speed: cfg.speedDurationTicks };
  return { ...next, events: [{ t: 'SpeedStarted', who }] };
}

/**
 * Movement units for this Tick: the speed multiplier applies to movement units
 * only, and only while the character is in Speed_State.
 */
export function speedUnits(
  levelUnits: number,
  c: Pick<Character, 'speed'>,
  cfg: Pick<GameConfig, 'speedMultiplier'>,
): number {
  return c.speed > 0 ? Math.round(levelUnits * cfg.speedMultiplier) : levelUnits;
}

/** Decrements power and speed timers by one Tick and emits expiry events. */
export function tickPowerTimers(s: Duo): PowerResult {
  const events: GameEvent[] = [];
  const dec = (c: Character, who: Who): Character => {
    let power = c.power;
    let speed = c.speed;
    if (power > 0) {
      power -= 1;
      if (power === 0) events.push({ t: 'PowerEnded', who });
    }
    if (speed > 0) {
      speed -= 1;
      if (speed === 0) events.push({ t: 'SpeedEnded', who });
    }
    return power === c.power && speed === c.speed ? c : { ...c, power, speed };
  };
  const player = dec(s.player, 'player');
  const hunter = dec(s.hunter, 'hunter');
  return { player, hunter, events };
}

// Pure render-side interpolation (Requirement 3.6). Never writes into the Simulation.

import { CELL_UNITS } from '../core/config';
import type { Cell, Character } from '../core/types';

/**
 * Fractional Cell position of a character for a render frame.
 * t = clamp((progress + alpha * unitsPerTick) / CELL_UNITS, 0, 1), where alpha (clamped to
 * [0,1]) is the fraction of the next Tick elapsed. `unitsPerTick` is the character's current
 * speed in units; it defaults to 0, which draws the position of the last Tick.
 * Idle characters and non-adjacent cell pairs (wrap pairs) snap to `cell`, so there is no
 * long-distance smear across the maze.
 */
export function interpolate(
  character: Pick<Character, 'cell' | 'next' | 'progress'>,
  alpha: number,
  unitsPerTick = 0,
): Cell {
  const { cell, next } = character;
  if (!next) return { x: cell.x, y: cell.y };
  if (Math.abs(next.x - cell.x) + Math.abs(next.y - cell.y) !== 1) {
    return { x: cell.x, y: cell.y };
  }
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  const raw = (character.progress + a * unitsPerTick) / CELL_UNITS;
  const t = Math.min(1, Math.max(0, raw));
  return { x: cell.x + (next.x - cell.x) * t, y: cell.y + (next.y - cell.y) * t };
}

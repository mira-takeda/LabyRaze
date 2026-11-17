// Grid movement with fixed-point progress and buffered turns (design: Grid Movement, Buffered Turns).
// Pure and deterministic: `stepMovement` returns a new Character and never mutates its inputs.

import { CELL_UNITS } from './config';
import { dirDx, dirDy, isPassable, wrapPartner } from './grid';
import type { Cell, Character, Dir, DoorSpec } from './types';

/** Read-only world view movement needs (live wall tiles, Door states, wrap pairs). */
export interface MoveEnv {
  width: number;
  height: number;
  tiles: Uint8Array; // live wall layer (GameState.walls.tiles)
  doors: ReadonlyArray<DoorSpec>;
  doorMask: number; // bit i set = Door i open
  wrapPairs: ReadonlyArray<readonly [Cell, Cell]>;
  /**
   * Optional snow-biome ice mask (Maze.ice). Ice rule: while a character's Cell is ice it keeps
   * sliding straight. A pressed or buffered turn (including a reverse) is not taken on an ice
   * Cell and no mid-step reverse is accepted while either end of the step is ice. The turn stays
   * buffered and is taken at the first non-ice boundary. Only when the straight path is blocked
   * (wall or closed Door) may a character turn or reverse on ice, so ice never traps anyone.
   */
  ice?: Uint8Array;
}

function onIce(env: MoveEnv, c: Cell): boolean {
  return env.ice !== undefined && env.ice[c.y * env.width + c.x] === 1;
}

export function oppositeDir(d: Dir): Dir {
  switch (d) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    default:
      return 'left';
  }
}

function targetOf(cell: Cell, d: Dir): Cell {
  return { x: cell.x + dirDx(d), y: cell.y + dirDy(d) };
}

function canEnter(env: MoveEnv, c: Cell): boolean {
  return isPassable(env.tiles, env.width, env.height, env.doors, env.doorMask, c.x, c.y);
}

/** Result of boundary resolution at `cell`. `dir === null` means hold (or idle with no direction). */
interface Boundary {
  dir: Dir | null;
  buffered: Dir | null;
  target: Cell | null; // non-null when a step starts
}

/**
 * Boundary direction resolution: 1) buffered direction if passable (buffer cleared),
 * 2) else continue in the current direction if passable, 3) else hold. A hold keeps
 * `dir` and `buffered`, so the character resumes when a closed Door opens.
 */
function resolveBoundary(env: MoveEnv, cell: Cell, dir: Dir | null, buffered: Dir | null): Boundary {
  if (dir !== null && onIce(env, cell) && canEnter(env, targetOf(cell, dir))) {
    return { dir, buffered, target: targetOf(cell, dir) };
  }
  if (buffered !== null) {
    const t = targetOf(cell, buffered);
    if (canEnter(env, t)) return { dir: buffered, buffered: null, target: t };
  }
  if (dir !== null) {
    const t = targetOf(cell, dir);
    if (canEnter(env, t)) return { dir, buffered, target: t };
  }
  return { dir, buffered, target: null };
}

/**
 * Advances one Tick. `pressed` is the newest direction pressed this Tick (or null).
 * `unitsPerTick` is a non-negative integer below half a Cell (validateConfig), so at most
 * one Cell boundary is crossed per Tick; leftover units carry into the next step.
 * Invariant on the result: `progress` is in [0, CELL_UNITS), and `next` is null exactly
 * when the character is held or idle at a boundary (progress 0).
 */
export function stepMovement(c: Character, pressed: Dir | null, unitsPerTick: number, env: MoveEnv): Character {
  let cell: Cell = { x: c.cell.x, y: c.cell.y };
  let next: Cell | null = c.next ? { x: c.next.x, y: c.next.y } : null;
  let progress = c.progress;
  let dir = c.dir;
  let buffered = c.buffered;

  // A step with no progress yet is still at the boundary of `cell`.
  if (next !== null && progress <= 0) {
    next = null;
    progress = 0;
  }

  if (pressed !== null) {
    if (next !== null && dir !== null && pressed === oppositeDir(dir) && !onIce(env, cell) && !onIce(env, next)) {
      // Mid-step reverse: immediate, no boundary needed. Swap the segment ends.
      const from = cell;
      cell = next;
      next = from;
      progress = CELL_UNITS - progress;
      dir = pressed;
      buffered = null;
    } else {
      buffered = pressed; // newest press replaces the buffer
    }
  }

  // Idle or held at a boundary: try to start a step.
  if (next === null) {
    const b = resolveBoundary(env, cell, dir, buffered);
    dir = b.dir;
    buffered = b.buffered;
    if (b.target === null) return { ...c, cell, next: null, progress: 0, dir, buffered };
    next = b.target;
    progress = 0;
  }

  progress += unitsPerTick;
  if (progress >= CELL_UNITS) {
    const leftover = progress - CELL_UNITS;
    const partner = wrapPartner(env.wrapPairs, next.x, next.y);
    cell = partner ? { x: partner.x, y: partner.y } : next;
    const b = resolveBoundary(env, cell, dir, buffered);
    dir = b.dir;
    buffered = b.buffered;
    if (b.target === null) {
      next = null;
      progress = 0;
    } else {
      next = b.target;
      progress = leftover;
    }
  }

  return { ...c, cell, next, progress, dir, buffered };
}

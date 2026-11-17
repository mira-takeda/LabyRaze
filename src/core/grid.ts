// Grid helpers: cell indexing, 4-neighbour lookup, wrap pairs, passability.
// Pure and allocation-light: no DOM, no clock, no randomness.

import { Tile } from './types';
import type { Cell, Dir, DoorSpec } from './types';

/**
 * Fixed neighbour order, used for every neighbour loop and BFS tie-break
 * (design: "ties are broken by a fixed neighbor order"):
 * index 0 = up (0,-1), 1 = right (+1,0), 2 = down (0,+1), 3 = left (-1,0).
 */
export const NEIGHBOR_DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
export const NEIGHBOR_DX: readonly number[] = [0, 1, 0, -1];
export const NEIGHBOR_DY: readonly number[] = [-1, 0, 1, 0];

/** Direction to its (dx, dy) offset. */
export function dirDx(d: Dir): number {
  return d === 'right' ? 1 : d === 'left' ? -1 : 0;
}
export function dirDy(d: Dir): number {
  return d === 'down' ? 1 : d === 'up' ? -1 : 0;
}

/** Row-major cell index: y * width + x. */
export function cellIndex(width: number, x: number, y: number): number {
  return y * width + x;
}
export function cellX(width: number, index: number): number {
  return index % width;
}
export function cellY(width: number, index: number): number {
  return Math.floor(index / width);
}

export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/**
 * Index of the neighbour of cell `index` in direction slot `k` (0..3, see
 * NEIGHBOR_DIRS), or -1 when it lies outside the grid. Wrap pairs are not applied.
 */
export function neighborIndex(width: number, height: number, index: number, k: number): number {
  const x = (index % width) + NEIGHBOR_DX[k]!;
  const y = Math.floor(index / width) + NEIGHBOR_DY[k]!;
  return inBounds(width, height, x, y) ? y * width + x : -1;
}

/**
 * Writes in-bounds neighbour indices of `index` into `out` in the fixed order and
 * returns how many were written (0..4). `out` must hold at least 4 entries.
 */
export function neighbors(
  width: number,
  height: number,
  index: number,
  out: Int32Array | number[],
): number {
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const j = neighborIndex(width, height, index, k);
    if (j >= 0) out[n++] = j;
  }
  return n;
}

/** The paired cell of (x, y) in `wrapPairs`, or null when it is not part of a pair. */
export function wrapPartner(wrapPairs: ReadonlyArray<readonly [Cell, Cell]>, x: number, y: number): Cell | null {
  for (let i = 0; i < wrapPairs.length; i++) {
    const p = wrapPairs[i]!;
    if (p[0].x === x && p[0].y === y) return p[1];
    if (p[1].x === x && p[1].y === y) return p[0];
  }
  return null;
}

/** Index into `doors` of the Door at (x, y), or -1. Door counts are tiny, so a scan is fine. */
export function doorIndexAt(doors: ReadonlyArray<DoorSpec>, x: number, y: number): number {
  for (let i = 0; i < doors.length; i++) {
    const c = doors[i]!.cell;
    if (c.x === x && c.y === y) return i;
  }
  return -1;
}

/**
 * Passability of one tile code. Floor, CageInterior and CageGate are passable;
 * Door only when open; Wall and WallHard never. A destroyed wall is stored as
 * Floor in the live wall layer, so it is passable with no special case.
 */
export function isTilePassable(tile: number, doorOpen: boolean): boolean {
  switch (tile) {
    case Tile.Floor:
    case Tile.CageInterior:
    case Tile.CageGate:
      return true;
    case Tile.Door:
      return doorOpen;
    default:
      return false;
  }
}

/**
 * Passability of cell (x, y) for the live wall tile array `tiles` (GameState.walls.tiles)
 * and `doorMask` (bit i set = Door i open, matching `doors` order). Out of bounds is impassable.
 */
export function isPassable(
  tiles: Uint8Array,
  width: number,
  height: number,
  doors: ReadonlyArray<DoorSpec>,
  doorMask: number,
  x: number,
  y: number,
): boolean {
  if (!inBounds(width, height, x, y)) return false;
  const tile = tiles[y * width + x]!;
  if (tile !== Tile.Door) return isTilePassable(tile, false);
  const di = doorIndexAt(doors, x, y);
  return di >= 0 && ((doorMask >>> di) & 1) === 1;
}

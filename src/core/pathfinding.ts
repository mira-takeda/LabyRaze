// Pathfinding: BFS distance fields over the live wall layer, open Doors and wrap pairs.
// Pure and deterministic: no DOM, no clock, no randomness. Typed arrays in the hot path.
//
// Design (Pathfinding and Dynamic Doors): unit-cost 4-neighbour BFS plus wrap pairs.
// A closed Door is impassable; a destroyed wall is stored as Floor in the live layer, so it
// is passable without a special case. Ties are broken by the fixed neighbour order
// (up, right, down, left) and then wrap partner, never by hash-map iteration order.

import { NEIGHBOR_DX, NEIGHBOR_DY, NEIGHBOR_DIRS, isPassable, wrapPartner } from './grid';
import type { Cell, Dir, DoorState, Maze, WallLayer } from './types';

/** Distance value of a Cell that no source can reach. */
export const UNREACHABLE = -1;

/** The part of a Maze that pathfinding needs (a Maze satisfies it). */
export type NavLayout = Pick<Maze, 'width' | 'height' | 'doors' | 'wrapPairs'>;

export interface DistanceField {
  readonly width: number;
  readonly height: number;
  readonly doorMask: number;
  readonly version: number; // walls.version the field was computed for
  /** Steps to the nearest source per Cell index, or UNREACHABLE. */
  readonly dist: Int32Array;
}

/**
 * Multi-source BFS. `sources` are Cell indices (y * width + x); each gets distance 0 even when
 * it is not itself passable (e.g. a target standing on a closed Door). Expansion only enters
 * passable Cells. Neighbours are visited in fixed order, so the result is fully deterministic.
 */
export function computeDistanceField(
  nav: NavLayout,
  tiles: Uint8Array,
  doorMask: number,
  version: number,
  sources: ArrayLike<number>,
): DistanceField {
  const { width, height, doors, wrapPairs } = nav;
  const total = width * height;
  const dist = new Int32Array(total).fill(UNREACHABLE);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]!;
    if (s < 0 || s >= total || dist[s] !== UNREACHABLE) continue;
    dist[s] = 0;
    queue[tail++] = s;
  }

  while (head < tail) {
    const cur = queue[head++]!;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const next = dist[cur]! + 1;
    for (let k = 0; k < 4; k++) {
      const nx = cx + NEIGHBOR_DX[k]!;
      const ny = cy + NEIGHBOR_DY[k]!;
      if (!isPassable(tiles, width, height, doors, doorMask, nx, ny)) continue;
      const j = ny * width + nx;
      if (dist[j] !== UNREACHABLE) continue;
      dist[j] = next;
      queue[tail++] = j;
    }
    if (wrapPairs.length > 0) {
      const p = wrapPartner(wrapPairs, cx, cy);
      if (p !== null && isPassable(tiles, width, height, doors, doorMask, p.x, p.y)) {
        const j = p.y * width + p.x;
        if (dist[j] === UNREACHABLE) {
          dist[j] = next;
          queue[tail++] = j;
        }
      }
    }
  }

  return { width, height, doorMask, version, dist };
}

/**
 * Door foresight: returns `doorMask` with every Door that is open but closes within
 * `lookaheadTicks` Ticks removed, so decisions treat it as closed. Because a Door that will
 * be shut before the walker could cross it is conservatively treated as closed, a Door whose
 * nearest side the walker would reach after it closes is covered as well.
 */
export function lookaheadDoorMask(
  doorMask: number,
  doorStates: ReadonlyArray<DoorState>,
  lookaheadTicks: number,
): number {
  let mask = doorMask;
  for (let i = 0; i < doorStates.length; i++) {
    const d = doorStates[i]!;
    if (d.open && d.nextChangeIn <= lookaheadTicks) mask &= ~(1 << d.index);
  }
  return mask >>> 0;
}

/**
 * Layout hash: FNV over exactly the layout bits BFS reads (live tiles, door cells in index
 * order, wrap pairs). Every fresh maze starts at walls.version 0, so version alone cannot
 * tell levels apart; without the layout in the key, entries leak across mazes. Dual
 * accumulators (FNV-1a + FNV-1) for a 64-bit key. Pure integer math, deterministic.
 */
function layoutHash(nav: NavLayout, tiles: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x811c9dc5;
  const mix = (v: number): void => {
    for (let s = 0; s < 4; s++) {
      const byte = (v >>> (s * 8)) & 0xff;
      a ^= byte;
      a = Math.imul(a, 0x01000193);
      b = Math.imul(b, 0x01000193);
      b ^= byte;
    }
  };
  mix(tiles.length);
  for (let i = 0; i < tiles.length; i++) mix(tiles[i]!);
  mix(nav.doors.length);
  for (let i = 0; i < nav.doors.length; i++) {
    const d = nav.doors[i]!;
    mix(i);
    mix(d.cell.x);
    mix(d.cell.y);
  }
  mix(nav.wrapPairs.length);
  for (const [p, q] of nav.wrapPairs) {
    mix(p.x);
    mix(p.y);
    mix(q.x);
    mix(q.y);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

/** Bounded cache of distance fields keyed by (doorMask, walls.version, grid size, layout, sources). */
export class DistanceFieldCache {
  private readonly entries = new Map<string, DistanceField>();
  /** Number of BFS runs (cache misses), exposed for tests and perf checks. */
  computeCount = 0;

  constructor(readonly maxEntries: number = 16) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError('maxEntries must be >= 1');
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  /**
   * Field for `sources` under `doorMask` and the current wall layer. A different
   * `walls.version`, `doorMask` or source set never returns a previously computed field.
   */
  get(nav: NavLayout, walls: WallLayer, doorMask: number, sources: ArrayLike<number>): DistanceField {
    const sorted = Array.from(sources).sort((a, b) => a - b);
    const key = `${walls.version}|${doorMask >>> 0}|${nav.width}x${nav.height}|${layoutHash(nav, walls.tiles)}|${sorted.join(',')}`;
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      // Refresh recency (Map keeps insertion order).
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    this.computeCount++;
    const field = computeDistanceField(nav, walls.tiles, doorMask, walls.version, sorted);
    this.entries.set(key, field);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
    return field;
  }
}

/** Convenience: Cell list to index list. */
export function cellsToIndices(width: number, cells: ReadonlyArray<Cell>): number[] {
  const out: number[] = new Array<number>(cells.length);
  for (let i = 0; i < cells.length; i++) out[i] = cells[i]!.y * width + cells[i]!.x;
  return out;
}

/**
 * Index of the best next Cell from (x, y): the neighbour with the smallest strictly lower
 * distance. Candidates are tested in the fixed order up, right, down, left, then the wrap
 * partner; the first best candidate wins. Returns -1 when the Cell is a source, unreachable,
 * or out of bounds.
 */
export function nextStepIndex(field: DistanceField, nav: NavLayout, x: number, y: number): number {
  const { width, height, dist } = field;
  if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  const here = dist[y * width + x]!;
  if (here <= 0) return -1;
  let best = -1;
  let bestDist = here;
  for (let k = 0; k < 4; k++) {
    const nx = x + NEIGHBOR_DX[k]!;
    const ny = y + NEIGHBOR_DY[k]!;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const j = ny * width + nx;
    const d = dist[j]!;
    if (d !== UNREACHABLE && d < bestDist) {
      bestDist = d;
      best = j;
    }
  }
  if (nav.wrapPairs.length > 0) {
    const p = wrapPartner(nav.wrapPairs, x, y);
    if (p !== null) {
      const j = p.y * width + p.x;
      const d = dist[j]!;
      if (d !== UNREACHABLE && d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
  }
  return best;
}

/**
 * Direction of the best next step from (x, y), or null when there is none. A wrap step is
 * reported as the direction that leaves the grid edge the Cell sits on.
 */
export function nextStepDir(field: DistanceField, nav: NavLayout, x: number, y: number): Dir | null {
  const j = nextStepIndex(field, nav, x, y);
  if (j < 0) return null;
  const { width, height } = field;
  const jx = j % width;
  const jy = (j - jx) / width;
  for (let k = 0; k < 4; k++) {
    if (x + NEIGHBOR_DX[k]! === jx && y + NEIGHBOR_DY[k]! === jy) return NEIGHBOR_DIRS[k]!;
  }
  // Wrap step: leave through the edge the Cell sits on.
  if (x === 0 && jx > 0) return 'left';
  if (x === width - 1 && jx < width - 1) return 'right';
  if (y === 0 && jy > 0) return 'up';
  if (y === height - 1 && jy < height - 1) return 'down';
  return null;
}

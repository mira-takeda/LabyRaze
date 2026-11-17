/**
 * Wisp and Pellet Partition (Requirements 30, 12; design "Wisp and Pellet Partition").
 *
 * Continues the `items` stream from `placeItems(...).rng` (see placement.ts call order).
 * Eligible cells are Floor cells that are not a start, a Key, a special item, a Door, or
 * part of the Cage (the Cage tiles and Door tiles are not Floor, so they drop out).
 *
 *   1. Blocks of side `itemBlock`; per block w_b = clamp(round(wispDensity * |R_b|), 1, |R_b| - 1)
 *      for |R_b| >= 2. A single-cell block is an Ordinary_Pellet at an even row-major block
 *      index and a Spirit_Wisp at an odd one.
 *   2. The wisp cells of a block are the first w_b of a seeded shuffle of R_b.
 *   3. Path-coverage repair over the key paths (start to keys, keys to Cage entrance, start to
 *      Cage entrance, Hunter start to Cage entrance): every sliding window of `coverageWindow`
 *      cells with at least two eligible cells gets both kinds, by flipping one cell of the
 *      majority kind. A flip is only made where it keeps the block minimum (the flipped
 *      kind keeps at least one cell in its block), so step 1's guarantee survives. When the
 *      preferred flip would turn a mixed window on any key path into a one-kind window, the
 *      best-scoring candidate that breaks no window is taken instead; without one, the
 *      preferred flip is kept. This stops two paths that share a cell from flipping it back
 *      and forth until the pass limit (seed 15, level 5).
 *
 * Result: `wisps` and `ordinary` are disjoint and their union is the eligible set. Output
 * arrays are in row-major order. Pure and deterministic.
 */

import type { GameConfig } from '../config';
import { NEIGHBOR_DX, NEIGHBOR_DY, isPassable } from '../grid';
import { shuffle } from '../prng';
import type { PrngState } from '../prng';
import { Tile } from '../types';
import type { Cell, DoorSpec } from '../types';

export type PartitionConfig = Pick<GameConfig, 'wispDensity' | 'itemBlock' | 'coverageWindow'>;

export interface PartitionInput {
  width: number;
  height: number;
  /** Tiles that include `Tile.Door` cells. */
  tiles: Uint8Array;
  doors: readonly DoorSpec[];
  cage: { entrance: Cell };
  playerStart: Cell;
  hunterStart: Cell;
  keys: readonly Cell[];
  /** Power, Speed, Bomb and Ghost_Hunt cells. */
  special: readonly Cell[];
}

export interface PartitionResult {
  wisps: Cell[];
  ordinary: Cell[];
  /** Cells that were swapped by the path-coverage repair (diagnostics). */
  repairs: number;
  /** `items` stream state after the shuffles. */
  rng: PrngState;
}

const WISP = 1;
const PELLET = 2;
const MAX_REPAIR_PASSES = 12;

/** Eligible mask: Floor cells that are not occupied by a start, Key or special item. */
export function eligibleMask(input: PartitionInput): Uint8Array {
  const { width, tiles } = input;
  const mask = new Uint8Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === Tile.Floor) mask[i] = 1;
  const clear = (c: Cell): void => {
    mask[c.y * width + c.x] = 0;
  };
  clear(input.playerStart);
  clear(input.hunterStart);
  clear(input.cage.entrance);
  for (const c of input.keys) clear(c);
  for (const c of input.special) clear(c);
  return mask;
}

/** Shortest path (cell indices, inclusive) with every Door open, or [] when unreachable. */
function shortestPath(input: PartitionInput, from: number, to: number): number[] {
  const { width, height, tiles, doors } = input;
  const total = width * height;
  const doorMask = doors.length >= 31 ? -1 : (1 << doors.length) - 1;
  const parent = new Int32Array(total).fill(-2);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  parent[from] = -1;
  queue[tail++] = from;
  while (head < tail && parent[to] === -2) {
    const cur = queue[head++]!;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (let k = 0; k < 4; k++) {
      const nx = cx + NEIGHBOR_DX[k]!;
      const ny = cy + NEIGHBOR_DY[k]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (parent[j] !== -2) continue;
      if (j !== to && !isPassable(tiles, width, height, doors, doorMask, nx, ny)) continue;
      parent[j] = cur;
      queue[tail++] = j;
    }
  }
  if (parent[to] === -2) return [];
  const path: number[] = [];
  for (let c = to; c !== -1; c = parent[c]!) path.push(c);
  return path.reverse();
}

/** The key paths of the design, as cell-index lists. */
function keyPaths(input: PartitionInput): number[][] {
  const w = input.width;
  const idx = (c: Cell): number => c.y * w + c.x;
  const entrance = idx(input.cage.entrance);
  const pairs: Array<[number, number]> = [];
  for (const k of input.keys) {
    pairs.push([idx(input.playerStart), idx(k)]);
    pairs.push([idx(k), entrance]);
  }
  pairs.push([idx(input.playerStart), entrance]);
  pairs.push([idx(input.hunterStart), entrance]);
  const out: number[][] = [];
  for (const [a, b] of pairs) {
    const p = shortestPath(input, a, b);
    if (p.length > 0) out.push(p);
  }
  return out;
}

export function partitionItems(
  input: PartitionInput,
  config: PartitionConfig,
  rngIn: PrngState,
): PartitionResult {
  const { width, height } = input;
  const side = Math.max(1, Math.floor(config.itemBlock));
  const blocksX = Math.ceil(width / side);
  const blocksY = Math.ceil(height / side);
  const eligible = eligibleMask(input);
  const kind = new Uint8Array(width * height);
  const blockOf = new Int32Array(width * height);
  const wispCount = new Int32Array(blocksX * blocksY);
  const pelletCount = new Int32Array(blocksX * blocksY);
  let rng = rngIn;

  // Group eligible cells by block (row-major inside each block).
  const members: number[][] = [];
  for (let b = 0; b < blocksX * blocksY; b++) members.push([]);
  for (let i = 0; i < kind.length; i++) {
    const b = Math.floor(i / width / side) * blocksX + Math.floor((i % width) / side);
    blockOf[i] = b;
    if (eligible[i] === 1) members[b]!.push(i);
  }

  for (let b = 0; b < members.length; b++) {
    const cells = members[b]!;
    const n = cells.length;
    if (n === 0) continue;
    if (n === 1) {
      const k = b % 2 === 0 ? PELLET : WISP;
      kind[cells[0]!] = k;
      if (k === WISP) wispCount[b]!++;
      else pelletCount[b]!++;
      continue;
    }
    const wb = Math.min(n - 1, Math.max(1, Math.round(config.wispDensity * n)));
    let shuffled: number[];
    [shuffled, rng] = shuffle(rng, cells);
    for (let j = 0; j < n; j++) kind[shuffled[j]!] = j < wb ? WISP : PELLET;
    wispCount[b] = wb;
    pelletCount[b] = n - wb;
  }

  // Path-coverage repair.
  let repairs = 0;
  const win = Math.max(2, Math.floor(config.coverageWindow));
  const paths = keyPaths(input);
  const flip = (i: number): void => {
    const b = blockOf[i]!;
    if (kind[i] === WISP) {
      kind[i] = PELLET;
      wispCount[b]!--;
      pelletCount[b]!++;
    } else {
      kind[i] = WISP;
      pelletCount[b]!--;
      wispCount[b]!++;
    }
    repairs++;
  };
  // Every (path, position) at which a cell lies on a key path, for the break check below.
  const occurrences = new Map<number, Array<[number, number]>>();
  paths.forEach((path, pi) => {
    path.forEach((c, j) => {
      const list = occurrences.get(c);
      if (list) list.push([pi, j]);
      else occurrences.set(c, [[pi, j]]);
    });
  });
  /** Number of windows (on every key path) that contain `c` and become one-kind if `c` flips. */
  const breaks = (c: number): number => {
    const mine = kind[c]!;
    let n = 0;
    for (const [pi, j] of occurrences.get(c) ?? []) {
      const path = paths[pi]!;
      const len = path.length;
      const span = Math.min(win, len);
      for (let t = Math.max(0, j - span + 1); t <= j && t + span <= len; t++) {
        let same = 0;
        let other = 0;
        for (let u = t; u < t + span; u++) {
          const k = kind[path[u]!];
          if (k === mine) same++;
          else if (k === WISP || k === PELLET) other++;
        }
        if (same === 1 && other >= 1) n++;
      }
    }
    return n;
  };
  /** True when flipping cell `i` keeps its block with at least one cell of its current kind. */
  const flippable = (i: number): boolean =>
    kind[i] === WISP ? wispCount[blockOf[i]!]! >= 2 : pelletCount[blockOf[i]!]! >= 2;

  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    let changed = false;
    for (const path of paths) {
      const len = path.length;
      const span = Math.min(win, len);
      for (let s = 0; s + span <= len; s++) {
        let w = 0;
        let p = 0;
        for (let j = s; j < s + span; j++) {
          const k = kind[path[j]!];
          if (k === WISP) w++;
          else if (k === PELLET) p++;
        }
        if (w + p < 2 || (w > 0 && p > 0)) continue;
        const majority = w > 0 ? WISP : PELLET;
        // Prefer a flip that leaves every other window on this path with the majority kind.
        let best = -1;
        let bestScore = -1;
        for (let j = s; j < s + span; j++) {
          const c = path[j]!;
          if (kind[c] !== majority || !flippable(c)) continue;
          let score = 0;
          for (let t = Math.max(0, j - span + 1); t <= j && t + span <= len; t++) {
            let same = 0;
            for (let u = t; u < t + span; u++) if (kind[path[u]!] === majority) same++;
            if (same >= 2) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best >= 0 && breaks(best) > 0) {
          // Same candidates and scoring, restricted to flips that break no window.
          let alt = -1;
          let altScore = -1;
          for (let j = s; j < s + span; j++) {
            const c = path[j]!;
            if (kind[c] !== majority || !flippable(c) || breaks(c) > 0) continue;
            let score = 0;
            for (let t = Math.max(0, j - span + 1); t <= j && t + span <= len; t++) {
              let same = 0;
              for (let u = t; u < t + span; u++) if (kind[path[u]!] === majority) same++;
              if (same >= 2) score++;
            }
            if (score > altScore) {
              altScore = score;
              alt = c;
            }
          }
          if (alt >= 0) best = alt;
        }
        if (best >= 0) {
          flip(best);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const wisps: Cell[] = [];
  const ordinary: Cell[] = [];
  for (let i = 0; i < kind.length; i++) {
    const cell = { x: i % width, y: Math.floor(i / width) };
    if (kind[i] === WISP) wisps.push(cell);
    else if (kind[i] === PELLET) ordinary.push(cell);
  }
  return { wisps, ordinary, repairs, rng };
}

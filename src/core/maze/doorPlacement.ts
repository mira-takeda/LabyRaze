/**
 * Door placement (Requirements 4.2, 4.7, 5.6, 5.7, 5.9).
 *
 * Steps:
 *  1. Iterative Tarjan low-link pass (explicit stack, no recursion) over the passable
 *     graph (Floor, CageInterior, CageGate) finds articulation points.
 *  2. Candidates are Floor cells that are not articulation points, have exactly two
 *     open neighbours (a real corridor passage) and lie outside the exclusion zone
 *     (graph distance <= `DOOR_EXCLUSION_RADIUS` from the Cage entrance or from any
 *     caller supplied cell such as the Start_Cells).
 *  3. Candidates are shuffled with the `doors` stream and picked greedily. A pick is
 *     accepted only if it keeps `spacing` graph distance to earlier picks and the
 *     passable graph stays connected with any single Door closed and with any pair of
 *     Doors closed. If `doorCount` Doors cannot be placed, the spacing is relaxed one
 *     step at a time down to 1 (`spacingUsed` reports the value that worked).
 *  4. Each Door draws `openRatio` (>= doorMinOpenRatio), `period` and `phaseOffset`
 *     from the same stream. The phase is chosen so the Door starts open and its first
 *     scheduled change (a close) lies strictly beyond the warn window at tick 0.
 *
 * Door tiles become `Tile.Door`, which is not `Tile.Wall`, so Bombs cannot destroy them.
 * Pure and deterministic: no recursion, no clock, no unseeded randomness.
 */

import type { GameConfig } from '../config';
import { MIN_DOOR_WARN_TICKS, openDuration, scheduleAt } from '../doors';
import { NEIGHBOR_DX, NEIGHBOR_DY } from '../grid';
import { deriveSeed, nextFloat, nextInt, shuffle } from '../prng';
import type { Draw, PrngState } from '../prng';
import { Tile } from '../types';
import type { Cell, DoorSpec } from '../types';

/** Preferred minimum graph distance between two Doors. */
export const DOOR_MIN_SPACING = 6;
/** Doors keep more than this graph distance from the Cage entrance and exclusion cells. */
export const DOOR_EXCLUSION_RADIUS = 2;

export type DoorPlacementConfig = Pick<
  GameConfig,
  'doorCount' | 'doorMinOpenRatio' | 'doorWarnTicks' | 'doorPeriod'
>;

export interface DoorPlacementInput {
  width: number;
  height: number;
  /** Initial tiles (Wall | WallHard | Floor | CageInterior | CageGate). Not mutated. */
  tiles: Uint8Array;
  cage: { entrance: Cell };
}

export interface DoorPlacementOptions {
  /** Extra cells to keep clear (for example the Start_Cells, known after task 5.3). */
  exclude?: readonly Cell[];
  /** Preferred spacing; defaults to `DOOR_MIN_SPACING`. */
  spacing?: number;
  /** Exclusion radius; defaults to `DOOR_EXCLUSION_RADIUS`. */
  exclusionRadius?: number;
}

export interface DoorPlacementResult {
  /** Copy of the input tiles with `Tile.Door` at every Door cell. */
  tiles: Uint8Array;
  doors: DoorSpec[];
  /** True when `doorCount` Doors were placed. */
  complete: boolean;
  /** Spacing that was actually satisfied (<= the preferred spacing). */
  spacingUsed: number;
  /** Remaining `doors` stream state. */
  rng: PrngState;
}

function isPassableTile(t: number): boolean {
  return t === Tile.Floor || t === Tile.CageInterior || t === Tile.CageGate;
}

/** Passable-graph adjacency (fixed neighbour order). Returns CSR-like arrays. */
function buildAdjacency(width: number, height: number, tiles: Uint8Array): number[][] {
  const adj: number[][] = new Array<number[]>(width * height);
  for (let i = 0; i < adj.length; i++) {
    const list: number[] = [];
    if (isPassableTile(tiles[i]!)) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (let k = 0; k < 4; k++) {
        const nx = x + NEIGHBOR_DX[k]!;
        const ny = y + NEIGHBOR_DY[k]!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (isPassableTile(tiles[j]!)) list.push(j);
      }
    }
    adj[i] = list;
  }
  return adj;
}

/**
 * Articulation points of the passable graph with an iterative Tarjan low-link pass.
 * Returns a flag array indexed by cell.
 */
export function findArticulationPoints(width: number, height: number, tiles: Uint8Array): Uint8Array {
  const adj = buildAdjacency(width, height, tiles);
  return articulationFromAdjacency(adj, tiles);
}

function articulationFromAdjacency(adj: number[][], tiles: Uint8Array): Uint8Array {
  const n = adj.length;
  const isArt = new Uint8Array(n);
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const edgePos = new Int32Array(n);
  let timer = 0;

  for (let root = 0; root < n; root++) {
    if (!isPassableTile(tiles[root]!) || disc[root] !== -1) continue;
    let rootChildren = 0;
    const stack: number[] = [root];
    disc[root] = low[root] = timer++;
    while (stack.length > 0) {
      const u = stack[stack.length - 1]!;
      const nbrs = adj[u]!;
      if (edgePos[u]! < nbrs.length) {
        const v = nbrs[edgePos[u]!++]!;
        if (disc[v] === -1) {
          parent[v] = u;
          disc[v] = low[v] = timer++;
          if (u === root) rootChildren++;
          stack.push(v);
        } else if (v !== parent[u]) {
          low[u] = Math.min(low[u]!, disc[v]!);
        }
      } else {
        stack.pop();
        const p = parent[u]!;
        if (p !== -1) {
          low[p] = Math.min(low[p]!, low[u]!);
          if (p !== root && low[u]! >= disc[p]!) isArt[p] = 1;
        }
      }
    }
    if (rootChildren > 1) isArt[root] = 1;
  }
  return isArt;
}

/** Multi-source BFS distances over the adjacency (-1 = unreachable). */
function bfs(adj: number[][], sources: readonly number[]): Int32Array {
  const dist = new Int32Array(adj.length).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    if (dist[s] === -1) {
      dist[s] = 0;
      queue.push(s);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    for (const nb of adj[c]!) {
      if (dist[nb] !== -1) continue;
      dist[nb] = dist[c]! + 1;
      queue.push(nb);
    }
  }
  return dist;
}

/** True when every passable cell outside `closed` is reachable from every other one. */
function connectedWithout(adj: number[][], passableCount: number, closed: readonly number[]): boolean {
  const seen = new Uint8Array(adj.length);
  for (const c of closed) seen[c] = 1;
  let start = -1;
  for (let i = 0; i < adj.length; i++) {
    if (adj[i]!.length > 0 && !seen[i]) {
      start = i;
      break;
    }
  }
  const remaining = passableCount - closed.length;
  if (start === -1) return remaining <= 0;
  const queue: number[] = [start];
  seen[start] = 1;
  let count = 1;
  for (let head = 0; head < queue.length; head++) {
    for (const nb of adj[queue[head]!]!) {
      if (seen[nb]) continue;
      seen[nb] = 1;
      count++;
      queue.push(nb);
    }
  }
  return count === remaining;
}

/**
 * True when the passable graph of `tiles` stays connected with any single Door
 * closed and with any pair of Doors closed (Doors are given as cell indices; all
 * other Doors count as open).
 */
export function doorSetKeepsConnectivity(
  width: number,
  height: number,
  tiles: Uint8Array,
  doorCells: readonly number[],
): boolean {
  // Door tiles count as passable when open, so rebuild the graph with them as Floor.
  const open = tiles.slice();
  for (const c of doorCells) open[c] = Tile.Floor;
  for (let i = 0; i < open.length; i++) if (open[i] === Tile.Door) open[i] = Tile.Floor;
  const adj = buildAdjacency(width, height, open);
  let passable = 0;
  for (let i = 0; i < adj.length; i++) if (isPassableTile(open[i]!)) passable++;
  if (!connectedWithout(adj, passable, [])) return false;
  for (let a = 0; a < doorCells.length; a++) {
    if (!connectedWithout(adj, passable, [doorCells[a]!])) return false;
    for (let b = a + 1; b < doorCells.length; b++) {
      if (!connectedWithout(adj, passable, [doorCells[a]!, doorCells[b]!])) return false;
    }
  }
  return true;
}

/** Draws a phase offset so the Door starts open and its first change is beyond the warn window. */
function drawPhase(
  rng: PrngState,
  spec: Omit<DoorSpec, 'phaseOffset' | 'cell'>,
  warn: number,
): Draw<number> {
  const dur = openDuration(spec);
  // Open segment: phase p in [0, dur - warn - 1] gives nextChangeIn = dur - p > warn.
  if (dur - warn - 1 >= 0 && dur < spec.period) return nextInt(rng, 0, dur - warn - 1);
  // Degenerate schedules: scan for any phase whose first change is beyond the warn window.
  const probe: DoorSpec = { cell: { x: 0, y: 0 }, phaseOffset: 0, ...spec };
  const valid: number[] = [];
  for (let p = 0; p < spec.period; p++) {
    if (scheduleAt({ ...probe, phaseOffset: p }, 0).nextChangeIn > warn) valid.push(p);
  }
  if (valid.length === 0) return [0, rng];
  const [i, next] = nextInt(rng, 0, valid.length - 1);
  return [valid[i]!, next];
}

/** Places Doors on a carved maze. See the file header for the guarantees. */
export function placeDoors(
  carved: DoorPlacementInput,
  runSeed: number,
  levelNumber: number,
  retryIndex: number,
  config: DoorPlacementConfig,
  options: DoorPlacementOptions = {},
): DoorPlacementResult {
  const { width, height, tiles } = carved;
  const preferred = Math.max(1, Math.floor(options.spacing ?? DOOR_MIN_SPACING));
  const radius = options.exclusionRadius ?? DOOR_EXCLUSION_RADIUS;
  let rng: PrngState = deriveSeed(runSeed, levelNumber, 'doors', retryIndex);

  const adj = buildAdjacency(width, height, tiles);
  const art = articulationFromAdjacency(adj, tiles);

  // Exclusion zone: graph distance <= radius from the Cage entrance and extra cells.
  const sources = [carved.cage.entrance, ...(options.exclude ?? [])]
    .filter((c) => c.x >= 0 && c.y >= 0 && c.x < width && c.y < height)
    .map((c) => c.y * width + c.x)
    .filter((i) => isPassableTile(tiles[i]!));
  const exclDist = bfs(adj, sources);

  const candidates: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== Tile.Floor || art[i] || adj[i]!.length !== 2) continue;
    const d = exclDist[i]!;
    if (d !== -1 && d <= radius) continue;
    candidates.push(i);
  }
  const [order, afterShuffle] = shuffle(rng, candidates);
  rng = afterShuffle;

  const want = Math.max(0, Math.floor(config.doorCount));
  let picked: number[] = [];
  let spacingUsed = preferred;
  const distCache = new Map<number, Int32Array>();
  const distFrom = (c: number): Int32Array => {
    let d = distCache.get(c);
    if (!d) {
      d = bfs(adj, [c]);
      distCache.set(c, d);
    }
    return d;
  };

  for (let spacing = preferred; spacing >= 1; spacing--) {
    const set: number[] = [];
    for (const cand of order) {
      if (set.length >= want) break;
      const dc = distFrom(cand);
      if (set.some((p) => dc[p]! < spacing)) continue;
      const trial = [...set, cand];
      if (!doorSetKeepsConnectivity(width, height, tiles, trial)) continue;
      set.push(cand);
    }
    picked = set;
    spacingUsed = spacing;
    if (set.length >= want) break;
  }

  // Draw schedule parameters in placement order.
  const warn = Math.max(MIN_DOOR_WARN_TICKS, Math.floor(config.doorWarnTicks));
  const doors: DoorSpec[] = [];
  const outTiles = tiles.slice();
  for (const c of picked) {
    let f: number;
    [f, rng] = nextFloat(rng);
    const maxRatio = Math.max(config.doorMinOpenRatio, 0.9);
    const openRatio = Math.min(1, config.doorMinOpenRatio + f * (maxRatio - config.doorMinOpenRatio));
    let period: number;
    [period, rng] = nextInt(rng, config.doorPeriod.min, config.doorPeriod.max);
    let phaseOffset: number;
    [phaseOffset, rng] = drawPhase(rng, { period, openRatio }, warn);
    doors.push({ cell: { x: c % width, y: Math.floor(c / width) }, phaseOffset, period, openRatio });
    outTiles[c] = Tile.Door;
  }

  return { tiles: outTiles, doors, complete: doors.length >= want, spacingUsed, rng };
}

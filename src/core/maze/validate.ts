/**
 * Maze validity checks (Requirements 4.4 to 4.8, 28.7, 28.10, 30.1; design "Validity Checks").
 *
 * Every check is a pure function `(maze, cfg, opts?) => { ok, reason }` over a finished
 * `Maze`. `reason` is an empty string when `ok` and a short human readable cause otherwise.
 *
 *   1  connectivity          one passable component with every Door open
 *   2  reachability          starts, Keys, Cage entrance and every item are on Floor and mutually reachable
 *   3  cage                  Cage inside the central region with exactly one gate
 *   4  dimensions            Maze size and Door count equal the config, Door tiles match `doors`
 *   5  door closure          every objective stays reachable with any one or any two Doors closed
 *   6  counts                3 Keys, power, speed, Bombs, Ghost_Hunt and at least `minOrdinary` pellets
 *   7  fairness              key, power, speed, Bomb and Ghost_Hunt distance deltas
 *   7a disjointness/coverage items are pairwise disjoint; block and path coverage of the partition hold
 *   7b wall flags            boundary and Cage perimeter are WallHard; Door cells are not Wall
 *
 *   8  pre-filter            cheap analytic race ratio inside the evidence-derived `prefilterBand`
 *                            (task 19.7); skipped for the fixed fallback template
 * Pure and deterministic: no recursion, no clock, no randomness.
 */

import type { GameConfig } from '../config';
import { NEIGHBOR_DX, NEIGHBOR_DY } from '../grid';
import { eligibleMask } from './partition';
import { KEY_COUNT, inCentralRegion } from './placement';
import { Tile } from '../types';
import type { Cell, Maze } from '../types';

export interface CheckResult {
  ok: boolean;
  reason: string;
}

export interface NamedCheckResult extends CheckResult {
  /** Design check id: '1' .. '7', '7a', '7b'. */
  id: CheckId;
}

export type CheckId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '7a' | '7b' | '8';

export interface ValidationReport {
  ok: boolean;
  /** Reason of the first failing check, '' when valid. */
  reason: string;
  /** Id of the first failing check, null when valid. */
  failed: CheckId | null;
  /** Results of every check, in design order. */
  results: NamedCheckResult[];
}

export interface ValidateOptions {
  /** Minimum Ordinary_Pellets (check 6). Default {@link MIN_ORDINARY}. */
  minOrdinary?: number;
  /** Extra Cells added to every fairness delta (check 7), for mazes built with relaxation. */
  fairnessSlack?: number;
  /** Run check 8 (analytic race-ratio pre-filter). Default true; the fixed fallback skips it. */
  prefilter?: boolean;
}

/** Default minimum number of Ordinary_Pellets. */
export const MIN_ORDINARY = 10;

export type ValidateConfig = Pick<
  GameConfig,
  | 'mazeSize'
  | 'doorCount'
  | 'powerPelletsPerLevel'
  | 'speedPelletsPerLevel'
  | 'bombsPerLevel'
  | 'ghostHuntPerLevel'
  | 'keyFairnessDelta'
  | 'keyMinDist'
  | 'keyMaxDist'
  | 'powerMinStartDist'
  | 'powerFairnessDelta'
  | 'speedFairnessDelta'
  | 'bombMinStartDist'
  | 'bombFairnessDelta'
  | 'ghostHuntMinCageDist'
  | 'itemBlock'
  | 'coverageWindow'
> &
  Partial<Pick<GameConfig, 'prefilterBand'>>;

const OK: CheckResult = { ok: true, reason: '' };
const fail = (reason: string): CheckResult => ({ ok: false, reason });

const cellStr = (c: Cell): string => `(${c.x},${c.y})`;
const idxOf = (m: Pick<Maze, 'width'>, c: Cell): number => c.y * m.width + c.x;
const inGrid = (m: Pick<Maze, 'width' | 'height'>, c: Cell): boolean =>
  Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < m.width && c.y < m.height;

function isPassableTile(t: number): boolean {
  return t === Tile.Floor || t === Tile.CageInterior || t === Tile.CageGate || t === Tile.Door;
}

/**
 * BFS distances over passable tiles. Door tiles are open except the Doors whose indices
 * (into `maze.doors`) are in `closed`. -1 = unreachable. Sources on impassable tiles are skipped.
 */
export function bfsDistances(
  maze: Pick<Maze, 'width' | 'height' | 'tiles' | 'doors'>,
  sources: readonly Cell[],
  closed: readonly number[] = [],
): Int32Array {
  const { width, height, tiles } = maze;
  const dist = new Int32Array(width * height).fill(-1);
  const blocked = new Uint8Array(width * height);
  for (const di of closed) {
    const d = maze.doors[di];
    if (d) blocked[d.cell.y * width + d.cell.x] = 1;
  }
  const queue: number[] = [];
  for (const s of sources) {
    if (s.x < 0 || s.y < 0 || s.x >= width || s.y >= height) continue;
    const i = s.y * width + s.x;
    if (!isPassableTile(tiles[i]!) || blocked[i] || dist[i] !== -1) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]!;
    const cx = c % width;
    const cy = (c - cx) / width;
    for (let k = 0; k < 4; k++) {
      const nx = cx + NEIGHBOR_DX[k]!;
      const ny = cy + NEIGHBOR_DY[k]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (dist[j] !== -1 || blocked[j] || !isPassableTile(tiles[j]!)) continue;
      dist[j] = dist[c]! + 1;
      queue.push(j);
    }
  }
  return dist;
}

/** Every Cell the Player or Squareman must be able to get to. */
function objectives(maze: Maze): Array<{ label: string; cell: Cell }> {
  const out: Array<{ label: string; cell: Cell }> = [
    { label: 'player start', cell: maze.playerStart },
    { label: 'hunter start', cell: maze.hunterStart },
    { label: 'cage entrance', cell: maze.cage.entrance },
  ];
  const add = (label: string, cells: readonly Cell[]): void => {
    for (const c of cells) out.push({ label, cell: c });
  };
  add('key', maze.keys);
  add('power pellet', maze.power);
  add('speed pellet', maze.speed);
  add('bomb', maze.bombs);
  add('ghost hunt item', maze.ghostHunt);
  add('ordinary pellet', maze.ordinary);
  add('spirit wisp', maze.wisps);
  return out;
}

/** Check 1: the passable graph (all Doors open) is one connected component. */
export function checkConnectivity(maze: Maze): CheckResult {
  const { tiles } = maze;
  if (!inGrid(maze, maze.playerStart)) return fail(`player start ${cellStr(maze.playerStart)} is outside the maze`);
  const dist = bfsDistances(maze, [maze.playerStart]);
  let total = 0;
  let first: number = -1;
  let reached = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (!isPassableTile(tiles[i]!)) continue;
    total++;
    if (dist[i]! >= 0) reached++;
    else if (first < 0) first = i;
  }
  if (dist[idxOf(maze, maze.playerStart)] !== 0) {
    return fail(`player start ${cellStr(maze.playerStart)} is not on a passable tile`);
  }
  if (reached !== total) {
    const c = { x: first % maze.width, y: Math.floor(first / maze.width) };
    return fail(`disconnected: ${total - reached} passable cells unreachable from the player start, first at ${cellStr(c)}`);
  }
  return OK;
}

/** Check 2: starts, Keys, Cage entrance and every item are on Floor and mutually reachable. */
export function checkReachability(maze: Maze): CheckResult {
  const dist = bfsDistances(maze, [maze.playerStart]);
  const floorOnly = new Set(['key', 'power pellet', 'speed pellet', 'bomb', 'ghost hunt item', 'ordinary pellet', 'spirit wisp']);
  for (const o of objectives(maze)) {
    if (!inGrid(maze, o.cell)) return fail(`${o.label} ${cellStr(o.cell)} is outside the maze`);
    const i = idxOf(maze, o.cell);
    const tile = maze.tiles[i]!;
    const mustBeFloor = floorOnly.has(o.label) || o.label.endsWith('start');
    if (mustBeFloor && tile !== Tile.Floor) {
      return fail(`${o.label} ${cellStr(o.cell)} is not on a Floor tile (tile ${tile})`);
    }
    if (dist[i]! < 0) return fail(`${o.label} ${cellStr(o.cell)} is unreachable from the player start`);
  }
  return OK;
}

/** Check 3: the whole Cage lies in the central region and has exactly one gate. */
export function checkCage(maze: Maze): CheckResult {
  const { interior, entrance } = maze.cage;
  if (interior.length === 0) return fail('cage has no interior');
  for (const c of interior) {
    if (!inGrid(maze, c)) return fail(`cage interior cell ${cellStr(c)} is outside the maze`);
    if (maze.tiles[idxOf(maze, c)] !== Tile.CageInterior) return fail(`cage interior cell ${cellStr(c)} is not a CageInterior tile`);
    if (!inCentralRegion(maze.width, maze.height, c)) return fail(`cage interior cell ${cellStr(c)} is outside the central region`);
  }
  if (!inGrid(maze, entrance) || !inCentralRegion(maze.width, maze.height, entrance)) {
    return fail(`cage entrance ${cellStr(entrance)} is outside the central region`);
  }
  let gates = 0;
  for (let i = 0; i < maze.tiles.length; i++) if (maze.tiles[i] === Tile.CageGate) gates++;
  if (gates !== 1) return fail(`cage must have exactly one gate, found ${gates}`);
  if (maze.tiles[idxOf(maze, entrance)] !== Tile.CageGate) return fail(`cage entrance ${cellStr(entrance)} is not the gate tile`);
  return OK;
}

/** Check 4: dimensions and Door count equal the config; Door tiles match `doors`. */
export function checkDimensions(maze: Maze, cfg: Pick<ValidateConfig, 'mazeSize' | 'doorCount'>): CheckResult {
  if (maze.width !== cfg.mazeSize.w || maze.height !== cfg.mazeSize.h) {
    return fail(`dimensions ${maze.width}x${maze.height} differ from config ${cfg.mazeSize.w}x${cfg.mazeSize.h}`);
  }
  if (maze.tiles.length !== maze.width * maze.height) {
    return fail(`tile array length ${maze.tiles.length} does not match ${maze.width}x${maze.height}`);
  }
  if (maze.doors.length !== cfg.doorCount) {
    return fail(`door count ${maze.doors.length} differs from config ${cfg.doorCount}`);
  }
  let doorTiles = 0;
  for (let i = 0; i < maze.tiles.length; i++) if (maze.tiles[i] === Tile.Door) doorTiles++;
  if (doorTiles !== maze.doors.length) {
    return fail(`${doorTiles} Door tiles but ${maze.doors.length} Door specs`);
  }
  for (const d of maze.doors) {
    if (!inGrid(maze, d.cell) || maze.tiles[idxOf(maze, d.cell)] !== Tile.Door) {
      return fail(`door ${cellStr(d.cell)} is not on a Door tile`);
    }
  }
  return OK;
}

/** Check 5: every objective stays reachable from the Player start with any one or two Doors closed. */
export function checkDoorClosure(maze: Maze): CheckResult {
  const n = maze.doors.length;
  const objs = objectives(maze);
  const sets: number[][] = [];
  for (let a = 0; a < n; a++) {
    sets.push([a]);
    for (let b = a + 1; b < n; b++) sets.push([a, b]);
  }
  for (const closed of sets) {
    const dist = bfsDistances(maze, [maze.playerStart], closed);
    for (const o of objs) {
      if (!inGrid(maze, o.cell)) continue; // reported by check 2
      if (dist[idxOf(maze, o.cell)]! < 0) {
        const names = closed.map((i) => `#${i}`).join(' and ');
        return fail(
          `closing door${closed.length > 1 ? 's' : ''} ${names} makes ${o.label} ${cellStr(o.cell)} unreachable`,
        );
      }
    }
  }
  return OK;
}

/** Check 6: item counts. */
export function checkCounts(maze: Maze, cfg: ValidateConfig, opts: ValidateOptions = {}): CheckResult {
  const minOrdinary = opts.minOrdinary ?? MIN_ORDINARY;
  const rows: Array<[string, number, number]> = [
    ['keys', maze.keys.length, KEY_COUNT],
    ['power pellets', maze.power.length, cfg.powerPelletsPerLevel],
    ['speed pellets', maze.speed.length, cfg.speedPelletsPerLevel],
    ['bombs', maze.bombs.length, cfg.bombsPerLevel],
    ['ghost hunt items', maze.ghostHunt.length, cfg.ghostHuntPerLevel],
  ];
  for (const [name, have, want] of rows) {
    if (have !== want) return fail(`expected ${want} ${name}, found ${have}`);
  }
  if (maze.ordinary.length < minOrdinary) {
    return fail(`only ${maze.ordinary.length} ordinary pellets, need at least ${minOrdinary}`);
  }
  return OK;
}

/** Check 7: fairness deltas (distances with every Door open). */
export function checkFairness(maze: Maze, cfg: ValidateConfig, opts: ValidateOptions = {}): CheckResult {
  const slack = opts.fairnessSlack ?? 0;
  const dp = bfsDistances(maze, [maze.playerStart]);
  const dh = bfsDistances(maze, [maze.hunterStart]);
  const dc = bfsDistances(maze, [maze.cage.entrance]);
  const at = (d: Int32Array, c: Cell): number => (inGrid(maze, c) ? d[idxOf(maze, c)]! : -1);

  for (const c of maze.keys) {
    const p = at(dp, c);
    const h = at(dh, c);
    const e = at(dc, c);
    if (p < 0 || h < 0 || e < 0) return fail(`key ${cellStr(c)} is unreachable`);
    if (p - h > cfg.keyFairnessDelta + slack) {
      return fail(`key ${cellStr(c)} is ${p - h} cells nearer the hunter (player ${p}, hunter ${h}), limit ${cfg.keyFairnessDelta + slack}`);
    }
    if (e < cfg.keyMinDist - slack || e > cfg.keyMaxDist + slack) {
      return fail(`key ${cellStr(c)} is ${e} cells from the cage entrance, allowed ${cfg.keyMinDist - slack}..${cfg.keyMaxDist + slack}`);
    }
  }
  for (const c of maze.power) {
    const p = at(dp, c);
    const h = at(dh, c);
    if (p < 0 || h < 0) return fail(`power pellet ${cellStr(c)} is unreachable`);
    if (p <= cfg.powerMinStartDist || h <= cfg.powerMinStartDist) {
      return fail(`power pellet ${cellStr(c)} is too close to a start (player ${p}, hunter ${h}), min ${cfg.powerMinStartDist}`);
    }
    if (Math.abs(p - h) > cfg.powerFairnessDelta + slack) {
      return fail(`power pellet ${cellStr(c)} distance gap ${Math.abs(p - h)} exceeds ${cfg.powerFairnessDelta + slack}`);
    }
  }
  for (const c of maze.speed) {
    const p = at(dp, c);
    const h = at(dh, c);
    if (p < 0 || h < 0) return fail(`speed pellet ${cellStr(c)} is unreachable`);
    if (Math.abs(p - h) > cfg.speedFairnessDelta + slack) {
      return fail(`speed pellet ${cellStr(c)} distance gap ${Math.abs(p - h)} exceeds ${cfg.speedFairnessDelta + slack}`);
    }
  }
  for (const c of maze.bombs) {
    const p = at(dp, c);
    const h = at(dh, c);
    if (p < 0 || h < 0) return fail(`bomb ${cellStr(c)} is unreachable`);
    if (p < cfg.bombMinStartDist) {
      return fail(`bomb ${cellStr(c)} is ${p} cells from the player start, min ${cfg.bombMinStartDist}`);
    }
    if (h - p < -(cfg.bombFairnessDelta + slack)) {
      return fail(`bomb ${cellStr(c)} favours the hunter by ${p - h}, limit ${cfg.bombFairnessDelta + slack}`);
    }
  }
  for (const c of maze.ghostHunt) {
    const p = at(dp, c);
    const h = at(dh, c);
    const e = at(dc, c);
    if (p < 0 || h < 0 || e < 0) return fail(`ghost hunt item ${cellStr(c)} is unreachable`);
    if (e < cfg.ghostHuntMinCageDist) {
      return fail(`ghost hunt item ${cellStr(c)} is ${e} cells from the cage entrance, min ${cfg.ghostHuntMinCageDist}`);
    }
    if (h - p < -(cfg.bombFairnessDelta + slack)) {
      return fail(`ghost hunt item ${cellStr(c)} favours the hunter by ${p - h}, limit ${cfg.bombFairnessDelta + slack}`);
    }
  }
  return OK;
}

/** Shortest path between two cell indices with every Door open (same BFS order as partition.ts). */
function shortestPath(maze: Maze, from: number, to: number): number[] {
  const { width, height, tiles } = maze;
  const total = width * height;
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
      if (j !== to && !isPassableTile(tiles[j]!)) continue;
      parent[j] = cur;
      queue[tail++] = j;
    }
  }
  if (parent[to] === -2) return [];
  const path: number[] = [];
  for (let c = to; c !== -1; c = parent[c]!) path.push(c);
  return path.reverse();
}

/** Check 7a: pairwise disjoint items, exact partition of the eligible Cells, block and path coverage. */
export function checkDisjointnessAndCoverage(maze: Maze, cfg: ValidateConfig): CheckResult {
  const owner = new Map<number, string>();
  const claim = (label: string, cells: readonly Cell[]): CheckResult => {
    for (const c of cells) {
      if (!inGrid(maze, c)) return fail(`${label} ${cellStr(c)} is outside the maze`);
      const i = idxOf(maze, c);
      const prev = owner.get(i);
      if (prev !== undefined) return fail(`${label} and ${prev} overlap at ${cellStr(c)}`);
      owner.set(i, label);
    }
    return OK;
  };
  const groups: Array<[string, readonly Cell[]]> = [
    ['player start', [maze.playerStart]],
    ['hunter start', [maze.hunterStart]],
    ['cage entrance', [maze.cage.entrance]],
    ['key', maze.keys],
    ['power pellet', maze.power],
    ['speed pellet', maze.speed],
    ['bomb', maze.bombs],
    ['ghost hunt item', maze.ghostHunt],
    ['ordinary pellet', maze.ordinary],
    ['spirit wisp', maze.wisps],
  ];
  for (const [label, cells] of groups) {
    const r = claim(label, cells);
    if (!r.ok) return r;
  }

  // Exact partition: wisps ∪ ordinary == eligible set.
  const special = [...maze.power, ...maze.speed, ...maze.bombs, ...maze.ghostHunt];
  const mask = eligibleMask({
    width: maze.width,
    height: maze.height,
    tiles: maze.tiles,
    doors: maze.doors,
    cage: { entrance: maze.cage.entrance },
    playerStart: maze.playerStart,
    hunterStart: maze.hunterStart,
    keys: maze.keys,
    special,
  });
  const kind = new Uint8Array(mask.length); // 1 = wisp, 2 = ordinary
  for (const c of maze.wisps) kind[idxOf(maze, c)] = 1;
  for (const c of maze.ordinary) kind[idxOf(maze, c)] = 2;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && kind[i] === 0) {
      return fail(`eligible cell (${i % maze.width},${Math.floor(i / maze.width)}) holds neither a wisp nor a pellet`);
    }
    if (mask[i] === 0 && kind[i] !== 0) {
      return fail(`${kind[i] === 1 ? 'wisp' : 'pellet'} at (${i % maze.width},${Math.floor(i / maze.width)}) is not on an eligible cell`);
    }
  }

  // Block coverage: every block with at least two eligible cells holds both kinds.
  const side = Math.max(1, Math.floor(cfg.itemBlock));
  const blocksX = Math.ceil(maze.width / side);
  const blocksY = Math.ceil(maze.height / side);
  const wb = new Int32Array(blocksX * blocksY);
  const pb = new Int32Array(blocksX * blocksY);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    const b = Math.floor(i / maze.width / side) * blocksX + Math.floor((i % maze.width) / side);
    if (kind[i] === 1) wb[b]!++;
    else pb[b]!++;
  }
  for (let b = 0; b < wb.length; b++) {
    if (wb[b]! + pb[b]! < 2) continue;
    if (wb[b] === 0 || pb[b] === 0) {
      const bx = (b % blocksX) * side;
      const by = Math.floor(b / blocksX) * side;
      return fail(`block at (${bx},${by}) lacks ${wb[b] === 0 ? 'a spirit wisp' : 'an ordinary pellet'}`);
    }
  }

  // Path coverage: every window with at least two eligible cells holds both kinds.
  const idx = (c: Cell): number => idxOf(maze, c);
  const entrance = idx(maze.cage.entrance);
  const pairs: Array<[number, number]> = [];
  for (const k of maze.keys) {
    pairs.push([idx(maze.playerStart), idx(k)]);
    pairs.push([idx(k), entrance]);
  }
  pairs.push([idx(maze.playerStart), entrance]);
  pairs.push([idx(maze.hunterStart), entrance]);
  const win = Math.max(2, Math.floor(cfg.coverageWindow));
  for (const [a, b] of pairs) {
    const path = shortestPath(maze, a, b);
    const len = path.length;
    if (len === 0) continue;
    const span = Math.min(win, len);
    for (let s = 0; s + span <= len; s++) {
      let w = 0;
      let p = 0;
      for (let j = s; j < s + span; j++) {
        const i = path[j]!;
        if (mask[i] !== 1) continue;
        if (kind[i] === 1) w++;
        else p++;
      }
      if (w + p >= 2 && (w === 0 || p === 0)) {
        const c = { x: path[s]! % maze.width, y: Math.floor(path[s]! / maze.width) };
        return fail(`path window of ${span} cells starting at ${cellStr(c)} has no ${w === 0 ? 'spirit wisp' : 'ordinary pellet'}`);
      }
    }
  }
  return OK;
}

/** Check 7b: boundary and Cage perimeter are WallHard; Door cells are not Wall. */
export function checkWallFlags(maze: Maze): CheckResult {
  const { width, height, tiles } = maze;
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      if (tiles[y * width + x] !== Tile.WallHard) return fail(`boundary cell ${cellStr({ x, y })} is not WallHard`);
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      if (tiles[y * width + x] !== Tile.WallHard) return fail(`boundary cell ${cellStr({ x, y })} is not WallHard`);
    }
  }
  const { interior } = maze.cage;
  if (interior.length > 0) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of interior) {
      x0 = Math.min(x0, c.x);
      y0 = Math.min(y0, c.y);
      x1 = Math.max(x1, c.x);
      y1 = Math.max(y1, c.y);
    }
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const t = tiles[y * width + x]!;
        if (t !== Tile.WallHard && t !== Tile.CageGate) return fail(`cage perimeter cell ${cellStr({ x, y })} is not WallHard`);
      }
    }
  }
  for (const d of maze.doors) {
    if (inGrid(maze, d.cell) && tiles[idxOf(maze, d.cell)] === Tile.Wall) {
      return fail(`door cell ${cellStr(d.cell)} is a destructible Wall`);
    }
  }
  return OK;
}

/**
 * Cheap analytic race ratio used by check 8 (task 19.7): Ordinary_Pellet count (Squareman must
 * visit every pellet Cell) divided by the length of a greedy three-Key rescue route (start, nearest
 * remaining Key, ..., Cage entrance) with every Door open. Both are in Cells, so the ratio tracks
 * the simulated pellet-clear / rescue ratio without running the Simulation. 0 when unroutable.
 */
export function analyticRaceRatio(maze: Maze): number {
  // Every Door open (no closed Door indices).
  const route = (from: Cell, to: Cell): number => bfsDistances(maze, [from])[idxOf(maze, to)] ?? -1;
  let at = maze.playerStart;
  let total = 0;
  const left = [...maze.keys];
  while (left.length > 0) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = route(at, left[i]!);
      if (d >= 0 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return 0;
    total += bestD;
    at = left.splice(best, 1)[0]!;
  }
  const home = route(at, maze.cage.entrance);
  if (home < 0) return 0;
  total += home;
  return total > 0 ? maze.ordinary.length / total : 0;
}

/** Check 8: the analytic race ratio lies inside `prefilterBand` (evidence-derived, see config). */
export function checkPrefilter(maze: Maze, cfg: ValidateConfig): CheckResult {
  const band = cfg.prefilterBand;
  if (!band) return OK;
  const r = analyticRaceRatio(maze);
  if (r < band.min || r > band.max) return fail(`analytic race ratio ${r.toFixed(3)} outside [${band.min}, ${band.max}]`);
  return OK;
}

/**
 * Runs checks 1 to 8 in design order. `results` holds every check; `ok`, `reason` and
 * `failed` describe the first failing one. Checks never throw on malformed input.
 */
export function validateMaze(maze: Maze, cfg: ValidateConfig, opts: ValidateOptions = {}): ValidationReport {
  const run: Array<[CheckId, () => CheckResult]> = [
    ['1', () => checkConnectivity(maze)],
    ['2', () => checkReachability(maze)],
    ['3', () => checkCage(maze)],
    ['4', () => checkDimensions(maze, cfg)],
    ['5', () => checkDoorClosure(maze)],
    ['6', () => checkCounts(maze, cfg, opts)],
    ['7', () => checkFairness(maze, cfg, opts)],
    ['7a', () => checkDisjointnessAndCoverage(maze, cfg)],
    ['7b', () => checkWallFlags(maze)],
    ['8', () => (opts.prefilter === false ? OK : checkPrefilter(maze, cfg))],
  ];
  const results: NamedCheckResult[] = run.map(([id, fn]) => ({ id, ...fn() }));
  const firstBad = results.find((r) => !r.ok);
  return {
    ok: firstBad === undefined,
    reason: firstBad?.reason ?? '',
    failed: firstBad?.id ?? null,
    results,
  };
}

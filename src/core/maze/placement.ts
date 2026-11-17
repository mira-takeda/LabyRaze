/**
 * Start, Key, Power, Speed, Bomb and Ghost_Hunt placement
 * (Requirements 4.2, 4.5, 7.1, 28.11, 29.17).
 *
 * CALL ORDER (used by generate.ts, task 5.7):
 *   1. carveMaze(...)                                  -> tiles, cage, `maze` stream
 *   2. placeStarts(carved, runSeed, level, retry)      -> playerStart, hunterStart, `items` rng
 *   3. placeDoors(carved, ..., { exclude: startCells(starts) })
 *   4. placeItems({ ...carved, tiles: doorResult.tiles, doors: doorResult.doors, ...starts },
 *                 config, starts.rng)                  -> keys, power, speed, bombs, ghostHunt
 *   5. partition.ts (task 5.4) continues from `placement.rng` and treats every placed cell,
 *      the starts, the Cage and the Door cells as ineligible.
 *
 * Every draw comes from the `items` stream (derived once in placeStarts, threaded through
 * the returned `rng`). Distances are BFS graph distances over the passable graph with all
 * Doors open (the structural guarantee of door placement keeps it connected with Doors
 * closed too). Fairness deltas relax one Cell per step up to `RELAX_CAP`; `relaxation`
 * reports the step used per category (0 = the configured values held, `RELAX_FALLBACK` =
 * the constraint set was dropped for that item).
 *
 * Ordinary pellets and Spirit_Wisps are NOT placed here.
 * Pure and deterministic: no recursion, no clock, no unseeded randomness.
 */

import type { GameConfig } from '../config';
import { NEIGHBOR_DX, NEIGHBOR_DY } from '../grid';
import { computeDistanceField } from '../pathfinding';
import type { NavLayout } from '../pathfinding';
import { deriveSeed, nextInt, shuffle } from '../prng';
import type { PrngState } from '../prng';
import { COLLECTOR_MASK, ItemKind, Tile } from '../types';
import type { Cell, DoorSpec, ItemKindCode } from '../types';

/** Maximum number of one-Cell relaxation steps. */
export const RELAX_CAP = 40;
/** `relaxation` value meaning the constraint set was dropped entirely. */
export const RELAX_FALLBACK = 999;
/** Number of Keys per Maze. */
export const KEY_COUNT = 3;
/** Maximum Key-set draws per placement for the route-length band (task 36.8). */
export const KEY_ROUTE_RETRIES = 32;

/**
 * Greedy Key route length (task 36.8): from the Player start to the nearest remaining Key
 * (ties: lowest list position) until every Key is visited, then to the Cage entrance.
 * `dp` / `dc` are distance fields from the Player start / Cage entrance; `fieldOf(i)` returns
 * the field from cell index `i`. Returns -1 if a leg is unreachable.
 */
export function greedyKeyRoute(
  dp: Int32Array,
  dc: Int32Array,
  keyIdx: readonly number[],
  fieldOf: (i: number) => Int32Array,
): number {
  const left = [...keyIdx];
  let cur = dp;
  let len = 0;
  while (left.length > 0) {
    let bi = 0;
    for (let j = 1; j < left.length; j++) if (cur[left[j]!]! < cur[left[bi]!]!) bi = j;
    const k = left.splice(bi, 1)[0]!;
    const d = cur[k]!;
    if (d < 0) return -1;
    len += d;
    cur = left.length > 0 ? fieldOf(k) : cur;
    if (left.length === 0) {
      const e = dc[k]!;
      if (e < 0) return -1;
      len += e;
    }
  }
  return len;
}

export type PlacementConfig = Pick<
  GameConfig,
  | 'keyFairnessDelta'
  | 'keyMinDist'
  | 'keyMaxDist'
  | 'keyRouteMin'
  | 'keyRouteMax'
  | 'powerPelletsPerLevel'
  | 'powerMinStartDist'
  | 'powerFairnessDelta'
  | 'speedPelletsPerLevel'
  | 'speedFairnessDelta'
  | 'bombsPerLevel'
  | 'bombMinStartDist'
  | 'bombFairnessDelta'
  | 'ghostHuntPerLevel'
  | 'ghostHuntMinCageDist'
>;

export interface StartInput {
  width: number;
  height: number;
  /** Carved tiles (no Doors yet). */
  tiles: Uint8Array;
}

export interface StartPlacement {
  playerStart: Cell;
  hunterStart: Cell;
  /** `items` stream state after the start draws. */
  rng: PrngState;
}

export interface ItemInput {
  width: number;
  height: number;
  /** Tiles that include `Tile.Door` cells. */
  tiles: Uint8Array;
  doors: readonly DoorSpec[];
  cage: { entrance: Cell };
  playerStart: Cell;
  hunterStart: Cell;
}

export interface PlacedItem {
  cell: Cell;
  kind: ItemKindCode;
  /** Who may collect it (COLLECT_PLAYER / COLLECT_HUNTER bits); Bombs and Ghost_Hunt are player-only. */
  collectorMask: number;
}

export interface ItemPlacement {
  keys: Cell[];
  power: Cell[];
  speed: Cell[];
  bombs: Cell[];
  ghostHunt: Cell[];
  /** Power, Speed, Bomb and Ghost_Hunt items with collector flags (Keys are not ItemKinds). */
  items: PlacedItem[];
  /** Relaxation steps used per category (0 = configured values held). */
  relaxation: { key: number; power: number; speed: number; bomb: number; ghostHunt: number };
  /** `items` stream state after placement, for partition.ts. */
  rng: PrngState;
}

/** Start cells as an exclusion list for `placeDoors`. */
export function startCells(starts: Pick<StartPlacement, 'playerStart' | 'hunterStart'>): Cell[] {
  return [starts.playerStart, starts.hunterStart];
}

/** Quadrant 0..3 (qy * 2 + qx) of a cell, or -1 on the centre row or column. */
export function quadrantOf(width: number, height: number, c: Cell): number {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  if (c.x === cx || c.y === cy) return -1;
  return (c.y > cy ? 2 : 0) + (c.x > cx ? 1 : 0);
}

/** Third 0..2 of the Maze by column. */
export function thirdOf(width: number, x: number): number {
  return Math.min(2, Math.floor((x * 3) / width));
}

/** True inside the central region (middle third of each dimension). */
export function inCentralRegion(width: number, height: number, c: Cell): boolean {
  const xs = Math.floor(width / 3);
  const xe = Math.ceil((2 * width) / 3);
  const ys = Math.floor(height / 3);
  const ye = Math.ceil((2 * height) / 3);
  return c.x >= xs && c.x < xe && c.y >= ys && c.y < ye;
}

function navOf(width: number, height: number, doors: readonly DoorSpec[]): NavLayout {
  return { width, height, doors: doors as DoorSpec[], wrapPairs: [] };
}

function distFrom(
  nav: NavLayout,
  tiles: Uint8Array,
  source: Cell,
): Int32Array {
  const mask = nav.doors.length >= 31 ? -1 : (1 << nav.doors.length) - 1;
  return computeDistanceField(nav, tiles, mask, 0, [source.y * nav.width + source.x]).dist;
}

/**
 * Places the two start cells in opposite quadrants. A diagonal quadrant pair and an
 * orientation are drawn, then the Floor-cell pair with maximal graph distance is chosen
 * with ties broken by the PRNG.
 */
export function placeStarts(
  input: StartInput,
  runSeed: number,
  levelNumber: number,
  retryIndex: number,
): StartPlacement {
  const { width, height, tiles } = input;
  let rng: PrngState = deriveSeed(runSeed, levelNumber, 'items', retryIndex);
  const nav = navOf(width, height, []);

  const byQuadrant: Cell[][] = [[], [], [], []];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== Tile.Floor) continue;
    const c = { x: i % width, y: Math.floor(i / width) };
    const q = quadrantOf(width, height, c);
    if (q >= 0) byQuadrant[q]!.push(c);
  }

  const [diag, r1] = nextInt(rng, 0, 1);
  const [flip, r2] = nextInt(r1, 0, 1);
  rng = r2;
  const qa = diag === 0 ? 0 : 1;
  const [pq, hq] = flip === 0 ? [qa, 3 - qa] : [3 - qa, qa];
  const pCands = byQuadrant[pq]!;
  const hCands = byQuadrant[hq]!;

  let best = -1;
  const pairs: Array<[Cell, Cell]> = [];
  for (const p of pCands) {
    const d = distFrom(nav, tiles, p);
    for (const h of hCands) {
      const v = d[h.y * width + h.x]!;
      if (v < 0 || v < best) continue;
      if (v > best) {
        best = v;
        pairs.length = 0;
      }
      pairs.push([p, h]);
    }
  }
  if (pairs.length === 0) throw new RangeError('placeStarts: no reachable start pair in opposite quadrants');
  const [k, r3] = nextInt(rng, 0, pairs.length - 1);
  const [playerStart, hunterStart] = pairs[k]!;
  return { playerStart, hunterStart, rng: r3 };
}

/** Floor/Door graph cells that lie on a cycle (at least two non-bridge incident edges). */
export function cycleCells(width: number, height: number, tiles: Uint8Array): Uint8Array {
  const n = width * height;
  const isNode = (i: number): boolean => tiles[i] === Tile.Floor || tiles[i] === Tile.Door;
  const nbrs = (i: number): number[] => {
    const out: number[] = [];
    const x = i % width;
    const y = Math.floor(i / width);
    for (let k = 0; k < 4; k++) {
      const nx = x + NEIGHBOR_DX[k]!;
      const ny = y + NEIGHBOR_DY[k]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (isNode(j)) out.push(j);
    }
    return out;
  };
  const adj: number[][] = [];
  for (let i = 0; i < n; i++) adj.push(isNode(i) ? nbrs(i) : []);

  const stamp = new Int32Array(n);
  let epoch = 0;
  const reachable = (u: number, v: number): boolean => {
    // Path from u to v that avoids the direct edge (u, v).
    epoch++;
    const queue = [u];
    stamp[u] = epoch;
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h]!;
      for (const nb of adj[c]!) {
        if ((c === u && nb === v) || stamp[nb] === epoch) continue;
        if (nb === v) return true;
        stamp[nb] = epoch;
        queue.push(nb);
      }
    }
    return false;
  };

  const out = new Uint8Array(n);
  for (let u = 0; u < n; u++) {
    let nonBridge = 0;
    for (const v of adj[u]!) if (reachable(u, v)) nonBridge++;
    if (nonBridge >= 2) out[u] = 1;
  }
  return out;
}

interface PickResult {
  idx: number;
  relax: number;
  rng: PrngState;
}

/** Tries relax = 0..RELAX_CAP; at the first level with candidates draws one. idx -1 if none. */
function relaxedPick(
  rng: PrngState,
  cands: readonly number[],
  ok: (i: number, relax: number) => boolean,
  narrow?: (list: number[]) => number[],
  lo = 0,
  hi = RELAX_CAP,
): PickResult {
  for (let r = lo; r <= hi; r++) {
    let list = cands.filter((i) => ok(i, r));
    if (list.length > 0 && narrow) list = narrow(list);
    if (list.length === 0) continue;
    const [k, next] = nextInt(rng, 0, list.length - 1);
    return { idx: list[k]!, relax: r, rng: next };
  }
  return { idx: -1, relax: RELAX_FALLBACK, rng };
}

/**
 * Places Keys, Power_Pellets, Speed_Pellets, Bombs and Ghost_Hunt items from the `items`
 * stream (pass the `rng` returned by `placeStarts`). Cells are unique and never overlap
 * starts, Door cells, Cage cells or each other.
 */
export function placeItems(input: ItemInput, config: PlacementConfig, rngIn: PrngState): ItemPlacement {
  const { width, height, tiles, doors } = input;
  const nav = navOf(width, height, doors);
  const dp = distFrom(nav, tiles, input.playerStart);
  const dh = distFrom(nav, tiles, input.hunterStart);
  const dc = distFrom(nav, tiles, input.cage.entrance);
  const cyc = cycleCells(width, height, tiles);
  let rng = rngIn;

  const occupied = new Uint8Array(tiles.length);
  occupied[input.playerStart.y * width + input.playerStart.x] = 1;
  occupied[input.hunterStart.y * width + input.hunterStart.x] = 1;

  const free: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === Tile.Floor && !occupied[i] && dp[i]! >= 0 && dh[i]! >= 0 && dc[i]! >= 0) free.push(i);
  }
  const cellOf = (i: number): Cell => ({ x: i % width, y: Math.floor(i / width) });
  const available = (): number[] => free.filter((i) => !occupied[i]);
  const take = (i: number): Cell => {
    occupied[i] = 1;
    return cellOf(i);
  };
  /** Unconstrained pick used when a constraint set cannot be met at all. */
  const fallback = (): number => {
    const list = available();
    if (list.length === 0) throw new RangeError('placeItems: no free floor cell left');
    let k: number;
    [k, rng] = nextInt(rng, 0, list.length - 1);
    return list[k]!;
  };

  const relaxation = { key: 0, power: 0, speed: 0, bomb: 0, ghostHunt: 0 };

  // --- Keys: one per third, outside the central region. Task 36.8: the whole Key set is
  // resampled from the same stream (at most KEY_ROUTE_RETRIES draws) until the greedy Key
  // route lies in keyRouteMin..keyRouteMax; if no draw fits, the draw nearest the band is kept.
  const keys: Cell[] = [];
  {
    let best: { idx: number[]; miss: number; relax: number } | null = null;
    for (let attempt = 0; attempt < KEY_ROUTE_RETRIES; attempt++) {
      let thirds: number[];
      [thirds, rng] = shuffle(rng, [0, 1, 2]);
      const picked: number[] = [];
      let relax = 0;
      for (let n = 0; n < KEY_COUNT; n++) {
        const third = thirds[n % 3]!;
        const cands = available().filter(
          (i) => thirdOf(width, i % width) === third && !inCentralRegion(width, height, cellOf(i)),
        );
        const p = relaxedPick(
          rng,
          cands,
          (i, r) =>
            dc[i]! >= Math.max(1, config.keyMinDist - r) &&
            dc[i]! <= config.keyMaxDist + r &&
            dp[i]! - dh[i]! <= config.keyFairnessDelta + r,
        );
        rng = p.rng;
        relax = Math.max(relax, p.relax);
        const idx = p.idx >= 0 ? p.idx : fallback();
        occupied[idx] = 1;
        picked.push(idx);
      }
      for (const i of picked) occupied[i] = 0;
      const route = greedyKeyRoute(dp, dc, picked, (i) => distFrom(nav, tiles, cellOf(i)));
      const miss = route < config.keyRouteMin ? config.keyRouteMin - route : Math.max(0, route - config.keyRouteMax);
      if (best === null || miss < best.miss) best = { idx: picked, miss, relax };
      if (miss === 0) break;
    }
    relaxation.key = best!.relax;
    for (const i of best!.idx) keys.push(take(i));
  }

  // --- Power_Pellets: one per quadrant (cyclic), fair, not all near the same character.
  const power: Cell[] = [];
  {
    let order: number[];
    [order, rng] = shuffle(rng, [0, 1, 2, 3]);
    const cornerDist = (i: number): number => {
      const c = cellOf(i);
      const cx = c.x < (width - 1) / 2 ? 1 : width - 2;
      const cy = c.y < (height - 1) / 2 ? 1 : height - 2;
      return Math.abs(c.x - cx) + Math.abs(c.y - cy);
    };
    const side = (i: number): number => Math.sign(dh[i]! - dp[i]!); // +1 nearer the Player
    const sides: number[] = [];
    for (let n = 0; n < config.powerPelletsPerLevel; n++) {
      const q = order[n % 4]!;
      const avail = available();
      const quadOf = (i: number): number => quadrantOf(width, height, cellOf(i));
      // Scopes in order: the assigned quadrant, quadrants not used yet, anywhere. A fair
      // cell elsewhere beats relaxing the delta (the starts' own corners are never fair).
      const scopes: number[][] = [
        avail.filter((i) => quadOf(i) === q),
        avail.filter((i) => !power.some((c) => quadrantOf(width, height, c) === quadOf(i))),
        avail,
      ];
      const lastOfSeveral = n === config.powerPelletsPerLevel - 1 && n >= 1;
      const forbidden =
        lastOfSeveral && sides.every((s) => s !== 0 && s === sides[0]) ? sides[0]! : 0;
      const okPower = (i: number, r: number): boolean =>
        dp[i]! > config.powerMinStartDist &&
        dh[i]! > config.powerMinStartDist &&
        Math.abs(dp[i]! - dh[i]!) <= config.powerFairnessDelta + r &&
        (forbidden === 0 || side(i) !== forbidden);
      const narrowPower = (list: number[]): number[] => {
        const m = Math.min(...list.map(cornerDist));
        return list.filter((i) => cornerDist(i) <= m + 3);
      };
      let p: PickResult = { idx: -1, relax: RELAX_FALLBACK, rng };
      for (let r = 0; r <= RELAX_CAP && p.idx < 0; r++) {
        for (const scope of scopes) {
          p = relaxedPick(rng, scope, okPower, narrowPower, r, r);
          if (p.idx >= 0) break;
        }
      }
      rng = p.rng;
      relaxation.power = Math.max(relaxation.power, p.relax);
      const idx = p.idx >= 0 ? p.idx : fallback();
      sides.push(side(idx));
      power.push(take(idx));
    }
  }

  // --- Speed_Pellets: cycle Cells, fair.
  const speed: Cell[] = [];
  for (let n = 0; n < config.speedPelletsPerLevel; n++) {
    const cands = available().filter((i) => cyc[i] === 1);
    const p = relaxedPick(rng, cands, (i, r) => Math.abs(dp[i]! - dh[i]!) <= config.speedFairnessDelta + r);
    rng = p.rng;
    relaxation.speed = Math.max(relaxation.speed, p.relax);
    speed.push(take(p.idx >= 0 ? p.idx : fallback()));
  }

  // --- Bombs: distinct thirds, away from the Player start, not deep in the Player's disadvantage.
  const bombs: Cell[] = [];
  {
    let thirds: number[];
    [thirds, rng] = shuffle(rng, [0, 1, 2]);
    for (let n = 0; n < config.bombsPerLevel; n++) {
      const third = thirds[n % 3]!;
      const cands = available().filter((i) => thirdOf(width, i % width) === third);
      const p = relaxedPick(
        rng,
        cands,
        (i, r) => dp[i]! >= config.bombMinStartDist && dh[i]! - dp[i]! >= -(config.bombFairnessDelta + r),
      );
      rng = p.rng;
      relaxation.bomb = Math.max(relaxation.bomb, p.relax);
      if (p.idx < 0) {
        // Keep the third and the start distance, drop only the fairness delta.
        const loose = cands.filter((i) => dp[i]! >= config.bombMinStartDist);
        const q = relaxedPick(rng, loose, () => true);
        rng = q.rng;
        bombs.push(take(q.idx >= 0 ? q.idx : fallback()));
      } else {
        bombs.push(take(p.idx));
      }
    }
  }

  // --- Ghost_Hunt: cycle Cells far from the Cage entrance, same delta rule as Bombs.
  const ghostHunt: Cell[] = [];
  for (let n = 0; n < config.ghostHuntPerLevel; n++) {
    const cands = available().filter((i) => cyc[i] === 1);
    const p = relaxedPick(
      rng,
      cands,
      (i, r) => dc[i]! >= config.ghostHuntMinCageDist && dh[i]! - dp[i]! >= -(config.bombFairnessDelta + r),
    );
    rng = p.rng;
    relaxation.ghostHunt = Math.max(relaxation.ghostHunt, p.relax);
    if (p.idx < 0) {
      const far = cands.filter((i) => dc[i]! >= config.ghostHuntMinCageDist);
      const q = relaxedPick(rng, far, () => true);
      rng = q.rng;
      ghostHunt.push(take(q.idx >= 0 ? q.idx : fallback()));
    } else {
      ghostHunt.push(take(p.idx));
    }
  }

  const items: PlacedItem[] = [];
  const add = (cells: Cell[], kind: ItemKindCode): void => {
    for (const cell of cells) items.push({ cell, kind, collectorMask: COLLECTOR_MASK[kind] });
  };
  add(power, ItemKind.Power);
  add(speed, ItemKind.Speed);
  add(bombs, ItemKind.Bomb);
  add(ghostHunt, ItemKind.GhostHunt);

  return { keys, power, speed, bombs, ghostHunt, items, relaxation, rng };
}

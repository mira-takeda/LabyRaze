/**
 * Maze repair passes (Requirement 4.8; design "Repair and Regenerate Strategy").
 *
 * `repairMaze` takes a finished `Maze`, never mutates it, and returns a repaired copy. Every
 * random choice comes from the `repair` stream (`deriveSeed(runSeed, level, 'repair', retry)`).
 * The number of individual repairs (a wall knocked through, a Door replaced, an item moved,
 * a partition re-derivation) is bounded by `maxRepairs`.
 *
 *   A  connectivity: while a passable Cell is unreachable, open the destructible walls on the
 *      shortest wall-only route that joins it to the main component (ties drawn at random).
 *   B  door safety:  while some single or pair Door closure strands part of the Maze, drop one
 *      Door of the failing set and re-place it on a fresh corridor Cell that keeps the whole
 *      Door set safe. The Door count never changes.
 *   C  placement:    every Key, Power, Speed, Bomb and Ghost_Hunt item that breaks a fairness
 *      delta swaps places with a fair free Cell (a wisp or ordinary Cell). Distances depend only
 *      on tiles, so a fair target stays fair. The wisp/pellet partition is then re-derived from
 *      the repair stream (re-run until path coverage 7a holds), so coverage never regresses.
 *
 * After each pass the Maze is re-validated with the unchanged `validateMaze`; repair stops at
 * the first valid result. Item counts (Keys, Power, Speed, Bombs, Ghost_Hunt, Doors) never change.
 * Pure and deterministic: no recursion, no clock, no unseeded randomness.
 */

import type { GameConfig } from '../config';
import { NEIGHBOR_DX, NEIGHBOR_DY } from '../grid';
import { deriveSeed, nextInt, shuffle } from '../prng';
import type { PrngState } from '../prng';
import { Tile } from '../types';
import type { Cell, Maze } from '../types';
import { DOOR_EXCLUSION_RADIUS, DOOR_MIN_SPACING, doorSetKeepsConnectivity, findArticulationPoints } from './doorPlacement';
import { partitionItems } from './partition';
import { cycleCells, greedyKeyRoute, inCentralRegion, quadrantOf, thirdOf } from './placement';
import { bfsDistances, checkDisjointnessAndCoverage, validateMaze } from './validate';
import type { CheckId, ValidateConfig, ValidateOptions, ValidationReport } from './validate';

export type RepairConfig = ValidateConfig &
  Pick<GameConfig, 'wispDensity' | 'maxRepairs'> &
  Partial<Pick<GameConfig, 'keyRouteMin' | 'keyRouteMax'>>;

export interface RepairOptions extends ValidateOptions {
  /** Override of `cfg.maxRepairs`. */
  maxRepairs?: number;
}

export interface RepairResult {
  maze: Maze;
  /** Individual repairs applied (bounded by `maxRepairs`). */
  repairs: number;
  /** True when the repaired Maze passes every validity check. */
  ok: boolean;
  /** Final validation report. */
  report: ValidationReport;
  /** Passes that ran, in order ('A' | 'B' | 'C'). */
  passes: string[];
}

interface State {
  rng: PrngState;
  used: number;
  budget: number;
}

const PARTITION_RETRIES = 6;

function cloneMaze(m: Maze): Maze {
  const cp = (cs: readonly Cell[]): Cell[] => cs.map((c) => ({ ...c }));
  return {
    ...m,
    tiles: m.tiles.slice(),
    doors: m.doors.map((d) => ({ ...d, cell: { ...d.cell } })),
    wrapPairs: m.wrapPairs.slice(),
    playerStart: { ...m.playerStart },
    hunterStart: { ...m.hunterStart },
    cage: { interior: cp(m.cage.interior), entrance: { ...m.cage.entrance } },
    keys: cp(m.keys),
    ordinary: cp(m.ordinary),
    power: cp(m.power),
    speed: cp(m.speed),
    bombs: cp(m.bombs),
    ghostHunt: cp(m.ghostHunt),
    wisps: cp(m.wisps),
    generation: { ...m.generation },
  };
}

const idxOf = (m: Pick<Maze, 'width'>, c: Cell): number => c.y * m.width + c.x;
const cellAt = (m: Pick<Maze, 'width'>, i: number): Cell => ({ x: i % m.width, y: Math.floor(i / m.width) });

function isPassableTile(t: number): boolean {
  return t === Tile.Floor || t === Tile.CageInterior || t === Tile.CageGate || t === Tile.Door;
}

function draw(state: State, n: number): number {
  const [v, next] = nextInt(state.rng, 0, n - 1);
  state.rng = next;
  return v;
}

/** Re-derives wisps and ordinary pellets from the repair stream. Counts as one repair. */
function repartition(m: Maze, cfg: RepairConfig, state: State): void {
  const part = partitionItems(
    {
      width: m.width,
      height: m.height,
      tiles: m.tiles,
      doors: m.doors,
      cage: { entrance: m.cage.entrance },
      playerStart: m.playerStart,
      hunterStart: m.hunterStart,
      keys: m.keys,
      special: [...m.power, ...m.speed, ...m.bombs, ...m.ghostHunt],
    },
    cfg,
    state.rng,
  );
  state.rng = part.rng;
  m.wisps = part.wisps;
  m.ordinary = part.ordinary;
  state.used++;
}

/** Pass A: open destructible walls until every passable Cell is reachable. Returns true if anything changed. */
function passConnectivity(m: Maze, state: State): boolean {
  const { width, height, tiles } = m;
  const total = width * height;
  let changed = false;
  while (state.used < state.budget) {
    const dist = bfsDistances(m, [m.playerStart]);
    let stranded = false;
    for (let i = 0; i < total; i++) {
      if (isPassableTile(tiles[i]!) && dist[i]! < 0) {
        stranded = true;
        break;
      }
    }
    if (!stranded) break;

    // BFS from the reached component through destructible walls only.
    const wd = new Int32Array(total).fill(-1);
    const parent = new Int32Array(total).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < total; i++) {
      if (isPassableTile(tiles[i]!) && dist[i]! >= 0) {
        wd[i] = 0;
        queue.push(i);
      }
    }
    const goals: number[] = [];
    let goalDepth = -1;
    for (let h = 0; h < queue.length; h++) {
      const cur = queue[h]!;
      if (goalDepth >= 0 && wd[cur]! > goalDepth) break;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let k = 0; k < 4; k++) {
        const nx = cx + NEIGHBOR_DX[k]!;
        const ny = cy + NEIGHBOR_DY[k]!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (isPassableTile(tiles[j]!) && dist[j]! < 0) {
          if (wd[cur]! >= 1 && (goalDepth < 0 || wd[cur] === goalDepth)) {
            goalDepth = wd[cur]!;
            if (!goals.includes(cur)) goals.push(cur);
          }
          continue;
        }
        if (tiles[j] !== Tile.Wall || wd[j] !== -1) continue;
        wd[j] = wd[cur]! + 1;
        parent[j] = cur;
        queue.push(j);
      }
    }
    if (goals.length === 0) break; // only hard walls separate it: not repairable here
    const end = goals[draw(state, goals.length)]!;
    for (let c = end; c !== -1 && tiles[c] === Tile.Wall; c = parent[c]!) tiles[c] = Tile.Floor;
    state.used++;
    changed = true;
  }
  return changed;
}

/** First single or pair Door closure that leaves a passable Cell unreachable, or null. */
function failingDoorSet(m: Maze): number[] | null {
  let passable = 0;
  for (let i = 0; i < m.tiles.length; i++) if (isPassableTile(m.tiles[i]!)) passable++;
  const n = m.doors.length;
  const sets: number[][] = [];
  for (let a = 0; a < n; a++) {
    sets.push([a]);
    for (let b = a + 1; b < n; b++) sets.push([a, b]);
  }
  for (const closed of sets) {
    const dist = bfsDistances(m, [m.playerStart], closed);
    let reached = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i]! >= 0) reached++;
    if (reached < passable - closed.length) return closed;
  }
  return null;
}

/** Pass B: replace Doors that make a closure strand part of the Maze. Returns true if anything changed. */
function passDoorSafety(m: Maze, state: State): boolean {
  const { width, height } = m;
  let changed = false;
  for (let guard = 0; guard < m.doors.length + 2 && state.used < state.budget; guard++) {
    const set = failingDoorSet(m);
    if (set === null) break;
    const culprit = set[draw(state, set.length)]!;

    // Cells that must stay clear of a Door.
    const blocked = new Uint8Array(width * height);
    for (const c of [m.playerStart, m.hunterStart, m.cage.entrance, ...m.keys, ...m.power, ...m.speed, ...m.bombs, ...m.ghostHunt]) {
      blocked[idxOf(m, c)] = 1;
    }
    const exclusion = bfsDistances(m, [m.cage.entrance, m.playerStart, m.hunterStart]);
    const open = m.tiles.slice();
    for (let i = 0; i < open.length; i++) if (open[i] === Tile.Door) open[i] = Tile.Floor;
    const art = findArticulationPoints(width, height, open);

    const candidates: number[] = [];
    for (let i = 0; i < open.length; i++) {
      if (open[i] !== Tile.Floor || art[i] || blocked[i]) continue;
      const d = exclusion[i]!;
      if (d >= 0 && d <= DOOR_EXCLUSION_RADIUS) continue;
      let nb = 0;
      const x = i % width;
      const y = Math.floor(i / width);
      for (let k = 0; k < 4; k++) {
        const nx = x + NEIGHBOR_DX[k]!;
        const ny = y + NEIGHBOR_DY[k]!;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && isPassableTile(open[ny * width + nx]!)) nb++;
      }
      if (nb === 2) candidates.push(i);
    }
    let order: number[];
    [order, state.rng] = shuffle(state.rng, candidates);

    const others = m.doors.filter((_, i) => i !== culprit).map((d) => idxOf(m, d.cell));
    const oldCell = idxOf(m, m.doors[culprit]!.cell);
    let chosen = -1;
    for (const spacing of [DOOR_MIN_SPACING, 3, 1]) {
      let tried = 0;
      for (const cand of order) {
        if (tried >= 60) break;
        const dc = bfsDistances(m, [cellAt(m, cand)]);
        if (others.some((o) => dc[o]! >= 0 && dc[o]! < spacing)) continue;
        tried++;
        if (!doorSetKeepsConnectivity(width, height, open, [...others, cand])) continue;
        chosen = cand;
        break;
      }
      if (chosen >= 0) break;
    }
    if (chosen < 0) break;
    m.tiles[oldCell] = Tile.Floor;
    m.tiles[chosen] = Tile.Door;
    m.doors[culprit] = { ...m.doors[culprit]!, cell: cellAt(m, chosen) };
    state.used++;
    changed = true;
  }
  return changed;
}

/** Pass C: move unfair items to fair free Cells, then re-derive the partition until 7a holds. */
function passPlacement(m: Maze, cfg: RepairConfig, opts: ValidateOptions, state: State): boolean {
  const { width, height } = m;
  const slack = opts.fairnessSlack ?? 0;
  const dp = bfsDistances(m, [m.playerStart]);
  const dh = bfsDistances(m, [m.hunterStart]);
  const dc = bfsDistances(m, [m.cage.entrance]);
  const cyc = cycleCells(width, height, m.tiles);
  const at = (d: Int32Array, i: number): number => d[i]!;

  const free = new Set<number>();
  for (const c of [...m.ordinary, ...m.wisps]) free.add(idxOf(m, c));

  type Pred = (i: number) => boolean;
  const keyOk: Pred = (i) =>
    at(dp, i) >= 0 &&
    at(dh, i) >= 0 &&
    at(dc, i) >= 0 &&
    at(dp, i) - at(dh, i) <= cfg.keyFairnessDelta + slack &&
    at(dc, i) >= cfg.keyMinDist - slack &&
    at(dc, i) <= cfg.keyMaxDist + slack;
  const powerOk: Pred = (i) =>
    at(dp, i) > cfg.powerMinStartDist &&
    at(dh, i) > cfg.powerMinStartDist &&
    Math.abs(at(dp, i) - at(dh, i)) <= cfg.powerFairnessDelta + slack;
  const speedOk: Pred = (i) =>
    at(dp, i) >= 0 && at(dh, i) >= 0 && Math.abs(at(dp, i) - at(dh, i)) <= cfg.speedFairnessDelta + slack;
  const bombOk: Pred = (i) =>
    at(dp, i) >= cfg.bombMinStartDist && at(dh, i) >= 0 && at(dh, i) - at(dp, i) >= -(cfg.bombFairnessDelta + slack);
  const huntOk: Pred = (i) =>
    at(dp, i) >= 0 &&
    at(dh, i) >= 0 &&
    at(dc, i) >= cfg.ghostHuntMinCageDist &&
    at(dh, i) - at(dp, i) >= -(cfg.bombFairnessDelta + slack);

  interface Category {
    list: Cell[];
    ok: Pred;
    /** Soft preference for a replacement (same third, quadrant or cycle Cell). */
    prefer: (from: number) => Pred;
    /** Hard extra requirement for a replacement. */
    allowed: Pred;
  }
  const any: Pred = () => true;
  const cats: Category[] = [
    {
      list: m.keys,
      ok: keyOk,
      prefer: (from) => (i) => thirdOf(width, i % width) === thirdOf(width, from % width),
      allowed: (i) => !inCentralRegion(width, height, cellAt(m, i)),
    },
    {
      list: m.power,
      ok: powerOk,
      prefer: (from) => (i) => quadrantOf(width, height, cellAt(m, i)) === quadrantOf(width, height, cellAt(m, from)),
      allowed: any,
    },
    { list: m.speed, ok: speedOk, prefer: () => (i) => cyc[i] === 1, allowed: any },
    {
      list: m.bombs,
      ok: bombOk,
      prefer: (from) => (i) => thirdOf(width, i % width) === thirdOf(width, from % width),
      allowed: any,
    },
    { list: m.ghostHunt, ok: huntOk, prefer: () => (i) => cyc[i] === 1, allowed: any },
  ];

  // Task 36.8: a relocated Key keeps the greedy Key route inside keyRouteMin..keyRouteMax when
  // some candidate allows it; otherwise the unfiltered pool is used (validation decides).
  const keyRouteFilter = (n: number, pool: number[]): number[] => {
    const lo = cfg.keyRouteMin;
    const hi = cfg.keyRouteMax;
    if (lo === undefined || hi === undefined) return pool;
    const fieldOf = (i: number): Int32Array => bfsDistances(m, [cellAt(m, i)]);
    const others = m.keys.map((c) => idxOf(m, c));
    const inBand = pool.filter((cand) => {
      const set = others.slice();
      set[n] = cand;
      const r = greedyKeyRoute(dp, dc, set, fieldOf);
      return r >= lo && r <= hi;
    });
    return inBand.length > 0 ? inBand : pool;
  };

  let moved = false;
  for (const cat of cats) {
    for (let n = 0; n < cat.list.length; n++) {
      const from = idxOf(m, cat.list[n]!);
      if (cat.ok(from)) continue;
      if (state.used >= state.budget) return moved;
      const fair = [...free].filter((i) => cat.ok(i) && cat.allowed(i)).sort((a, b) => a - b);
      if (fair.length === 0) continue; // unreachable on this layout; reported by validation
      const preferred = fair.filter(cat.prefer(from));
      let pool = preferred.length > 0 ? preferred : fair;
      if (cat.list === m.keys) {
        const narrowed = keyRouteFilter(n, pool);
        if (narrowed !== pool) pool = narrowed;
        else if (pool !== fair) {
          const wide = keyRouteFilter(n, fair);
          if (wide !== fair) pool = wide;
        }
      }
      const to = pool[draw(state, pool.length)]!;
      free.delete(to);
      free.add(from);
      cat.list[n] = cellAt(m, to);
      state.used++;
      moved = true;
    }
  }

  // Re-derive the wisp/pellet partition so 7a holds for the new item layout.
  let ok = false;
  for (let t = 0; t < PARTITION_RETRIES && state.used < state.budget; t++) {
    repartition(m, cfg, state);
    if (checkDisjointnessAndCoverage(m, cfg).ok) {
      ok = true;
      break;
    }
  }
  return moved || ok;
}

/**
 * Repairs `maze` in place of regeneration. Does not mutate the input. See the file header.
 * `runSeed`, `levelNumber` and `retryIndex` select the `repair` stream.
 */
export function repairMaze(
  maze: Maze,
  cfg: RepairConfig,
  runSeed: number,
  levelNumber: number,
  retryIndex: number,
  opts: RepairOptions = {},
): RepairResult {
  const m = cloneMaze(maze);
  const state: State = {
    rng: deriveSeed(runSeed, levelNumber, 'repair', retryIndex),
    used: 0,
    budget: Math.max(0, Math.floor(opts.maxRepairs ?? cfg.maxRepairs)),
  };
  const vopts: ValidateOptions = {};
  if (opts.minOrdinary !== undefined) vopts.minOrdinary = opts.minOrdinary;
  if (opts.fairnessSlack !== undefined) vopts.fairnessSlack = opts.fairnessSlack;
  const passes: string[] = [];

  let report = validateMaze(m, cfg, vopts);
  const failing = (id: CheckId): boolean => report.results.some((r) => r.id === id && !r.ok);

  if (!report.ok && failing('1') && state.used < state.budget) {
    passes.push('A');
    if (passConnectivity(m, state) && state.used < state.budget) repartition(m, cfg, state);
    report = validateMaze(m, cfg, vopts);
  }
  if (!report.ok && failing('5') && state.used < state.budget) {
    passes.push('B');
    if (passDoorSafety(m, state) && state.used < state.budget) repartition(m, cfg, state);
    report = validateMaze(m, cfg, vopts);
  }
  if (!report.ok && (failing('7') || failing('7a')) && state.used < state.budget) {
    passes.push('C');
    passPlacement(m, cfg, vopts, state);
    report = validateMaze(m, cfg, vopts);
  }

  m.generation = { ...m.generation, repairs: m.generation.repairs + state.used };
  return { maze: m, repairs: state.used, ok: report.ok, report, passes };
}

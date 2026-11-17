import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { carveMaze } from '../../src/core/maze/carve';
import { placeDoors } from '../../src/core/maze/doorPlacement';
import { placeItems, placeStarts, startCells } from '../../src/core/maze/placement';
import { eligibleMask, partitionItems } from '../../src/core/maze/partition';
import type { PartitionInput } from '../../src/core/maze/partition';
import { generateMaze } from '../../src/core/maze/generate';
import { validateMaze } from '../../src/core/maze/validate';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { Tile } from '../../src/core/types';
import type { Cell, Maze } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const seedArb = fc.integer({ min: 0, max: 0x7fffffff });
const levelArb = fc.integer({ min: 1, max: 30 });
const opts = { numRuns: 40 };

function build(seed: number, level: number) {
  const carved = carveMaze(seed, level, 0, cfg);
  const starts = placeStarts(carved, seed, level, 0);
  const doorRes = placeDoors(carved, seed, level, 0, cfg, { exclude: startCells(starts) });
  const base = {
    width: carved.width,
    height: carved.height,
    tiles: doorRes.tiles,
    doors: doorRes.doors,
    cage: carved.cage,
    playerStart: starts.playerStart,
    hunterStart: starts.hunterStart,
  };
  const placement = placeItems(base, cfg, starts.rng);
  const special = [...placement.power, ...placement.speed, ...placement.bombs, ...placement.ghostHunt];
  const input: PartitionInput = { ...base, keys: placement.keys, special };
  const result = partitionItems(input, cfg, placement.rng);
  return { input, special, placement, result };
}

const idx = (w: number, c: Cell): number => c.y * w + c.x;
const stats = { wisps: [] as number[], ordinary: [] as number[], fraction: [] as number[], minWindow: Infinity };

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('partition', () => {
  it('is disjoint, covers exactly the eligible set and avoids reserved cells', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { input, special, result } = build(seed, level);
        const w = input.width;
        const wi = result.wisps.map((c) => idx(w, c));
        const oi = result.ordinary.map((c) => idx(w, c));
        const all = new Set([...wi, ...oi]);
        expect(all.size).toBe(wi.length + oi.length);
        const mask = eligibleMask(input);
        const eligible = new Set<number>();
        mask.forEach((v, i) => {
          if (v === 1) eligible.add(i);
        });
        expect(all).toEqual(eligible);
        const reserved = [
          input.playerStart,
          input.hunterStart,
          input.cage.entrance,
          ...input.keys,
          ...special,
        ];
        for (const c of reserved) expect(all.has(idx(w, c))).toBe(false);
        for (const i of all) expect(input.tiles[i]).toBe(Tile.Floor);
        stats.wisps.push(wi.length);
        stats.ordinary.push(oi.length);
        stats.fraction.push(wi.length / (wi.length + oi.length));
      }),
      opts,
    );
  });

  it('puts at least one of each kind in every block with 2 or more cells', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { input, result } = build(seed, level);
        const { width, height } = input;
        const b = cfg.itemBlock;
        const bx = Math.ceil(width / b);
        const wc = new Map<number, number>();
        const oc = new Map<number, number>();
        const blk = (c: Cell): number => Math.floor(c.y / b) * bx + Math.floor(c.x / b);
        for (const c of result.wisps) wc.set(blk(c), (wc.get(blk(c)) ?? 0) + 1);
        for (const c of result.ordinary) oc.set(blk(c), (oc.get(blk(c)) ?? 0) + 1);
        const ids = new Set([...wc.keys(), ...oc.keys()]);
        expect(ids.size).toBeLessThanOrEqual(bx * Math.ceil(height / b));
        for (const id of ids) {
          const w = wc.get(id) ?? 0;
          const o = oc.get(id) ?? 0;
          if (w + o >= 2) {
            expect(w).toBeGreaterThanOrEqual(1);
            expect(o).toBeGreaterThanOrEqual(1);
          } else if (w + o === 1) {
            expect(w === 1).toBe(id % 2 === 1);
          }
        }
      }),
      opts,
    );
  });

  it('leaves a key-path window with one kind only when the block minimum blocks every flip', { timeout: 300_000 }, () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const r = oneKindViolation(seed, level);
        expect(r.violation, JSON.stringify(r.violation)).toBeNull();
        expect(r.checked).toBeGreaterThan(0);
      }),
      opts,
    );
  });

  it('regression: seed 15 level 5 (fast-check seed -1419643758, path "3")', () => {
    const r = oneKindViolation(15, 5);
    expect(r.violation, JSON.stringify(r.violation)).toBeNull();
    expect(r.checked).toBeGreaterThan(0);
  });

  // Before the oscillation fix the raw partition for seed 26 level 1 failed with a one-kind path window and
  // generateMaze needed one repair. The repair now converges, so the raw partition is already valid.
  it('regression: seed 1210127378 level 3 (two windows share their only flippable cell); the generated maze is valid', () => {
    const r = oneKindViolation(1210127378, 3);
    expect(r.violation, JSON.stringify(r.violation)).toBeNull();
    const m = generateMaze(1210127378, 3, cfg);
    expect(validateMaze(m, cfg).ok, validateMaze(m, cfg).reason).toBe(true);
  });
  it('seed 26 level 1: the raw partition is already valid and generateMaze needs no coverage repair', () => {
    const { input, placement, result } = build(26, 1);
    const m = generateMaze(26, 1, cfg);
    const raw: Maze = {
      ...m,
      tiles: input.tiles,
      doors: [...input.doors],
      playerStart: input.playerStart,
      hunterStart: input.hunterStart,
      keys: [...input.keys],
      power: placement.power,
      speed: placement.speed,
      bombs: placement.bombs,
      ghostHunt: placement.ghostHunt,
      wisps: result.wisps,
      ordinary: result.ordinary,
    };
    expect(validateMaze(raw, cfg).ok, validateMaze(raw, cfg).reason).toBe(true);
    expect(validateMaze(m, cfg).ok).toBe(true);
    expect(m.generation.repairs).toBe(0);
    expect(m.wisps).toEqual(result.wisps);
    expect(m.ordinary).toEqual(result.ordinary);
  });

  it('keeps the wisp fraction close to wispDensity', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { result } = build(seed, level);
        const n = result.wisps.length + result.ordinary.length;
        expect(Math.abs(result.wisps.length / n - cfg.wispDensity)).toBeLessThanOrEqual(0.12);
      }),
      opts,
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const a = build(seed, level).result;
        const b = build(seed, level).result;
        expect(b).toEqual(a);
      }),
      { numRuns: 15 },
    );
  });

  it('reports summary stats', () => {
    const min = Math.min(...stats.wisps);
    expect(min).toBeGreaterThanOrEqual(1);
    expect(Math.min(...stats.ordinary)).toBeGreaterThanOrEqual(1);
    const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(min).toBeGreaterThanOrEqual(1);
    expect(Math.min(...stats.ordinary)).toBeGreaterThanOrEqual(1);
    console.log(
      `partition stats: wisps min=${min} mean=${mean(stats.wisps).toFixed(1)}; ` +
        `ordinary min=${Math.min(...stats.ordinary)} mean=${mean(stats.ordinary).toFixed(1)}; ` +
        `fraction min=${Math.min(...stats.fraction).toFixed(3)} mean=${mean(stats.fraction).toFixed(3)} ` +
        `max=${Math.max(...stats.fraction).toFixed(3)}; min per-window minority count=${stats.minWindow}`,
    );
  });
});

/** BFS with the same fixed neighbour order and tie-breaking as the partition (Doors open). */
function bfsPath(input: PartitionInput, from: number, to: number): number[] {
  const { width, height, tiles } = input;
  const open = (x: number, y: number): boolean => {
    const t = tiles[y * width + x];
    return t === Tile.Floor || t === Tile.Door || y * width + x === to;
  };
  const parent = new Int32Array(width * height).fill(-2);
  const q: number[] = [from];
  parent[from] = -1;
  for (let h = 0; h < q.length && parent[to] === -2; h++) {
    const cur = q[h]!;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const x = (cur % width) + dx;
      const y = Math.floor(cur / width) + dy;
      if (x < 0 || y < 0 || x >= width || y >= height || !open(x, y)) continue;
      const j = y * width + x;
      if (parent[j] !== -2) continue;
      parent[j] = cur;
      q.push(j);
    }
  }
  const path: number[] = [];
  for (let c = to; c !== -1; c = parent[c]!) path.push(c);
  return path.reverse();
}

interface OneKindViolation {
  from: Cell;
  to: Cell;
  windowStart: number;
  wisps: number;
  ordinary: number;
  cell: Cell;
  sameKindInBlock: number;
}

/**
 * Windows along the partition's own key paths (first-found BFS, fixed neighbour order). A window of
 * 3 or more eligible cells holding one kind only is allowed solely when no single flip can fix it:
 * every cell of that kind is either the only one of its kind in its block (block minimum) or would,
 * when flipped, turn another mixed key-path window into a one-kind window (seed 1210127378 level 3:
 * two windows share their only flippable cell). generateMaze then repairs or regenerates; its
 * output is checked by validateMaze (see the regression below).
 */
function oneKindViolation(seed: number, level: number): { checked: number; violation: OneKindViolation | null } {
  const { input, result } = build(seed, level);
  const { width } = input;
  const side = cfg.itemBlock;
  const blockIndex = (i: number): number =>
    Math.floor(i / width / side) * Math.ceil(width / side) + Math.floor((i % width) / side);
  const kind = new Map<number, number>();
  for (const c of result.wisps) kind.set(idx(width, c), 1);
  for (const c of result.ordinary) kind.set(idx(width, c), 2);
  const entrance = input.cage.entrance;
  const pairs: Array<[Cell, Cell]> = [
    [input.playerStart, entrance],
    [input.hunterStart, entrance],
    ...input.keys.flatMap((k): Array<[Cell, Cell]> => [
      [input.playerStart, k],
      [k, entrance],
    ]),
  ];
  const win = cfg.coverageWindow;
  const paths = pairs.map(([a, b]) => bfsPath(input, idx(width, a), idx(width, b)));
  /** True when flipping cell c turns some mixed window (2+ eligible cells) into a one-kind window. */
  const wouldBreak = (c: number): boolean => {
    const mine = kind.get(c)!;
    for (const p of paths) {
      const span = Math.min(win, p.length);
      for (let s = 0; s + span <= p.length; s++) {
        let same = 0;
        let other = 0;
        let has = false;
        for (let j = s; j < s + span; j++) {
          const k = kind.get(p[j]!);
          if (p[j] === c) has = true;
          if (k === mine) same++;
          else if (k !== undefined) other++;
        }
        if (has && same === 1 && other >= 1) return true;
      }
    }
    return false;
  };
  let checked = 0;
  for (let pi = 0; pi < pairs.length; pi++) {
    const [a, b] = pairs[pi]!;
    const p = paths[pi]!;
    const span = Math.min(win, p.length);
    for (let s = 0; s + span <= p.length; s++) {
      let w = 0;
      let o = 0;
      for (let j = s; j < s + span; j++) {
        const k = kind.get(p[j]!);
        if (k === 1) w++;
        else if (k === 2) o++;
      }
      if (w + o < 3) continue;
      checked++;
      stats.minWindow = Math.min(stats.minWindow, Math.min(w, o));
      if (w !== 0 && o !== 0) continue;
      const present = w === 0 ? 2 : 1;
      const sameInBlock = (i: number): number => {
        let same = 0;
        for (const [j, kj] of kind) if (kj === present && blockIndex(i) === blockIndex(j)) same++;
        return same;
      };
      for (let j = s; j < s + span; j++) {
        const c = p[j]!;
        if (kind.get(c) !== present) continue;
        const same = sameInBlock(c);
        if (same !== 1 && !wouldBreak(c)) {
          return { checked, violation: { from: a, to: b, windowStart: s, wisps: w, ordinary: o, cell: { x: c % width, y: Math.floor(c / width) }, sameKindInBlock: same } };
        }
      }
    }
  }
  return { checked, violation: null };
}

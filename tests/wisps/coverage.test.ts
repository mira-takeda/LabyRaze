import { afterAll, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { generateMaze } from '../../src/core/maze/generate';
import { quadrantOf } from '../../src/core/maze/placement';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { Tile } from '../../src/core/types';
import type { Cell, Maze } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
/** Stated threshold: every quadrant (about 100 cells) holds at least this many of each kind. */
const QUADRANT_MIN = 8;

const seedArb = fc.integer({ min: 0, max: 0x7fffffff });
const levelArb = fc.integer({ min: 1, max: 30 });

const quadWisps: number[] = [];
const quadOrdinary: number[] = [];
const winWisps: number[] = [];
const winOrdinary: number[] = [];
const playerWinWisps: number[] = [];
const hunterWinOrdinary: number[] = [];
let mazesChecked = 0;

const passable = (t: number): boolean =>
  t === Tile.Floor || t === Tile.CageInterior || t === Tile.CageGate || t === Tile.Door;

/** BFS shortest path (all Doors open), as cell indices. Empty when unreachable. */
function shortestPath(m: Maze, from: number, to: number): number[] {
  const { width, height, tiles } = m;
  const parent = new Int32Array(width * height).fill(-2);
  const queue: number[] = [from];
  parent[from] = -1;
  for (let h = 0; h < queue.length && parent[to] === -2; h++) {
    const cur = queue[h]!;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (parent[j] !== -2 || (j !== to && !passable(tiles[j]!))) continue;
      parent[j] = cur;
      queue.push(j);
    }
  }
  if (parent[to] === -2) return [];
  const path: number[] = [];
  for (let c = to; c !== -1; c = parent[c]!) path.push(c);
  return path.reverse();
}

const percentile = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const mean = (xs: number[]): number => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
const fmt = (label: string, xs: number[]): string =>
  `${label}: n=${xs.length} min=${xs.length ? Math.min(...xs) : NaN} p5=${percentile(xs, 0.05)} mean=${mean(xs).toFixed(2)}`;

function checkMaze(m: Maze): void {
  const w = m.width;
  const idx = (c: Cell): number => c.y * w + c.x;
  const wispSet = new Set(m.wisps.map(idx));
  const ordSet = new Set(m.ordinary.map(idx));

  // Disjointness.
  for (const i of wispSet) expect(ordSet.has(i)).toBe(false);
  expect(wispSet.size).toBe(m.wisps.length);
  expect(ordSet.size).toBe(m.ordinary.length);

  // Quadrant minimums (Player collects wisps, Squareman collects ordinary pellets).
  const qw = [0, 0, 0, 0];
  const qo = [0, 0, 0, 0];
  for (const c of m.wisps) {
    const q = quadrantOf(w, m.height, c);
    if (q >= 0) qw[q]!++;
  }
  for (const c of m.ordinary) {
    const q = quadrantOf(w, m.height, c);
    if (q >= 0) qo[q]!++;
  }
  for (let q = 0; q < 4; q++) {
    expect(qw[q]!).toBeGreaterThanOrEqual(QUADRANT_MIN);
    expect(qo[q]!).toBeGreaterThanOrEqual(QUADRANT_MIN);
    quadWisps.push(qw[q]!);
    quadOrdinary.push(qo[q]!);
  }

  // Blocks of side itemBlock with at least two eligible cells hold both kinds.
  const side = Math.max(1, Math.floor(cfg.itemBlock));
  const bx = Math.ceil(w / side);
  const by = Math.ceil(m.height / side);
  const bw = new Int32Array(bx * by);
  const bo = new Int32Array(bx * by);
  const blockOf = (i: number): number => Math.floor(i / w / side) * bx + Math.floor((i % w) / side);
  for (const i of wispSet) bw[blockOf(i)]!++;
  for (const i of ordSet) bo[blockOf(i)]!++;
  for (let b = 0; b < bw.length; b++) {
    if (bw[b]! + bo[b]! >= 2) {
      expect(bw[b]!).toBeGreaterThanOrEqual(1);
      expect(bo[b]!).toBeGreaterThanOrEqual(1);
    }
  }

  // Sliding windows along the key paths.
  const entrance = idx(m.cage.entrance);
  const player = idx(m.playerStart);
  const pairs: Array<{ a: number; b: number; hunter: boolean }> = [];
  for (const k of m.keys) {
    pairs.push({ a: player, b: idx(k), hunter: false });
    pairs.push({ a: idx(k), b: entrance, hunter: false });
  }
  pairs.push({ a: player, b: entrance, hunter: false });
  pairs.push({ a: idx(m.hunterStart), b: entrance, hunter: true });
  const win = Math.max(2, Math.floor(cfg.coverageWindow));
  for (const { a, b, hunter } of pairs) {
    const path = shortestPath(m, a, b);
    expect(path.length).toBeGreaterThan(0);
    const span = Math.min(win, path.length);
    for (let s = 0; s + span <= path.length; s++) {
      let nw = 0;
      let no = 0;
      for (let j = s; j < s + span; j++) {
        if (wispSet.has(path[j]!)) nw++;
        else if (ordSet.has(path[j]!)) no++;
      }
      if (nw + no < 2) continue; // fewer than two eligible cells: nothing to split
      expect(nw).toBeGreaterThanOrEqual(1);
      expect(no).toBeGreaterThanOrEqual(1);
      winWisps.push(nw);
      winOrdinary.push(no);
      if (hunter) hunterWinOrdinary.push(no);
      else playerWinWisps.push(nw);
    }
  }
  mazesChecked++;
}

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Feature: kirobit-halloween-maze, Property 43: Wisp and pellet coverage', () => {
  it('Feature: kirobit-halloween-maze, Property 43: Wisp and pellet coverage', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        checkMaze(generateMaze(seed, level, cfg));
      }),
      { numRuns: 60 },
    );
    expect(mazesChecked).toBeGreaterThanOrEqual(60);
    // Both characters have meaningful collectibles throughout the level.
    expect(Math.min(...quadWisps)).toBeGreaterThanOrEqual(QUADRANT_MIN); // Player
    expect(Math.min(...quadOrdinary)).toBeGreaterThanOrEqual(QUADRANT_MIN); // Squareman
    expect(playerWinWisps.length).toBeGreaterThan(0);
    expect(hunterWinOrdinary.length).toBeGreaterThan(0);
    expect(Math.min(...playerWinWisps)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...hunterWinOrdinary)).toBeGreaterThanOrEqual(1);
  }, 120_000);

  afterAll(() => {
    const report = (
      [
        `P43 statistics over ${mazesChecked} generated mazes (quadrant minimum k=${QUADRANT_MIN}, window=${cfg.coverageWindow}, block=${cfg.itemBlock})`,
        fmt('wisps per quadrant (Player)', quadWisps),
        fmt('ordinary per quadrant (Squareman)', quadOrdinary),
        fmt('wisps per window (all key paths)', winWisps),
        fmt('ordinary per window (all key paths)', winOrdinary),
        fmt('wisps per window (Player paths)', playerWinWisps),
        fmt('ordinary per window (Squareman path)', hunterWinOrdinary),
      ].join('\n')
    );
    process.stderr.write(`\n${report}\n`);
  });
});

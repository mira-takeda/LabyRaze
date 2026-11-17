import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { carveMaze } from '../../src/core/maze/carve';
import { findArticulationPoints, placeDoors } from '../../src/core/maze/doorPlacement';
import { partitionItems } from '../../src/core/maze/partition';
import { placeItems, placeStarts, startCells } from '../../src/core/maze/placement';
import { repairMaze } from '../../src/core/maze/repair';
import { bfsDistances, validateMaze } from '../../src/core/maze/validate';
import { Tile } from '../../src/core/types';
import type { Cell, Maze } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const idx = (m: Maze, c: Cell): number => c.y * m.width + c.x;

/** Real pipeline: carve -> starts -> doors -> items -> partition. */
function buildMaze(seed: number, level = 1, retry = 0): Maze {
  const carved = carveMaze(seed, level, retry, cfg);
  const starts = placeStarts(carved, seed, level, retry);
  const doorRes = placeDoors(carved, seed, level, retry, cfg, { exclude: startCells(starts) });
  const base = {
    width: carved.width,
    height: carved.height,
    tiles: doorRes.tiles,
    doors: doorRes.doors,
    cage: carved.cage,
    playerStart: starts.playerStart,
    hunterStart: starts.hunterStart,
  };
  const placed = placeItems(base, cfg, starts.rng);
  const part = partitionItems(
    { ...base, keys: placed.keys, special: [...placed.power, ...placed.speed, ...placed.bombs, ...placed.ghostHunt] },
    cfg,
    placed.rng,
  );
  return {
    width: base.width,
    height: base.height,
    tiles: base.tiles,
    doors: base.doors,
    wrapPairs: [],
    playerStart: base.playerStart,
    hunterStart: base.hunterStart,
    cage: base.cage,
    keys: placed.keys,
    ordinary: part.ordinary,
    power: placed.power,
    speed: placed.speed,
    bombs: placed.bombs,
    ghostHunt: placed.ghostHunt,
    wisps: part.wisps,
    generation: { attempts: 1, repairs: 0 },
  };
}

function clone(m: Maze): Maze {
  const cp = (cs: Cell[]): Cell[] => cs.map((c) => ({ ...c }));
  return {
    ...m,
    tiles: m.tiles.slice(),
    doors: m.doors.map((d) => ({ ...d, cell: { ...d.cell } })),
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
  };
}

function validMaze(skip = 0): Maze {
  let seen = 0;
  for (let seed = 1; seed < 80; seed++) {
    const m = buildMaze(seed);
    if (validateMaze(m, cfg).ok && seen++ >= skip) return m;
  }
  throw new Error('no valid maze found');
}

const counts = (m: Maze): number[] => [m.keys.length, m.power.length, m.speed.length, m.bombs.length, m.ghostHunt.length, m.doors.length];

/** Moves item `from` (in `list`) onto a free Cell chosen by `want`; the old Cell becomes an ordinary pellet. */
function relocate(m: Maze, list: Cell[], n: number, want: (p: number, h: number) => boolean): void {
  const dp = bfsDistances(m, [m.playerStart]);
  const dh = bfsDistances(m, [m.hunterStart]);
  const pool = [...m.ordinary, ...m.wisps];
  const pick = pool.find((c) => want(dp[idx(m, c)]!, dh[idx(m, c)]!));
  expect(pick).toBeDefined();
  m.ordinary = m.ordinary.filter((c) => !same(c, pick!));
  m.wisps = m.wisps.filter((c) => !same(c, pick!));
  m.ordinary.push({ ...list[n]! });
  list[n] = { ...pick! };
}

function expectRepaired(broken: Maze, failedBefore: string): ReturnType<typeof repairMaze> {
  expect(validateMaze(broken, cfg).failed).toBe(failedBefore);
  const r = repairMaze(broken, cfg, 7, 1, 0);
  expect(r.ok).toBe(true);
  expect(validateMaze(r.maze, cfg).ok).toBe(true);
  expect(counts(r.maze)).toEqual(counts(broken));
  return r;
}

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('repairMaze on broken mazes', () => {
  it('leaves a valid maze untouched', () => {
    const m = validMaze();
    const r = repairMaze(m, cfg, 7, 1, 0);
    expect(r.ok).toBe(true);
    expect(r.repairs).toBe(0);
    expect(r.passes).toEqual([]);
    expect(r.maze).toEqual(m);
  });

  it('does not mutate its input', () => {
    const m = clone(validMaze());
    relocate(m, m.keys, 0, (p, h) => p - h > cfg.keyFairnessDelta + 2);
    const before = clone(m);
    repairMaze(m, cfg, 7, 1, 0);
    expect(m).toEqual(before);
  });

  it('pass C fixes an unfair key', () => {
    const m = clone(validMaze());
    relocate(m, m.keys, 0, (p, h) => p - h > cfg.keyFairnessDelta + 2);
    const r = expectRepaired(m, '7');
    expect(r.passes).toContain('C');
  });

  it('pass C fixes an unfair speed pellet', () => {
    const m = clone(validMaze());
    relocate(m, m.speed, 0, (p, h) => p >= 0 && h >= 0 && Math.abs(p - h) > cfg.speedFairnessDelta + 2);
    expectRepaired(m, '7');
  });

  it('pass C fixes a bomb that favours the hunter', () => {
    const m = clone(validMaze());
    relocate(m, m.bombs, 0, (p, h) => p >= cfg.bombMinStartDist && h - p < -(cfg.bombFairnessDelta + 2));
    expectRepaired(m, '7');
  });

  it('pass C fixes an unfair ghost hunt item', () => {
    const m = clone(validMaze());
    relocate(m, m.ghostHunt, 0, (p, h) => p >= 0 && h - p < -(cfg.bombFairnessDelta + 2));
    expectRepaired(m, '7');
  });

  it('pass C restores missing wisp/pellet coverage', () => {
    const m = clone(validMaze());
    m.ordinary = [...m.ordinary, ...m.wisps];
    m.wisps = [];
    const r = expectRepaired(m, '7a');
    expect(r.maze.wisps.length).toBeGreaterThan(0);
  });

  it('pass A reconnects an isolated region and the result validates', () => {
    const m = clone(validMaze());
    const special = [m.playerStart, m.hunterStart, m.cage.entrance, ...m.keys, ...m.power, ...m.speed, ...m.bombs, ...m.ghostHunt];
    // Isolate a plain pellet Cell that no start, key or special item touches.
    const target = [...m.ordinary, ...m.wisps].find((c) =>
      special.every((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) > 2),
    )!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const i = (target.y + dy) * m.width + (target.x + dx);
      if (m.tiles[i] === Tile.Floor) m.tiles[i] = Tile.Wall;
    }
    const r = expectRepaired(m, '1');
    expect(r.passes[0]).toBe('A');
  });

  it('pass B replaces a Door that strands part of the maze', () => {
    // Move a Door onto a corridor cut vertex so a single closure splits the maze.
    for (let skip = 0; skip < 6; skip++) {
      const m = clone(validMaze(skip));
      const open = m.tiles.slice();
      for (let i = 0; i < open.length; i++) if (open[i] === Tile.Door) open[i] = Tile.Floor;
      const art = findArticulationPoints(m.width, m.height, open);
      const pick = [...m.ordinary, ...m.wisps].find((c) => art[idx(m, c)] === 1);
      if (!pick) continue;
      const old = m.doors[0]!.cell;
      m.tiles[idx(m, old)] = Tile.Floor;
      m.ordinary = m.ordinary.filter((c) => !same(c, pick));
      m.wisps = m.wisps.filter((c) => !same(c, pick));
      m.ordinary.push({ ...old });
      m.tiles[idx(m, pick)] = Tile.Door;
      m.doors[0] = { ...m.doors[0]!, cell: { ...pick } };
      if (validateMaze(m, cfg).failed !== '5') continue;
      const r = expectRepaired(m, '5');
      expect(r.passes).toContain('B');
      return;
    }
    throw new Error('could not build a door-safety failure');
  });
});

describe('repairMaze properties', () => {
  it('is deterministic', () => {
    const m = clone(validMaze());
    relocate(m, m.keys, 0, (p, h) => p - h > cfg.keyFairnessDelta + 2);
    const a = repairMaze(m, cfg, 11, 2, 1);
    const b = repairMaze(m, cfg, 11, 2, 1);
    expect(b.maze).toEqual(a.maze);
    expect(b.repairs).toBe(a.repairs);
  });

  it('stays within maxRepairs', () => {
    const m = clone(validMaze());
    m.ordinary = [...m.ordinary, ...m.wisps];
    m.wisps = [];
    for (const limit of [0, 1, 2, 50]) {
      const r = repairMaze(m, cfg, 3, 1, 0, { maxRepairs: limit });
      expect(r.repairs).toBeLessThanOrEqual(limit);
    }
    expect(repairMaze(m, { ...cfg, maxRepairs: 1 }, 3, 1, 0).repairs).toBeLessThanOrEqual(1);
  });

  it('never changes item counts and keeps repaired mazes valid across seeds', () => {
    const histogram = new Map<string, number>();
    let before = 0;
    let after = 0;
    let total = 0;
    let ms = 0;
    let slowest = 0;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), (seed) => {
        total++;
        const raw = buildMaze(seed);
        if (validateMaze(raw, cfg).ok) before++;
        const t0 = performance.now();
        const r = repairMaze(raw, cfg, seed, 1, 0);
        const dt = performance.now() - t0;
        ms += dt;
        slowest = Math.max(slowest, dt);
        expect(counts(r.maze)).toEqual(counts(raw));
        expect(r.repairs).toBeLessThanOrEqual(cfg.maxRepairs);
        expect(r.ok).toBe(validateMaze(r.maze, cfg).ok);
        if (r.ok) after++;
        else {
          const k = `${r.report.failed}: ${r.report.reason.replace(/\(\d+,\d+\)/g, '(x,y)').replace(/\d+/g, 'N')}`;
          histogram.set(k, (histogram.get(k) ?? 0) + 1);
        }
        return true;
      }),
      { numRuns: 100 },
    );
    console.log(`repair pass rate before ${before}/${total}, after ${after}/${total} = ${((after / total) * 100).toFixed(1)}%`);
    console.log(`repair remaining failures ${JSON.stringify(Object.fromEntries(histogram), null, 1)}`);
    console.log(`repair time per maze (repair only): mean ${(ms / total).toFixed(2)} ms, max ${slowest.toFixed(2)} ms`);
    expect(after / total).toBeGreaterThanOrEqual(0.95);
  }, 300_000);
});

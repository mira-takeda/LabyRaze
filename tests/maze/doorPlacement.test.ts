import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { carveMaze } from '../../src/core/maze/carve';
import type { CarvedMaze } from '../../src/core/maze/carve';
import {
  DOOR_EXCLUSION_RADIUS,
  DOOR_MIN_SPACING,
  doorSetKeepsConnectivity,
  findArticulationPoints,
  placeDoors,
} from '../../src/core/maze/doorPlacement';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { scheduleAt } from '../../src/core/doors';
import { Tile } from '../../src/core/types';
import type { Cell } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const carve = (seed: number, level = 1, size = 21): CarvedMaze =>
  carveMaze(seed, level, 0, { ...cfg, mazeSize: { w: size, h: size } });
const place = (m: CarvedMaze, seed: number, level = 1, exclude: Cell[] = []) =>
  placeDoors(m, seed, level, 0, cfg, { exclude });

const seedArb = fc.integer({ min: 0, max: 0x7fffffff });
const levelArb = fc.integer({ min: 1, max: 50 });
const opts = { numRuns: 40 };

const idxOf = (m: CarvedMaze, c: Cell): number => c.y * m.width + c.x;

function passable(t: number): boolean {
  return t === Tile.Floor || t === Tile.CageInterior || t === Tile.CageGate;
}

/** Graph distances over passable tiles (Door tiles count as open floor). */
function distances(m: CarvedMaze, tiles: Uint8Array, from: number): Int32Array {
  const d = new Int32Array(tiles.length).fill(-1);
  const q = [from];
  d[from] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (const n of [c - 1, c + 1, c - m.width, c + m.width]) {
      if (n < 0 || n >= tiles.length || d[n] !== -1) continue;
      if (!passable(tiles[n]!) && tiles[n] !== Tile.Door) continue;
      d[n] = d[c]! + 1;
      q.push(n);
    }
  }
  return d;
}

/** Independent connectivity oracle with the given cells treated as walls. */
function connectedClosing(m: CarvedMaze, tiles: Uint8Array, closed: number[]): boolean {
  const ok = (i: number) => (passable(tiles[i]!) || tiles[i] === Tile.Door) && !closed.includes(i);
  let start = -1;
  let total = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (ok(i)) {
      total++;
      if (start === -1) start = i;
    }
  }
  const seen = new Set<number>([start]);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (const n of [c - 1, c + 1, c - m.width, c + m.width]) {
      if (n < 0 || n >= tiles.length || seen.has(n) || !ok(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen.size === total;
}

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('findArticulationPoints', () => {
  it('flags the middle of a path and nothing on a cycle', () => {
    // 5x3 grid, row 1 open from x=1..3 (path): middle cell is an articulation point.
    const path = new Uint8Array(15).fill(Tile.WallHard);
    for (const x of [1, 2, 3]) path[5 + x] = Tile.Floor;
    expect(findArticulationPoints(5, 3, path)[7]).toBe(1);
    // 4x4 ring of floor cells around a 2x2 wall block: no articulation points.
    const ring = new Uint8Array(16).fill(Tile.Floor);
    ring[5] = ring[6] = ring[9] = ring[10] = Tile.WallHard;
    expect(findArticulationPoints(4, 4, ring).some((v) => v === 1)).toBe(false);
  });
});

describe('placeDoors', () => {
  it('places doorCount Doors on non-articulation Floor cells and marks them Tile.Door', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const m = carve(seed, level);
        const art = findArticulationPoints(m.width, m.height, m.tiles);
        const r = place(m, seed, level);
        expect(r.complete).toBe(true);
        expect(r.doors).toHaveLength(cfg.doorCount);
        for (const d of r.doors) {
          const i = idxOf(m, d.cell);
          expect(m.tiles[i]).toBe(Tile.Floor);
          expect(art[i]).toBe(0);
          expect(r.tiles[i]).toBe(Tile.Door);
        }
        const doorTiles = Array.from(r.tiles).filter((t) => t === Tile.Door).length;
        expect(doorTiles).toBe(cfg.doorCount);
        // Input is not mutated; Door is a distinct tile from destructible Wall.
        expect(Array.from(m.tiles).includes(Tile.Door)).toBe(false);
        expect(Tile.Door).not.toBe(Tile.Wall);
      }),
      opts,
    );
  });

  it('keeps Doors at least spacingUsed apart and clear of the Cage entrance and excluded cells', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const m = carve(seed, level);
        const start = { x: 1, y: 1 };
        const r = place(m, seed, level, [start]);
        expect(r.spacingUsed).toBeGreaterThanOrEqual(1);
        expect(r.spacingUsed).toBeLessThanOrEqual(DOOR_MIN_SPACING);
        const entranceD = distances(m, r.tiles, idxOf(m, m.cage.entrance));
        const startD = distances(m, r.tiles, idxOf(m, start));
        const cells = r.doors.map((d) => idxOf(m, d.cell));
        for (let a = 0; a < cells.length; a++) {
          expect(entranceD[cells[a]!]).toBeGreaterThan(DOOR_EXCLUSION_RADIUS);
          expect(startD[cells[a]!]).toBeGreaterThan(DOOR_EXCLUSION_RADIUS);
          const da = distances(m, r.tiles, cells[a]!);
          for (let b = a + 1; b < cells.length; b++) {
            expect(da[cells[b]!]).toBeGreaterThanOrEqual(r.spacingUsed);
          }
        }
      }),
      opts,
    );
  });

  it('uses the preferred spacing on the default 21x21 maze for most seeds', () => {
    let preferred = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (place(carve(seed), seed).spacingUsed === DOOR_MIN_SPACING) preferred++;
    }
    expect(preferred).toBeGreaterThanOrEqual(15);
  });

  it('keeps the passable graph connected with every single and every pair of Doors closed', () => {
    fc.assert(
      fc.property(seedArb, levelArb, fc.constantFrom(21, 25), (seed, level, size) => {
        const m = carve(seed, level, size);
        const r = place(m, seed, level);
        const cells = r.doors.map((d) => idxOf(m, d.cell));
        expect(connectedClosing(m, r.tiles, [])).toBe(true);
        for (let a = 0; a < cells.length; a++) {
          expect(connectedClosing(m, r.tiles, [cells[a]!])).toBe(true);
          for (let b = a + 1; b < cells.length; b++) {
            expect(connectedClosing(m, r.tiles, [cells[a]!, cells[b]!])).toBe(true);
          }
        }
        expect(doorSetKeepsConnectivity(m.width, m.height, m.tiles, cells)).toBe(true);
      }),
      opts,
    );
  });

  it('draws openRatio and period inside the configured ranges', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        for (const d of place(carve(seed, level), seed, level).doors) {
          expect(d.openRatio).toBeGreaterThanOrEqual(cfg.doorMinOpenRatio);
          expect(d.openRatio).toBeLessThanOrEqual(1);
          expect(d.period).toBeGreaterThanOrEqual(cfg.doorPeriod.min);
          expect(d.period).toBeLessThanOrEqual(cfg.doorPeriod.max);
          expect(Number.isInteger(d.period) && Number.isInteger(d.phaseOffset)).toBe(true);
        }
      }),
      opts,
    );
  });

  it('chooses phase offsets so the first scheduled change is outside the warn window at tick 0', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const r = place(carve(seed, level), seed, level);
        for (const d of r.doors) {
          const s = scheduleAt(d, 0);
          expect(s.nextChangeIn).toBeGreaterThan(cfg.doorWarnTicks);
          expect(s.open).toBe(true);
        }
      }),
      opts,
    );
  });

  it('is deterministic and varies with the seed', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const m = carve(seed, level);
        const a = place(m, seed, level);
        const b = place(carve(seed, level), seed, level);
        expect(b.doors).toEqual(a.doors);
        expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles));
        expect(b.rng).toBe(a.rng);
      }),
      opts,
    );
    const doorsFor = (s: number) => place(carve(s), s).doors.map((d) => `${d.cell.x},${d.cell.y}`).join('|');
    expect(doorsFor(1)).not.toBe(doorsFor(2));
  });
});

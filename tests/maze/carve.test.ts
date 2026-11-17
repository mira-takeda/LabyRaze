import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { carveMaze } from '../../src/core/maze/carve';
import type { CarvedMaze } from '../../src/core/maze/carve';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { Tile } from '../../src/core/types';

const sizes = [21, 25] as const;
const cfgFor = (n: number) => ({ ...DEFAULT_CONFIG, mazeSize: { w: n, h: n } });
const gen = (seed: number, level = 1, size = 21): CarvedMaze => carveMaze(seed, level, 0, cfgFor(size));
const at = (m: CarvedMaze, x: number, y: number): number => m.tiles[y * m.width + x]!;

const seedArb = fc.integer({ min: 0, max: 0x7fffffff });
const sizeArb = fc.constantFrom(...sizes);
const opts = { numRuns: 30 };

function floorCells(m: CarvedMaze): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === Tile.Floor) out.push(i);
  return out;
}

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('carveMaze', () => {
  it('is deterministic for the same seed', () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 1, max: 5 }), sizeArb, (seed, level, size) => {
        const a = gen(seed, level, size);
        const b = gen(seed, level, size);
        expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
        expect(a.rng).toBe(b.rng);
        expect(a.cage).toEqual(b.cage);
      }),
      opts,
    );
  });

  it('produces different layouts for different seeds', () => {
    expect(Array.from(gen(1).tiles)).not.toEqual(Array.from(gen(2).tiles));
  });

  it('makes the whole outer boundary WallHard', () => {
    fc.assert(
      fc.property(seedArb, sizeArb, (seed, size) => {
        const m = gen(seed, 1, size);
        for (let i = 0; i < size; i++) {
          expect(at(m, i, 0)).toBe(Tile.WallHard);
          expect(at(m, i, size - 1)).toBe(Tile.WallHard);
          expect(at(m, 0, i)).toBe(Tile.WallHard);
          expect(at(m, size - 1, i)).toBe(Tile.WallHard);
        }
      }),
      opts,
    );
  });

  it('centres the Cage and has exactly one gate adjacent to floor', () => {
    fc.assert(
      fc.property(seedArb, sizeArb, (seed, size) => {
        const m = gen(seed, 1, size);
        const c = (size - 1) / 2;
        const xs = m.cage.interior.map((p) => p.x);
        const ys = m.cage.interior.map((p) => p.y);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(c);
        expect((Math.min(...ys) + Math.max(...ys)) / 2).toBe(c);
        for (const p of m.cage.interior) expect(at(m, p.x, p.y)).toBe(Tile.CageInterior);

        // Exactly one gate tile, and it is the Cage entrance.
        let gates = 0;
        for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === Tile.CageGate) gates++;
        expect(gates).toBe(1);
        expect(at(m, m.cage.entrance.x, m.cage.entrance.y)).toBe(Tile.CageGate);

        // Cage cells touch outside floor only through the gate.
        const { x0, x1, y0, y1 } = m.cageBlock;
        let contacts = 0;
        for (let y = y0 - 1; y <= y1 + 1; y++) {
          for (let x = x0 - 1; x <= x1 + 1; x++) {
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
            if (at(m, x, y) !== Tile.Floor) continue;
            for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
              const t = at(m, x + dx, y + dy);
              if (t === Tile.CageGate) contacts++;
              expect(t).not.toBe(Tile.CageInterior);
            }
          }
        }
        expect(contacts).toBe(1);

        // Perimeter other than the gate is WallHard.
        for (let x = x0; x <= x1; x++) {
          for (const y of [y0, y1]) {
            if (x === m.cage.entrance.x && y === m.cage.entrance.y) continue;
            expect(at(m, x, y)).toBe(Tile.WallHard);
          }
        }
        for (let y = y0; y <= y1; y++) {
          expect(at(m, x0, y)).toBe(Tile.WallHard);
          expect(at(m, x1, y)).toBe(Tile.WallHard);
        }
      }),
      opts,
    );
  });

  it('connects every floor cell, the gate and the Cage interior (BFS)', () => {
    fc.assert(
      fc.property(seedArb, sizeArb, (seed, size) => {
        const m = gen(seed, 1, size);
        const passable = (t: number) => t === Tile.Floor || t === Tile.CageGate || t === Tile.CageInterior;
        const start = m.cage.entrance.y * size + m.cage.entrance.x;
        const seen = new Uint8Array(m.tiles.length);
        const q = [start];
        seen[start] = 1;
        while (q.length) {
          const c = q.pop()!;
          for (const n of [c - 1, c + 1, c - size, c + size]) {
            if (n >= 0 && n < m.tiles.length && !seen[n] && passable(m.tiles[n]!)) {
              seen[n] = 1;
              q.push(n);
            }
          }
        }
        for (let i = 0; i < m.tiles.length; i++) {
          if (passable(m.tiles[i]!)) expect(seen[i]).toBe(1);
        }
      }),
      opts,
    );
  });

  it('contains cycles (not a pure tree) and few dead ends', () => {
    fc.assert(
      fc.property(seedArb, sizeArb, (seed, size) => {
        const m = gen(seed, 1, size);
        const floors = floorCells(m);
        let edges = 0;
        let deadEnds = 0;
        for (const c of floors) {
          let deg = 0;
          for (const n of [c + 1, c + size, c - 1, c - size]) {
            if (m.tiles[n] === Tile.Floor) {
              deg++;
              if (n === c + 1 || n === c + size) edges++;
            }
          }
          if (deg <= 1) deadEnds++;
        }
        const cycles = edges - floors.length + 1; // floor graph is connected
        expect(cycles).toBeGreaterThan(0);
        expect(m.loopsAdded).toBeGreaterThan(0);
        // Dead ends are strictly rarer than in a perfect maze of the same size.
        expect(deadEnds).toBeLessThan(floors.length / 4);
      }),
      opts,
    );
  });

  it('leaves every other wall a destructible Wall and uses only known tiles', () => {
    fc.assert(
      fc.property(seedArb, sizeArb, (seed, size) => {
        const m = gen(seed, 1, size);
        const { x0, x1, y0, y1 } = m.cageBlock;
        let walls = 0;
        for (let y = 1; y < size - 1; y++) {
          for (let x = 1; x < size - 1; x++) {
            const t = at(m, x, y);
            const inCage = x >= x0 && x <= x1 && y >= y0 && y <= y1;
            if (inCage) continue;
            expect([Tile.Floor, Tile.Wall]).toContain(t);
            if (t === Tile.Wall) walls++;
          }
        }
        expect(walls).toBeGreaterThan(0);
      }),
      opts,
    );
  });

  it('generates a 21x21 maze quickly', () => {
    const t0 = performance.now();
    const n = 50;
    for (let i = 0; i < n; i++) gen(i);
    const avg = (performance.now() - t0) / n;
    console.log(`carveMaze 21x21 average: ${avg.toFixed(3)} ms`);
    expect(avg).toBeLessThan(50);
  });
});

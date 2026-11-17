import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_UNITS, DEFAULT_CONFIG } from '../../src/core/config';
import { detonate } from '../../src/core/bombs';
import { carveMaze } from '../../src/core/maze/carve';
import { Tile } from '../../src/core/types';
import type { Cell, WallLayer } from '../../src/core/types';
import { allFixtureMazes, mazeFromAscii } from '../helpers/fixtures';

interface Sample {
  name: string;
  width: number;
  height: number;
  tiles: Uint8Array;
}

const carveCfg = { ...DEFAULT_CONFIG, mazeSize: { w: 21, h: 21 } };
const fixtureSamples: Sample[] = allFixtureMazes().map((m, i) => ({
  name: `fixture${i}`,
  width: m.width,
  height: m.height,
  tiles: m.tiles,
}));
const carvedSamples: Sample[] = [1, 2, 3, 4, 5, 6].map((seed) => {
  const c = carveMaze(seed, 1, 0, carveCfg);
  return { name: `carved${seed}`, width: c.width, height: c.height, tiles: c.tiles };
});
const samples = [...fixtureSamples, ...carvedSamples];

const keys = (cells: Cell[]) => cells.map((c) => `${c.x},${c.y}`).sort();
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Independent brute force: Wall cells whose centre is within the radius of the exact position. */
function bruteForce(s: Sample, cell: Cell, next: Cell | null, progress: number, radius: number): string[] {
  const px = cell.x * CELL_UNITS + (next ? (next.x - cell.x) * progress : 0);
  const py = cell.y * CELL_UNITS + (next ? (next.y - cell.y) * progress : 0);
  const r = Math.round(radius * CELL_UNITS);
  const out: Cell[] = [];
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (s.tiles[y * s.width + x] !== Tile.Wall) continue;
      const dx = x * CELL_UNITS - px;
      const dy = y * CELL_UNITS - py;
      if (dx * dx + dy * dy <= r * r) out.push({ x, y });
    }
  }
  return keys(out);
}

const layerOf = (s: Sample): WallLayer => ({ tiles: s.tiles.slice(), version: 0, destroyed: 0 });
const passable = (s: Sample, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.width && y < s.height && s.tiles[y * s.width + x] === Tile.Floor;

describe('blast set', () => {
  it('Feature: kirobit-halloween-maze, Property 31: Blast destroys exactly the destructible walls in range', () => {
    // Validates: Requirements 28.1, 28.2, 28.3, 28.4
    fc.assert(
      fc.property(
        fc.nat({ max: samples.length - 1 }),
        fc.nat({ max: 100000 }),
        fc.nat({ max: 3 }),
        fc.integer({ min: 0, max: CELL_UNITS }),
        fc.integer({ min: 1, max: 6000 }),
        fc.boolean(),
        (si, pick, dirPick, progress, radiusMilli, moving) => {
          const s = samples[si]!;
          const floors: Cell[] = [];
          for (let y = 0; y < s.height; y++) {
            for (let x = 0; x < s.width; x++) if (passable(s, x, y)) floors.push({ x, y });
          }
          const cell = floors[pick % floors.length]!;
          let next: Cell | null = null;
          if (moving) {
            for (let k = 0; k < 4; k++) {
              const d = DIRS[(dirPick + k) % 4]!;
              if (passable(s, cell.x + d[0], cell.y + d[1])) {
                next = { x: cell.x + d[0], y: cell.y + d[1] };
                break;
              }
            }
          }
          const radius = radiusMilli / 1000;
          const w = layerOf(s);
          const before = w.tiles.slice();
          const r = detonate(w, s.width, s.height, { cell, next, progress: next ? progress : 0 }, radius);
          const expected = bruteForce(s, cell, next, next ? progress : 0, radius);

          expect(keys(r.destroyed)).toEqual(expected);
          const gone = new Set(expected);
          for (let i = 0; i < before.length; i++) {
            const x = i % s.width;
            const y = Math.floor(i / s.width);
            const after = r.walls.tiles[i]!;
            if (gone.has(`${x},${y}`)) expect(after).toBe(Tile.Floor);
            else expect(after).toBe(before[i]);
          }
          expect(w.tiles).toEqual(before);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('passes through walls: a wall behind another wall is destroyed', () => {
    const m = mazeFromAscii(['HHHHHHH', 'H.###.H', 'HHHHHHH']);
    const w: WallLayer = { tiles: m.tiles.slice(), version: 0, destroyed: 0 };
    const r = detonate(w, m.width, m.height, { cell: { x: 1, y: 1 }, next: null, progress: 0 }, 3);
    expect(keys(r.destroyed)).toEqual(['2,1', '3,1', '4,1']);
  });

  it('uses the mid-step centre', () => {
    const m = mazeFromAscii(['HHHHHHH', 'H.....H', 'H#...#H', 'HHHHHHH']);
    const w: WallLayer = { tiles: m.tiles.slice(), version: 0, destroyed: 0 };
    // Centre at x = 3.5 cells, y = 1: walls at (1,2) and (5,2) are both 2.5 / 1.5 away horizontally.
    const p = { cell: { x: 3, y: 1 }, next: { x: 4, y: 1 }, progress: 500 };
    // Radius 2.2: (5,2) dx=1.5, dy=1 -> d2=3.25 <= 4.84 hit; (1,2) dx=2.5 -> d2=7.25 > 4.84 miss.
    const r = detonate(w, m.width, m.height, p, 2.2);
    expect(keys(r.destroyed)).toEqual(['5,2']);
  });

  it('radius 2.5 on a single wall layer', () => {
    const m = mazeFromAscii(['HHHHHHHHH', 'H.......H', 'H#######H', 'HHHHHHHHH']);
    const w: WallLayer = { tiles: m.tiles.slice(), version: 0, destroyed: 0 };
    const r = detonate(w, m.width, m.height, { cell: { x: 4, y: 1 }, next: null, progress: 0 }, 2.5);
    // dy = 1 so dx^2 <= 6.25 - 1 = 5.25 -> |dx| <= 2: x = 2..6.
    expect(keys(r.destroyed)).toEqual(['2,2', '3,2', '4,2', '5,2', '6,2']);
    expect(r.walls.tiles[2 * m.width + 1]).toBe(Tile.Wall);
    expect(r.walls.tiles[2 * m.width + 7]).toBe(Tile.Wall);
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_UNITS } from '../../src/core/config';
import { consumeBomb, detonate, pickupBomb, playerPositionUnits, radiusUnits } from '../../src/core/bombs';
import { Tile } from '../../src/core/types';
import type { Cell, WallLayer } from '../../src/core/types';
import { cageMaze } from '../helpers/fixtures';

const maze = cageMaze();
const { width, height } = maze;
const layer = (): WallLayer => ({ tiles: maze.tiles.slice(), version: 0, destroyed: 0 });
const at = (cell: Cell, next: Cell | null = null, progress = 0) => ({ cell, next, progress });

/** Independent reference: float-free brute force over every cell. */
function reference(tiles: Uint8Array, cell: Cell, next: Cell | null, progress: number, radius: number): Cell[] {
  const px = cell.x * CELL_UNITS + (next ? (next.x - cell.x) * progress : 0);
  const py = cell.y * CELL_UNITS + (next ? (next.y - cell.y) * progress : 0);
  const r = Math.round(radius * CELL_UNITS);
  const out: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y * width + x] !== Tile.Wall) continue;
      const dx = x * CELL_UNITS - px;
      const dy = y * CELL_UNITS - py;
      if (dx * dx + dy * dy <= r * r) out.push({ x, y });
    }
  }
  return out;
}

const keys = (cells: Cell[]) => cells.map((c) => `${c.x},${c.y}`).sort();

describe('pickupBomb', () => {
  it.each([
    [0, 1, true],
    [1, 2, true],
    [2, 3, true],
    [3, 3, false],
  ])('inventory %i -> %i (collected=%s)', (inv, expected, collected) => {
    expect(pickupBomb(inv, 3)).toEqual({ inventory: expected, collected });
  });
});

describe('consumeBomb', () => {
  it('does nothing at 0', () => {
    expect(consumeBomb(0)).toEqual({ inventory: 0, consumed: false });
  });
  it('spends one', () => {
    expect(consumeBomb(3)).toEqual({ inventory: 2, consumed: true });
  });
});

describe('detonate', () => {
  it('passes through walls (hits walls behind other walls)', () => {
    // Row 2 has walls at x = 4, 5, 6. From (3,2): (4,2) adjacent, (5,2) behind it is
    // destroyed too, (6,2) is 3 away and survives.
    const w = layer();
    const r = detonate(w, width, height, at({ x: 3, y: 2 }), 2.5);
    expect(keys(r.destroyed)).toContain('4,2');
    expect(keys(r.destroyed)).toContain('5,2');
    expect(keys(r.destroyed)).not.toContain('6,2');
  });

  it('uses the exact mid-step centre', () => {
    const w = layer();
    // Half-way between (1,3) and (2,3): centre at x = 1500, y = 3000.
    const p = at({ x: 1, y: 3 }, { x: 2, y: 3 }, 500);
    expect(playerPositionUnits(p)).toEqual({ x: 1500, y: 3000 });
    const r = detonate(w, width, height, p, 1.5);
    expect(keys(r.destroyed)).toEqual(keys(reference(w.tiles, p.cell, p.next, 500, 1.5)));
    // (2,2): dx=500, dy=1000 -> inside 1.5; (1,2)... (3,2): dx=1500, dy=1000 -> outside.
    expect(keys(r.destroyed)).toContain('2,2');
    expect(keys(r.destroyed)).not.toContain('3,2');
  });

  it('radius 2.5 matches the brute-force set on fixture walls', () => {
    for (const c of [{ x: 1, y: 1 }, { x: 5, y: 3 }, { x: 5, y: 7 }, { x: 9, y: 9 }]) {
      const w = layer();
      const r = detonate(w, width, height, at(c), 2.5);
      expect(keys(r.destroyed)).toEqual(keys(reference(w.tiles, c, null, 0, 2.5)));
      expect(r.destroyed.length).toBeGreaterThan(0);
    }
  });

  it('preserves WallHard, CageGate, CageInterior and Door', () => {
    const w = layer();
    // Centre near the cage and the boundary with a large radius.
    const r = detonate(w, width, height, at({ x: 5, y: 5 }), 6);
    for (let i = 0; i < w.tiles.length; i++) {
      const t = w.tiles[i];
      if (t !== Tile.Wall) expect(r.walls.tiles[i]).toBe(t);
    }
    expect(r.walls.tiles[4 * width + 5]).toBe(Tile.CageGate);
    expect(r.walls.tiles[5 * width + 4]).toBe(Tile.CageInterior);
    expect(r.walls.tiles[6 * width + 4]).toBe(Tile.WallHard);
    const near = detonate(w, width, height, at({ x: 5, y: 8 }), 2.5);
    expect(near.walls.tiles[9 * width + 5]).toBe(Tile.Door);
  });

  it('is copy-on-write and bumps version only when n > 0', () => {
    const w = layer();
    const before = w.tiles.slice();
    const hit = detonate(w, width, height, at({ x: 1, y: 3 }), 2.5);
    expect(hit.destroyed.length).toBeGreaterThan(0);
    expect(hit.walls).not.toBe(w);
    expect(hit.walls.tiles).not.toBe(w.tiles);
    expect(w.tiles).toEqual(before);
    expect(w.version).toBe(0);
    expect(hit.walls.version).toBe(1);
    expect(hit.walls.destroyed).toBe(hit.destroyed.length);
    for (const c of hit.destroyed) expect(hit.walls.tiles[c.y * width + c.x]).toBe(Tile.Floor);

    // Nothing in range: same object back, version untouched.
    const none = detonate(hit.walls, width, height, at({ x: 1, y: 3 }), 2.5);
    expect(none.destroyed).toEqual([]);
    expect(none.walls).toBe(hit.walls);
    expect(none.walls.version).toBe(1);
  });

  it('radiusUnits is an integer scaled by CELL_UNITS', () => {
    expect(radiusUnits(2.5)).toBe(2500);
  });
});

describe('detonate property', () => {
  it('destroys exactly the Wall cells within the radius and changes no other tile', () => {
    const pos = fc.record({
      x: fc.integer({ min: 1, max: width - 2 }),
      y: fc.integer({ min: 1, max: height - 2 }),
      dir: fc.constantFrom<[number, number] | null>(null, [1, 0], [-1, 0], [0, 1], [0, -1]),
      progress: fc.integer({ min: 0, max: CELL_UNITS }),
      radius: fc.integer({ min: 1, max: 6000 }).map((n) => n / 1000),
    });
    fc.assert(
      fc.property(pos, ({ x, y, dir, progress, radius }) => {
        const cell = { x, y };
        const next = dir ? { x: x + dir[0], y: y + dir[1] } : null;
        const w = layer();
        const r = detonate(w, width, height, at(cell, next, progress), radius);
        expect(keys(r.destroyed)).toEqual(keys(reference(w.tiles, cell, next, progress, radius)));
        for (let i = 0; i < w.tiles.length; i++) {
          const t = w.tiles[i]!;
          const after = r.walls.tiles[i]!;
          if (t !== Tile.Wall) expect(after).toBe(t);
          else expect(after === Tile.Wall || after === Tile.Floor).toBe(true);
        }
        expect(r.walls.version).toBe(r.destroyed.length > 0 ? 1 : 0);
      }),
      { numRuns: 200 },
    );
  });
});

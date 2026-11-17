import { describe, expect, it } from 'vitest';
import {
  cellIndex,
  cellX,
  cellY,
  inBounds,
  isPassable,
  neighborIndex,
  neighbors,
  wrapPartner,
} from '../../src/core/grid';
import { Tile } from '../../src/core/types';
import type { Cell, DoorSpec } from '../../src/core/types';

describe('grid', () => {
  it('index roundtrips', () => {
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 7; x++) {
        const i = cellIndex(7, x, y);
        expect([cellX(7, i), cellY(7, i)]).toEqual([x, y]);
      }
  });

  it('neighbours follow up, right, down, left', () => {
    const out = new Int32Array(4);
    expect(neighbors(5, 5, cellIndex(5, 2, 2), out)).toBe(4);
    expect(Array.from(out)).toEqual([
      cellIndex(5, 2, 1),
      cellIndex(5, 3, 2),
      cellIndex(5, 2, 3),
      cellIndex(5, 1, 2),
    ]);
  });

  it('handles out of bounds', () => {
    expect(inBounds(5, 5, -1, 0)).toBe(false);
    expect(inBounds(5, 5, 4, 4)).toBe(true);
    expect(inBounds(5, 5, 5, 0)).toBe(false);
    expect(neighborIndex(5, 5, 0, 0)).toBe(-1);
    expect(neighborIndex(5, 5, 0, 3)).toBe(-1);
    const out = new Int32Array(4);
    expect(neighbors(5, 5, 0, out)).toBe(2);
    expect(Array.from(out.slice(0, 2))).toEqual([1, 5]);
  });

  it('resolves wrap pairs both ways', () => {
    const a: Cell = { x: 0, y: 1 };
    const b: Cell = { x: 4, y: 1 };
    expect(wrapPartner([[a, b]], 0, 1)).toBe(b);
    expect(wrapPartner([[a, b]], 4, 1)).toBe(a);
    expect(wrapPartner([[a, b]], 2, 2)).toBeNull();
    expect(wrapPartner([], 0, 1)).toBeNull();
  });

  it('computes passability with doors and walls', () => {
    const w = 3;
    const tiles = new Uint8Array([
      Tile.Floor, Tile.Wall, Tile.WallHard,
      Tile.CageInterior, Tile.CageGate, Tile.Door,
    ]);
    const doors: DoorSpec[] = [{ cell: { x: 2, y: 1 }, phaseOffset: 0, period: 10, openRatio: 0.5 }];
    const p = (mask: number, x: number, y: number) => isPassable(tiles, w, 2, doors, mask, x, y);
    expect(p(0, 0, 0)).toBe(true);
    expect(p(0, 1, 0)).toBe(false);
    expect(p(0, 2, 0)).toBe(false);
    expect(p(0, 0, 1)).toBe(true);
    expect(p(0, 1, 1)).toBe(true);
    expect(p(0, 2, 1)).toBe(false);
    expect(p(1, 2, 1)).toBe(true);
    expect(p(0, 3, 0)).toBe(false);
    // destroyed wall is stored as Floor in the live layer
    const live = tiles.slice();
    live[1] = Tile.Floor;
    expect(isPassable(live, w, 2, doors, 0, 1, 0)).toBe(true);
  });
});

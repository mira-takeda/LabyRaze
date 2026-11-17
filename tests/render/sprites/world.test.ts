// World sprites (task 24.3).
import { describe, expect, it } from 'vitest';
import { opaque } from '../../../src/render/sprites/format';
import * as W from '../../../src/render/sprites/world';

describe('world sprites', () => {
  it('walls, hard walls, floors, Cage and Doors are 12x12 and opaque where required', () => {
    for (const s of [W.WALL, W.WALL_HARD, W.CAGE_INTERIOR, W.RUBBLE, W.DOOR_CLOSED, ...W.FLOORS]) {
      expect(s.w).toBe(12);
      expect(s.h).toBe(12);
      expect(opaque(s)).toBe(144);
    }
  });

  it('destructible and indestructible walls look different', () => {
    expect(W.WALL.rows).not.toEqual(W.WALL_HARD.rows);
    expect(W.WALL.palette.b).not.toBe(W.WALL_HARD.palette.s);
  });

  it('Door open, closed and warning frames are distinct', () => {
    const k = [W.DOOR_OPEN, W.DOOR_CLOSED, W.DOOR_WARNING].map((s) => JSON.stringify([s.rows, s.palette]));
    expect(new Set(k).size).toBe(3);
    expect(Object.values(W.DOOR_OPEN.palette)[0]).toMatch(/^#3f/);
  });

  it('decoration and edges exist; the Cell hash is deterministic', () => {
    for (const s of [W.PUMPKIN, W.CANDLE, W.COBWEB, W.WALL_EDGE_TOP, W.WALL_EDGE_BOTTOM, W.FLOOR_SHADOW]) expect(opaque(s)).toBeGreaterThan(0);
    expect(W.cellHash(3, 4)).toBe(W.cellHash(3, 4));
    const hs = new Set(Array.from({ length: 50 }, (_, i) => W.cellHash(i, i * 3) % 4));
    expect(hs.size).toBe(4);
  });
});

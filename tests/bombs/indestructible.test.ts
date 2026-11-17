import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { detonate } from '../../src/core/bombs';
import { carveMaze } from '../../src/core/maze/carve';
import { placeDoors } from '../../src/core/maze/doorPlacement';
import { Tile } from '../../src/core/types';
import type { WallLayer } from '../../src/core/types';

const passable = (t: number) =>
  t === Tile.Floor || t === Tile.Door || t === Tile.CageGate || t === Tile.CageInterior;

/** Component label per Cell (-1 = not passable) over 4-connected passable tiles. */
function labels(tiles: Uint8Array, w: number, h: number): Int32Array {
  const seen = new Int32Array(tiles.length).fill(-1);
  let count = 0;
  for (let s = 0; s < tiles.length; s++) {
    if (seen[s]! >= 0 || !passable(tiles[s]!)) continue;
    const id = count++;
    const stack = [s];
    seen[s] = id;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      const ns = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const n of ns) {
        if (n >= 0 && seen[n]! < 0 && passable(tiles[n]!)) {
          seen[n] = id;
          stack.push(n);
        }
      }
    }
  }
  return seen;
}
/** Number of 4-connected components over passable tiles. */
function components(tiles: Uint8Array, w: number, h: number): number {
  return new Set(Array.from(labels(tiles, w, h)).filter((c) => c >= 0)).size;
}
/**
 * Explosions never split the passable region: every two Cells that were connected before stay
 * connected. A destroyed Wall sealed in by unbreakable or out-of-range walls may form a NEW empty
 * pocket (no items are ever created there); that is allowed and is not a split.
 */
function expectNoSplit(before: Uint8Array, after: Uint8Array, w: number, h: number): void {
  const a = labels(before, w, h);
  const b = labels(after, w, h);
  const map = new Map<number, number>();
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < 0) continue;
    expect(b[i]).toBeGreaterThanOrEqual(0);
    const prev = map.get(a[i]!);
    if (prev === undefined) map.set(a[i]!, b[i]!);
    else expect(b[i]).toBe(prev);
  }
  // Any component without a previously passable Cell consists only of destroyed Walls.
  const old = new Set(Array.from(map.values()));
  for (let i = 0; i < b.length; i++) if (b[i]! >= 0 && !old.has(b[i]!)) expect(before[i]).toBe(Tile.Wall);
  void components;
}
function build(seed: number, size: number) {
  const cfg = { ...DEFAULT_CONFIG, mazeSize: { w: size, h: size } };
  const carved = carveMaze(seed, 1, 0, cfg);
  const placed = placeDoors(carved, seed, 1, 0, cfg, {});
  return { width: carved.width, height: carved.height, tiles: placed.tiles, entrance: carved.cage.entrance };
}

describe('Feature: kirobit-halloween-maze, Property 32: Indestructible tiles are preserved', () => {
  it('Property 32: Indestructible tiles are preserved', () => {
    const blast = fc.record({
      pick: fc.nat(),
      special: fc.constantFrom<'none' | 'entrance' | 'corner'>('none', 'none', 'entrance', 'corner'),
      max: fc.boolean(),
      radius: fc.integer({ min: 1, max: 6000 }).map((n) => n / 1000),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.constantFrom(21, 25),
        fc.array(blast, { minLength: 1, maxLength: 10 }),
        (seed, size, blasts) => {
          const m = build(seed, size);
          const { width, height } = m;
          const floors: number[] = [];
          for (let i = 0; i < m.tiles.length; i++) if (passable(m.tiles[i]!)) floors.push(i);
          const before = m.tiles.slice();
          const comps0 = components(before, width, height);
          let layer: WallLayer = { tiles: m.tiles.slice(), version: 0, destroyed: 0 };

          for (const b of blasts) {
            let cell = { x: 0, y: 0 };
            const i = floors[b.pick % floors.length]!;
            cell = { x: i % width, y: Math.floor(i / width) };
            if (b.special === 'entrance') cell = { ...m.entrance };
            else if (b.special === 'corner') cell = { x: 1, y: 1 };
            const radius = b.max ? 6 : b.radius;
            layer = detonate(layer, width, height, { cell, next: null, progress: 0 }, radius).walls;
            expect(layer.tiles.length).toBe(before.length);
          }

          let gates = 0;
          for (let i = 0; i < before.length; i++) {
            const t = before[i]!;
            const a = layer.tiles[i]!;
            if (t === Tile.WallHard || t === Tile.CageGate || t === Tile.CageInterior || t === Tile.Door || t === Tile.Floor) {
              expect(a).toBe(t);
            } else {
              expect(a === Tile.Wall || a === Tile.Floor).toBe(true);
            }
            if (a === Tile.CageGate) gates++;
          }
          expect(gates).toBe(1);
          // Outer boundary stays WallHard.
          for (let k = 0; k < width; k++) {
            expect(layer.tiles[k]).toBe(Tile.WallHard);
            expect(layer.tiles[(height - 1) * width + k]).toBe(Tile.WallHard);
          }
          for (let k = 0; k < height; k++) {
            expect(layer.tiles[k * width]).toBe(Tile.WallHard);
            expect(layer.tiles[k * width + width - 1]).toBe(Tile.WallHard);
          }
          // Explosions never split the passable region (new sealed pockets are allowed).
          expectNoSplit(before, layer.tiles, width, height);
          void comps0;
        },
      ),
      { numRuns: 60 },
    );
  });

  it('regression: a rim blast may open a sealed one-Cell pocket but never splits the maze (seed 1878032549)', () => {
    // fast-check counterexample [1878032549, 21, [{ pick: 118005222, max: true }]]: the blast at (8,10)
    // destroys (14,10) exactly 6 Cells away; its other neighbours are 6.08 away or the Cage's WallHard.
    const m = build(1878032549, 21);
    const before = m.tiles.slice();
    const floors: number[] = [];
    for (let i = 0; i < before.length; i++) if (passable(before[i]!)) floors.push(i);
    const i0 = floors[118005222 % floors.length]!;
    const cell = { x: i0 % m.width, y: Math.floor(i0 / m.width) };
    expect(cell).toEqual({ x: 8, y: 10 });
    const after = detonate({ tiles: before.slice(), version: 0, destroyed: 0 }, m.width, m.height, { cell, next: null, progress: 0 }, 6).walls.tiles;
    expect(components(after, m.width, m.height)).toBe(components(before, m.width, m.height) + 1);
    expect(after[10 * m.width + 14]).toBe(Tile.Floor);
    expectNoSplit(before, after, m.width, m.height);
  });
  it('keeps the generated fixture sane (boundary is WallHard before any blast)', () => {
    const m = build(1, 21);
    expect(m.tiles[0]).toBe(Tile.WallHard);
    expect(m.tiles.length).toBe(m.width * m.height);
  });
});

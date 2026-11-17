import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  UNREACHABLE,
  DistanceFieldCache,
  computeDistanceField,
  lookaheadDoorMask,
  nextStepDir,
  nextStepIndex,
} from '../../src/core/pathfinding';
import type { NavLayout } from '../../src/core/pathfinding';
import { Floor, Tile } from '../../src/core/types';
import type { DoorSpec, DoorState, WallLayer } from '../../src/core/types';
import { corridorMaze, mazeFromAscii } from '../helpers/fixtures';

const idx = (w: number, x: number, y: number): number => y * w + x;
const layer = (tiles: Uint8Array, version = 0): WallLayer => ({ tiles, version, destroyed: 0 });

describe('pathfinding', () => {
  it('computes shortest distances on a fixture maze', () => {
    const m = corridorMaze();
    const f = computeDistanceField(m, m.tiles, 0, 0, [idx(m.width, 7, 1)]);
    expect(f.dist[idx(m.width, 7, 1)]).toBe(0);
    expect(f.dist[idx(m.width, 1, 1)]).toBe(6);
    expect(f.dist[idx(m.width, 0, 0)]).toBe(UNREACHABLE); // WallHard
  });

  it('treats closed doors as walls and open doors as floor', () => {
    const m = mazeFromAscii(['HHHHHHH', 'HP.D.UH', 'HHHHHHH']);
    const src = [idx(m.width, 5, 1)];
    const closed = computeDistanceField(m, m.tiles, 0, 0, src);
    expect(closed.dist[idx(m.width, 1, 1)]).toBe(UNREACHABLE);
    expect(closed.dist[idx(m.width, 4, 1)]).toBe(1);
    const open = computeDistanceField(m, m.tiles, 1, 0, src);
    expect(open.dist[idx(m.width, 1, 1)]).toBe(4);
  });

  it('follows wrap pairs', () => {
    const m = mazeFromAscii(['P..#..U']);
    const pair: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ];
    const without = computeDistanceField(m, m.tiles, 0, 0, [6]);
    expect(without.dist[0]).toBe(UNREACHABLE);
    const nav: NavLayout = { ...m, wrapPairs: [pair] };
    const f = computeDistanceField(nav, m.tiles, 0, 0, [6]);
    expect(f.dist[0]).toBe(1);
    expect(f.dist[2]).toBe(3);
    expect(nextStepDir(f, nav, 0, 0)).toBe('left');
    expect(nextStepIndex(f, nav, 1, 0)).toBe(0);
  });

  it('supports multi-source BFS', () => {
    const m = corridorMaze();
    const f = computeDistanceField(m, m.tiles, 0, 0, [idx(m.width, 0, 1), idx(m.width, 8, 1)]);
    expect(f.dist[idx(m.width, 4, 1)]).toBe(4);
    expect(f.dist[idx(m.width, 2, 1)]).toBe(2);
    expect(f.dist[idx(m.width, 6, 1)]).toBe(2);
  });

  it('breaks ties with the fixed neighbour order, deterministically', () => {
    const m = mazeFromAscii(['HHHHH', 'H...H', 'H...H', 'H...H', 'HHHHH']);
    const f = computeDistanceField(m, m.tiles, 0, 0, [idx(m.width, 3, 3)]);
    // From (1,1): right (2,1) and down (1,2) both have distance 3; right comes first.
    expect(nextStepDir(f, m, 1, 1)).toBe('right');
    expect(nextStepIndex(f, m, 1, 1)).toBe(idx(m.width, 2, 1));
    // From (3,1): only down is closer.
    expect(nextStepDir(f, m, 3, 1)).toBe('down');
    // Source and wall cells have no next step.
    expect(nextStepDir(f, m, 3, 3)).toBeNull();
    expect(nextStepDir(f, m, 0, 0)).toBeNull();
    // Source order does not change the result.
    const g = computeDistanceField(m, m.tiles, 0, 0, [idx(m.width, 3, 3), idx(m.width, 1, 3)]);
    const h = computeDistanceField(m, m.tiles, 0, 0, [idx(m.width, 1, 3), idx(m.width, 3, 3)]);
    expect(Array.from(g.dist)).toEqual(Array.from(h.dist));
  });

  it('recomputes after walls.version changes and serves the cache for the same key', () => {
    const m = mazeFromAscii(['HHHHH', 'HP#.H', 'H...H', 'HHHHH']);
    const cache = new DistanceFieldCache();
    const target = [idx(m.width, 3, 1)];
    const walls0 = layer(m.tiles.slice(), 0);

    const a = cache.get(m, walls0, 0, target);
    expect(a.dist[idx(m.width, 1, 1)]).toBe(4);
    expect(cache.get(m, walls0, 0, target)).toBe(a);
    expect(cache.computeCount).toBe(1);

    // Destroy the wall: new tile array, version + 1.
    const tiles1 = walls0.tiles.slice();
    tiles1[idx(m.width, 2, 1)] = Floor;
    const walls1 = layer(tiles1, 1);
    const b = cache.get(m, walls1, 0, target);
    expect(b).not.toBe(a);
    expect(b.version).toBe(1);
    expect(b.dist[idx(m.width, 1, 1)]).toBe(2);
    expect(cache.get(m, walls1, 0, target)).toBe(b);
    expect(cache.computeCount).toBe(2);

    // Old version is never confused with the new one, and a new doorMask misses too.
    expect(cache.get(m, walls0, 0, target).dist[idx(m.width, 1, 1)]).toBe(4);
    cache.get(m, walls1, 1, target);
    expect(cache.computeCount).toBe(3); // version 0 was still cached; only the new mask computed
  });

  it('never confuses two mazes that share version, size, doorMask and sources', () => {
    // Regression: the ally cache is a module singleton shared across levels and runs, and
    // every fresh maze starts at walls.version 0, so the key must include the layout itself.
    const a = mazeFromAscii(['HHHHH', 'HP#.H', 'H...H', 'HHHHH']);
    const b = mazeFromAscii(['HHHHH', 'HP..H', 'H.#.H', 'HHHHH']);
    const cache = new DistanceFieldCache();
    const target = [idx(a.width, 3, 1)];
    const fa = cache.get(a, layer(a.tiles.slice(), 0), 0, target);
    const fb = cache.get(b, layer(b.tiles.slice(), 0), 0, target);
    expect(fb).not.toBe(fa);
    expect(Array.from(fb.dist)).toEqual(Array.from(computeDistanceField(b, b.tiles, 0, 0, target).dist));
    expect(Array.from(fa.dist)).toEqual(Array.from(computeDistanceField(a, a.tiles, 0, 0, target).dist));
    // The same layout still hits, even through a different tile-array instance.
    expect(cache.get(a, layer(a.tiles.slice(), 0), 0, target)).toBe(fa);
    expect(cache.computeCount).toBe(2);
  });

  it('never confuses mazes whose doors sit on different cells', () => {
    const a = mazeFromAscii(['HHHHHHH', 'HP.D.UH', 'HHHHHHH']);
    const b = mazeFromAscii(['HHHHHHH', 'HPD..UH', 'HHHHHHH']);
    const cache = new DistanceFieldCache();
    const target = [idx(a.width, 4, 1)];
    const fa = cache.get(a, layer(a.tiles.slice(), 0), 0, target);
    const fb = cache.get(b, layer(b.tiles.slice(), 0), 0, target);
    expect(fb).not.toBe(fa);
    expect(fa.dist[idx(a.width, 3, 1)]).toBe(UNREACHABLE); // closed door in a
    expect(fb.dist[idx(b.width, 3, 1)]).toBe(1); // open floor in b
  });

  it('keeps the cache bounded', () => {
    const m = corridorMaze();
    const cache = new DistanceFieldCache(2);
    const walls = layer(m.tiles);
    for (let x = 1; x <= 5; x++) cache.get(m, walls, 0, [idx(m.width, x, 1)]);
    expect(cache.size).toBe(2);
    expect(() => new DistanceFieldCache(0)).toThrow();
  });

  it('treats doors closing within the lookahead as closed', () => {
    const ds = (index: number, open: boolean, nextChangeIn: number): DoorState => ({
      index,
      open,
      nextChangeIn,
      warning: 0,
      postponed: false,
    });
    const states = [ds(0, true, 30), ds(1, true, 31), ds(2, false, 5)];
    expect(lookaheadDoorMask(0b011, states, 30)).toBe(0b010);
    expect(lookaheadDoorMask(0b011, states, 0)).toBe(0b011);
  });

  it('matches a brute-force reference BFS on random small grids', () => {
    const tileArb = fc.constantFrom(Floor, Floor, Floor, Tile.Wall, Tile.WallHard, Tile.Door);
    const gridArb = fc
      .record({ w: fc.integer({ min: 2, max: 7 }), h: fc.integer({ min: 2, max: 7 }) })
      .chain(({ w, h }) =>
        fc.record({
          w: fc.constant(w),
          h: fc.constant(h),
          tiles: fc.array(tileArb, { minLength: w * h, maxLength: w * h }),
          mask: fc.integer({ min: 0, max: 255 }),
          sources: fc.array(fc.integer({ min: 0, max: w * h - 1 }), { minLength: 1, maxLength: 3 }),
          wrap: fc.option(
            fc.tuple(fc.integer({ min: 0, max: w * h - 1 }), fc.integer({ min: 0, max: w * h - 1 })),
            { nil: null },
          ),
        }),
      );

    fc.assert(
      fc.property(gridArb, ({ w, h, tiles, mask, sources, wrap }) => {
        const t = Uint8Array.from(tiles);
        const doors: DoorSpec[] = [];
        for (let i = 0; i < t.length; i++) {
          if (t[i] === Tile.Door) {
            doors.push({ cell: { x: i % w, y: Math.floor(i / w) }, phaseOffset: 0, period: 240, openRatio: 0.5 });
          }
        }
        const wrapPairs =
          wrap !== null && wrap[0] !== wrap[1]
            ? [
                [
                  { x: wrap[0] % w, y: Math.floor(wrap[0] / w) },
                  { x: wrap[1] % w, y: Math.floor(wrap[1] / w) },
                ] as [{ x: number; y: number }, { x: number; y: number }],
              ]
            : [];
        const nav: NavLayout = { width: w, height: h, doors, wrapPairs };
        const got = computeDistanceField(nav, t, mask, 0, sources).dist;

        // Reference: independent passability + Bellman-Ford style relaxation to a fixpoint.
        const passable = (i: number): boolean => {
          const tile = t[i]!;
          if (tile === Tile.Floor) return true;
          if (tile !== Tile.Door) return false;
          const di = doors.findIndex((d) => d.cell.x === i % w && d.cell.y === Math.floor(i / w));
          return ((mask >> di) & 1) === 1;
        };
        const adj: number[][] = Array.from({ length: w * h }, () => []);
        for (let i = 0; i < w * h; i++) {
          const x = i % w;
          const y = Math.floor(i / w);
          if (x > 0) adj[i]!.push(i - 1);
          if (x < w - 1) adj[i]!.push(i + 1);
          if (y > 0) adj[i]!.push(i - w);
          if (y < h - 1) adj[i]!.push(i + w);
        }
        if (wrap !== null && wrap[0] !== wrap[1]) {
          adj[wrap[0]]!.push(wrap[1]);
          adj[wrap[1]]!.push(wrap[0]);
        }
        const ref = new Array<number>(w * h).fill(Infinity);
        for (const s of sources) ref[s] = 0;
        let changed = true;
        while (changed) {
          changed = false;
          for (let i = 0; i < w * h; i++) {
            for (const j of adj[i]!) {
              if (passable(j) && ref[i]! + 1 < ref[j]!) {
                ref[j] = ref[i]! + 1;
                changed = true;
              }
            }
          }
        }
        for (let i = 0; i < w * h; i++) {
          expect(got[i]).toBe(Number.isFinite(ref[i]!) ? ref[i] : UNREACHABLE);
        }
      }),
      { numRuns: 200 },
    );
  });
});

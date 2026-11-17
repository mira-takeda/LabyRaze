// Task 36.8: Key placement fairness. The greedy Key route (Player start -> nearest remaining
// Key -> ... -> Cage entrance, every Door open) stays inside keyRouteMin..keyRouteMax, the
// measured p2..p98 band of the pre-36.8 generator (tools/balance/logs/key-fairness-before.json).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import { greedyKeyRoute } from '../../src/core/maze/placement';
import { bfsDistances } from '../../src/core/maze/validate';
import type { Maze } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;

function routeOf(m: Maze): number {
  const idx = (c: { x: number; y: number }): number => c.y * m.width + c.x;
  const dp = bfsDistances(m, [m.playerStart]);
  const dc = bfsDistances(m, [m.cage.entrance]);
  return greedyKeyRoute(dp, dc, m.keys.map(idx), (i) =>
    bfsDistances(m, [{ x: i % m.width, y: Math.floor(i / m.width) }]),
  );
}

describe('greedyKeyRoute', () => {
  it('visits the nearest Key first and ends at the Cage entrance', () => {
    // A 1 x 7 corridor: cells 0..6; Player at 0, Cage entrance at 6, Keys at 4, 2, 5.
    const line = (src: number): Int32Array => Int32Array.from({ length: 7 }, (_, i) => Math.abs(i - src));
    expect(greedyKeyRoute(line(0), line(6), [4, 2, 5], line)).toBe(2 + 2 + 1 + 1);
  });

  it('returns -1 when a leg is unreachable', () => {
    const dp = Int32Array.from([0, -1]);
    expect(greedyKeyRoute(dp, Int32Array.from([1, 0]), [1], () => dp)).toBe(-1);
  });
});

describe('Key route band (task 36.8)', () => {
  it('config band is the documented p2..p98 window', () => {
    expect(cfg.keyRouteMin).toBe(34);
    expect(cfg.keyRouteMax).toBe(92);
    expect(cfg.keyRouteMin).toBeLessThan(cfg.keyRouteMax);
  });

  // Feature: kirobit-halloween-maze, Property 9: Maze structure and limits
  // **Validates: Requirements 4.6, 4.7, 17.1**
  it('every generated Maze keeps three Keys with a greedy route inside keyRouteMin..keyRouteMax', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0x7fffffff }), fc.integer({ min: 1, max: 60 }), (seed, level) => {
        const m = generateMaze(seed, level, cfg);
        expect(m.keys.length).toBe(3);
        if (m.generation.fallback === true) return; // fixed template: last resort, not band-constrained
        const r = routeOf(m);
        expect(r, `seed ${seed} level ${level}`).toBeGreaterThanOrEqual(cfg.keyRouteMin);
        expect(r, `seed ${seed} level ${level}`).toBeLessThanOrEqual(cfg.keyRouteMax);
      }),
      { numRuns: 200 },
    );
  }, 600_000);
});

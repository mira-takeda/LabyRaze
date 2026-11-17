import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import type { Maze } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const seedArb = fc.integer({ min: -2147483648, max: 2147483647 });
const levelArb = fc.integer({ min: 1, max: 100 });
const retryArb = fc.integer({ min: 0, max: 5 });

const sameLayout = (a: Maze, b: Maze): boolean =>
  a.tiles.length === b.tiles.length && a.tiles.every((t, i) => t === b.tiles[i]);

// Feature: kirobit-halloween-maze, Property 7: Maze generation is deterministic
// **Validates: Requirements 4.1, 4.3, 17.3**
// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Feature: kirobit-halloween-maze, Property 7: Maze generation is deterministic', () => {
  it('same (seed, level, config, retryIndex) yields deep-equal Mazes', () => {
    fc.assert(
      fc.property(seedArb, levelArb, retryArb, (seed, level, retry) => {
        const a = generateMaze(seed, level, cfg, retry);
        const b = generateMaze(seed, level, cfg, retry);
        expect(b).toEqual(a);
        expect(b.tiles).toEqual(a.tiles);
        expect(b.doors).toEqual(a.doors);
        expect(b.keys).toEqual(a.keys);
        expect(b.power).toEqual(a.power);
        expect(b.speed).toEqual(a.speed);
        expect(b.bombs).toEqual(a.bombs);
        expect(b.ghostHunt).toEqual(a.ghostHunt);
        expect(b.generation).toEqual(a.generation);
      }),
      { numRuns: 40 },
    );
  });

  it('does not depend on call order or history', () => {
    fc.assert(
      fc.property(seedArb, levelArb, seedArb, levelArb, (s1, l1, s2, l2) => {
        const a1 = generateMaze(s1, l1, cfg);
        generateMaze(s2, l2, cfg);
        const a2 = generateMaze(s1, l1, cfg);
        expect(a2).toEqual(a1);
      }),
      { numRuns: 25 },
    );
  });

  it('every level of one run gets a different maze (independent streams per level)', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const a = generateMaze(seed, level, cfg);
        const b = generateMaze(seed, level + 1, cfg);
        expect(sameLayout(a, b)).toBe(false);
      }),
      { numRuns: 30 },
    );
  });

  it('retryIndex shifts every derived stream, changing the result', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const a = generateMaze(seed, level, cfg, 0);
        const b = generateMaze(seed, level, cfg, 1000);
        expect(sameLayout(a, b)).toBe(false);
      }),
      { numRuns: 20 },
    );
  });
});

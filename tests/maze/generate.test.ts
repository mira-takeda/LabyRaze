import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { fallbackMaze, generateMaze } from '../../src/core/maze/generate';
import { validateMaze } from '../../src/core/maze/validate';
import { Tile } from '../../src/core/types';
import type { Maze } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;

function expectValid(m: Maze, c: GameConfig = cfg): void {
  const report = validateMaze(m, c);
  expect(report.reason).toBe('');
  expect(report.ok).toBe(true);
  expect(m.width).toBe(c.mazeSize.w);
  expect(m.height).toBe(c.mazeSize.h);
  expect(m.doors).toHaveLength(c.doorCount);
  expect(m.keys).toHaveLength(3);
  expect(m.power).toHaveLength(c.powerPelletsPerLevel);
  expect(m.speed).toHaveLength(c.speedPelletsPerLevel);
  expect(m.bombs).toHaveLength(c.bombsPerLevel);
  expect(m.ghostHunt).toHaveLength(c.ghostHuntPerLevel);
  expect(m.wrapPairs).toEqual([]);
}

const sameLayout = (a: Maze, b: Maze): boolean =>
  a.tiles.length === b.tiles.length && a.tiles.every((t, i) => t === b.tiles[i]);

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('generateMaze validity', () => {
  it('validates for every seed and level (fast-check, 200 runs, levels 1 to 200)', () => {
    const attempts = new Map<number, number>();
    let fallbacks = 0;
    fc.assert(
      fc.property(fc.integer({ min: -2147483648, max: 2147483647 }), fc.integer({ min: 1, max: 200 }), (seed, level) => {
        const m = generateMaze(seed, level, cfg);
        attempts.set(m.generation.attempts, (attempts.get(m.generation.attempts) ?? 0) + 1);
        if (m.generation.fallback) fallbacks++;
        const report = validateMaze(m, cfg);
        if (!report.ok) throw new Error(`seed ${seed} level ${level}: ${report.reason}`);
        return true;
      }),
      { numRuns: 200 },
    );
    console.log(`fast-check attempts histogram ${JSON.stringify(Object.fromEntries(attempts))}, fallbacks ${fallbacks}`);
  }, 300_000);

  it('validates on 1000 consecutive seeds and reports the attempts distribution and timing', () => {
    const attempts = new Map<number, number>();
    const times: number[] = [];
    let repaired = 0;
    let fallbacks = 0;
    let invalid = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const level = 1 + (seed % 200);
      const t0 = performance.now();
      const m = generateMaze(seed, level, cfg);
      times.push(performance.now() - t0);
      attempts.set(m.generation.attempts, (attempts.get(m.generation.attempts) ?? 0) + 1);
      if (m.generation.repairs > 0) repaired++;
      if (m.generation.fallback) fallbacks++;
      if (!validateMaze(m, cfg).ok) invalid++;
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((s, v) => s + v, 0) / times.length;
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    const max = times[times.length - 1]!;
    console.log(
      `generateMaze 21x21 x${times.length}: mean ${mean.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${max.toFixed(2)} ms (budget 50 ms p95)`,
    );
    console.log(
      `attempts ${JSON.stringify(Object.fromEntries(attempts))}; with repairs ${repaired}; fallback ${fallbacks}; invalid ${invalid}`,
    );
    expect(invalid).toBe(0);
  }, 300_000);
});

describe('generateMaze determinism and variety', () => {
  it('returns identical Mazes for identical inputs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 1, max: 200 }), (seed, level) => {
        expect(generateMaze(seed, level, cfg)).toEqual(generateMaze(seed, level, cfg));
      }),
      { numRuns: 20 },
    );
  });

  it('gives different layouts for different seeds, levels and retry indices', () => {
    const base = generateMaze(1, 1, cfg);
    expect(sameLayout(base, generateMaze(2, 1, cfg))).toBe(false);
    expect(sameLayout(base, generateMaze(1, 2, cfg))).toBe(false);
    expect(sameLayout(base, generateMaze(1, 1, cfg, 1))).toBe(false);
    const distinct = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) distinct.add(generateMaze(seed, 1, cfg).tiles.join(''));
    expect(distinct.size).toBe(30);
  });
});

describe('generateMaze regeneration and fallback', () => {
  it('regenerates when the first attempts are rejected and records attempts above 1', () => {
    const m = generateMaze(7, 3, cfg, 0, { accept: (_maze, attempt) => attempt >= 2 });
    expect(m.generation.attempts).toBe(3);
    expect(m.generation.fallback).toBeUndefined();
    expectValid(m);
    // The regenerated Maze comes from retry index 2, so it equals a direct call with that index.
    expect(sameLayout(m, generateMaze(7, 3, cfg, 2))).toBe(true);
  });

  it('records repairs when the raw pipeline output is invalid', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const m = generateMaze(seed, 1, cfg);
      if (m.generation.repairs > 0) {
        found = true;
        expectValid(m);
      }
    }
    expect(found).toBe(true);
  });

  it('uses the fixed-template fallback when every attempt is rejected, and it validates', () => {
    const small = { ...cfg, maxAttempts: 3 };
    const m = generateMaze(11, 5, small, 0, { accept: () => false });
    expect(m.generation.fallback).toBe(true);
    expect(m.generation.attempts).toBe(3);
    expectValid(m, small);
  });

  it('exhaustion with maxAttempts 0 goes straight to the fallback', () => {
    const m = generateMaze(3, 1, { ...cfg, maxAttempts: 0 });
    expect(m.generation.fallback).toBe(true);
    expectValid(m, { ...cfg, maxAttempts: 0 });
  });

  it('fallback validates for the former counterexample (seed 1152781281, level 7)', () => {
    expectValid(fallbackMaze(1152781281, 7, cfg));
  });

  it('fallback validates for 400 consecutive seeds across levels 1 to 200', () => {
    for (let seed = 1; seed <= 400; seed++) expectValid(fallbackMaze(seed * 7919, 1 + (seed % 200), cfg));
  }, 300_000);

  it('fallback validates across seeds and levels (fast-check, 300 runs)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2147483648, max: 2147483647 }), fc.integer({ min: 1, max: 200 }), (seed, level) => {
        expectValid(fallbackMaze(seed, level, cfg));
      }),
      { numRuns: 300 },
    );
  }, 300_000);

  it('fallback honours configured size and Door count', { timeout: 300_000 }, () => {
    for (const [w, h] of [[21, 21], [25, 21], [21, 27], [31, 31]] as const) {
      for (const doorCount of [0, 2, 4, 6]) {
        const c = { ...cfg, mazeSize: { w, h }, doorCount };
        expectValid(fallbackMaze(9, 2, c), c);
      }
    }
  });

  it('fallback is deterministic and is not a copy of the carved layouts', () => {
    const a = fallbackMaze(5, 1, cfg);
    expect(fallbackMaze(5, 1, cfg)).toEqual(a);
    // The template has a hard boundary and exactly one Cage gate.
    expect(a.tiles.filter((t) => t === Tile.CageGate)).toHaveLength(1);
    expect(sameLayout(a, generateMaze(5, 1, cfg))).toBe(false);
  });
});

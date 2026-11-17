import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { deriveSeed, nextFloat, nextInt, pick, shuffle, type PrngStream } from '../../src/core/prng';

function floats(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    const [v, next] = nextFloat(s);
    out.push(v);
    s = next;
  }
  return out;
}

describe('prng', () => {
  it('same seed gives the same sequence', () => {
    expect(floats(12345, 20)).toEqual(floats(12345, 20));
    expect(floats(1, 5)).not.toEqual(floats(2, 5));
  });

  it('streams, levels and retries derive different seeds', () => {
    const streams: PrngStream[] = ['maze', 'doors', 'hunter', 'repair', 'items'];
    const seeds = streams.map((s) => deriveSeed(42, 3, s, 0));
    expect(new Set(seeds).size).toBe(streams.length);
    expect(deriveSeed(42, 3, 'maze', 0)).toBe(deriveSeed(42, 3, 'maze', 0));
    expect(deriveSeed(42, 3, 'maze', 0)).not.toBe(deriveSeed(42, 4, 'maze', 0));
    expect(deriveSeed(42, 3, 'maze', 0)).not.toBe(deriveSeed(42, 3, 'maze', 1));
  });

  it('streams produce different sequences, including items', () => {
    const streams: PrngStream[] = ['maze', 'doors', 'hunter', 'repair', 'items'];
    const seqs = streams.map((st) => JSON.stringify(floats(deriveSeed(42, 3, st), 8)));
    expect(new Set(seqs).size).toBe(streams.length);
  });

  it('deriveSeed has no collisions across level and retry combinations', () => {
    const streams: PrngStream[] = ['maze', 'doors', 'hunter', 'repair', 'items'];
    const seen = new Set<number>();
    let total = 0;
    for (let level = 1; level <= 40; level++) {
      for (let retry = 0; retry < 10; retry++) {
        for (const st of streams) {
          seen.add(deriveSeed(2024, level, st, retry));
          total++;
        }
      }
    }
    expect(seen.size).toBe(total);
  });

  it('property: nextInt stays in range and is deterministic', () => {
    // Feature: kirobit-halloween-maze, PRNG nextInt range
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (seed, min, span) => {
          const [v, next] = nextInt(seed, min, min + span);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(min + span);
          expect(nextInt(seed, min, min + span)).toEqual([v, next]);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('property: shuffle is a permutation and does not mutate its input', () => {
    // Feature: kirobit-halloween-maze, PRNG shuffle permutation
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 30 }),
        (seed, arr) => {
          const copy = arr.slice();
          const [out] = shuffle(seed, arr);
          expect(arr).toEqual(copy);
          expect([...out].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b));
        },
      ),
      { numRuns: 50 },
    );
  });

  it('nextInt rejects min > max and pick rejects an empty array', () => {
    expect(() => nextInt(1, 5, 4)).toThrow(RangeError);
    expect(() => pick(1, [])).toThrow(RangeError);
  });

  it('values lie in range', () => {
    let s = deriveSeed(7, 1, 'items');
    for (let i = 0; i < 500; i++) {
      const [f, n1] = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const [k, n2] = nextInt(n1, -3, 4);
      expect(k).toBeGreaterThanOrEqual(-3);
      expect(k).toBeLessThanOrEqual(4);
      s = n2;
    }
  });

  it('pick and shuffle are pure and stay within the input', () => {
    const arr = [1, 2, 3, 4, 5];
    const [v] = pick(9, arr);
    expect(arr).toContain(v);
    const [sh, next] = shuffle(9, arr);
    expect([...sh].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
    expect(shuffle(9, arr)).toEqual([sh, next]);
  });
});

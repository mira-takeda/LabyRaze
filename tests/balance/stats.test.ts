import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  checkBand,
  checkTolerance,
  histogram,
  mean,
  median,
  percentile,
  ratio,
  ratios,
  stdDev,
  summarize,
  winRate,
  withinTolerance,
} from '../../tools/balance/stats';

describe('balance stats: known values', () => {
  it('computes percentiles with linear interpolation', () => {
    const v = [10, 20, 30, 40, 50];
    expect(percentile(v, 0)).toBe(10);
    expect(percentile(v, 25)).toBe(20);
    expect(percentile(v, 50)).toBe(30);
    expect(percentile(v, 100)).toBe(50);
    expect(percentile([1, 2], 50)).toBe(1.5);
    expect(percentile([1, 2, 3, 4], 5)).toBe(1.15);
  });

  it('computes median, mean and standard deviation', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('summarizes into the baseline shape', () => {
    const s = summarize([4, 1, 3, 2, 5]);
    expect(s).toEqual({ mean: 3, median: 3, p5: 1.2, p95: 4.8, min: 1, max: 5, count: 5 });
  });

  it('builds histograms', () => {
    expect(histogram([0, 1, 2, 3, 4], 2)).toEqual([
      { lo: 0, hi: 2, count: 2 },
      { lo: 2, hi: 4, count: 3 },
    ]);
    expect(histogram([7, 7], 3)).toEqual([{ lo: 7, hi: 7, count: 2 }]);
  });

  it('computes ratios', () => {
    expect(ratio(300, 200)).toBe(1.5);
    expect(ratios([100, 90], [50, 30])).toEqual([2, 3]);
    expect(() => ratio(1, 0)).toThrow(RangeError);
    expect(() => ratios([1], [1, 2])).toThrow(RangeError);
  });
});

describe('balance stats: empty and non-finite input', () => {
  it('throws on empty input', () => {
    expect(() => percentile([], 50)).toThrow(RangeError);
    expect(() => summarize([])).toThrow(RangeError);
    expect(() => mean([])).toThrow(RangeError);
    expect(() => histogram([], 3)).toThrow(RangeError);
  });

  it('throws on NaN and Infinity instead of returning NaN', () => {
    expect(() => median([1, Number.NaN])).toThrow(RangeError);
    expect(() => mean([1, Infinity])).toThrow(RangeError);
    expect(() => ratio(Number.NaN, 1)).toThrow(RangeError);
    expect(() => checkBand('x', Number.NaN, { min: 0 })).toThrow(RangeError);
  });

  it('rejects invalid p', () => {
    expect(() => percentile([1], 101)).toThrow(RangeError);
    expect(() => percentile([1], 2.5)).toThrow(RangeError);
  });
});

describe('balance stats: Wilson interval', () => {
  it('matches known bounds', () => {
    const w = winRate(50, 100);
    expect(w.rate).toBe(0.5);
    expect(w.lo).toBeCloseTo(0.4038, 3);
    expect(w.hi).toBeCloseTo(0.5962, 3);
  });

  it('stays within [0, 1] at the extremes and contains the rate', () => {
    const none = winRate(0, 20);
    expect(none.lo).toBe(0);
    expect(none.hi).toBeGreaterThan(0);
    const all = winRate(20, 20);
    expect(all.hi).toBe(1);
    expect(all.lo).toBeLessThan(1);
  });

  it('rejects invalid counts', () => {
    expect(() => winRate(1, 0)).toThrow(RangeError);
    expect(() => winRate(5, 4)).toThrow(RangeError);
  });
});

describe('balance stats: bands', () => {
  it('returns null inside the band and the violation outside', () => {
    expect(checkBand('p5', 1.5, { min: 1.3 })).toBeNull();
    const v = checkBand('p5', 1.0, { min: 1.3 });
    expect(v).toMatchObject({ stat: 'p5', value: 1, excess: 0.3 });
  });

  it('names the worst Seed', () => {
    const samples = [
      { seed: 3, value: 1.2 },
      { seed: 9, value: 0.5 },
      { seed: 4, value: 2 },
    ];
    expect(checkBand('p5', 1.0, { min: 1.3 }, samples)?.worstSeed).toBe(9);
  });

  it('applies relative tolerance', () => {
    expect(withinTolerance(114, 100, 0, 0.15)).toBe(true);
    expect(withinTolerance(116, 100, 0, 0.15)).toBe(false);
    expect(withinTolerance(0.05, 0, 0.1, 0.15)).toBe(true);
    expect(checkTolerance('median', 116, 100, 0, 0.15)).toMatchObject({ stat: 'median', excess: 1 });
    expect(checkTolerance('median', 110, 100, 0, 0.15)).toBeNull();
  });
});

describe('balance stats: properties', () => {
  const samples = fc.array(fc.integer({ min: -100000, max: 100000 }), { minLength: 1, maxLength: 60 });

  it('percentiles are monotone in p and within [min, max]', () => {
    fc.assert(
      fc.property(samples, fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (v, a, b) => {
        const [p, q] = a <= b ? [a, b] : [b, a];
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        const x = percentile(v, p);
        const y = percentile(v, q);
        return x <= y && x >= lo && y <= hi;
      }),
      { numRuns: 200 },
    );
  });

  it('summary is invariant to input order', () => {
    fc.assert(
      fc.property(samples, fc.integer(), (v, salt) => {
        const shuffled = [...v].sort((a, b) => ((a * 31 + salt) % 97) - ((b * 31 + salt) % 97));
        return JSON.stringify(summarize(v)) === JSON.stringify(summarize(shuffled));
      }),
      { numRuns: 200 },
    );
  });
});

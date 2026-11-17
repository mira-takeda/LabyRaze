import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  checkBand,
  checkTolerance,
  summarize,
  winRate,
  withinTolerance,
  type SeededSample,
} from '../../tools/balance/stats';

// Feature: kirobit-halloween-maze, Property 29: Balance statistics consistency
// **Validates: Requirements 20.3, 20.6, 20.8, 20.9**

const ratiosArb = fc.array(fc.integer({ min: 1, max: 1_000_000 }).map((n) => n / 1000), {
  minLength: 1,
  maxLength: 80,
});

describe('Feature: kirobit-halloween-maze, Property 29: Balance statistics consistency', () => {
  it('p5 <= median <= p95 and min <= median <= max for positive ratios', () => {
    fc.assert(
      fc.property(ratiosArb, (v) => {
        const s = summarize(v);
        return (
          s.p5 <= s.median &&
          s.median <= s.p95 &&
          s.min <= s.p5 &&
          s.p95 <= s.max &&
          s.min <= s.median &&
          s.median <= s.max &&
          s.min <= s.mean &&
          s.mean <= s.max &&
          s.count === v.length
        );
      }),
      { numRuns: 200 },
    );
  });

  it('summary is invariant under reversal', () => {
    fc.assert(
      fc.property(ratiosArb, (v) => {
        return JSON.stringify(summarize(v)) === JSON.stringify(summarize([...v].reverse()));
      }),
      { numRuns: 100 },
    );
  });

  it('checkBand returns null exactly when the value is inside the band', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (a, b, value) => {
          const band = { min: Math.min(a, b), max: Math.max(a, b) };
          const r = checkBand('stat', value, band);
          const inside = value >= band.min && value <= band.max;
          if (inside) return r === null;
          return r !== null && r.stat === 'stat' && r.value === value && r.excess > 0;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('a violation names the offending statistic and the Seed of the worst Maze', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10_000 }), { minLength: 2, maxLength: 20 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 19 }),
        (seeds, bandMin, worstIdxRaw) => {
          const worstIdx = worstIdxRaw % seeds.length;
          // Distinct distances below the band; the worst Maze is the furthest below it.
          const samples: SeededSample[] = seeds.map((seed, i) => ({
            seed,
            value: i === worstIdx ? bandMin - 1000 : bandMin - 1 - (i % 5) * 0.1,
          }));
          const v = checkBand('p5', bandMin - 1, { min: bandMin }, samples);
          return v !== null && v.stat === 'p5' && v.worstSeed === seeds[worstIdx];
        },
      ),
      { numRuns: 200 },
    );
  });

  it('worst Seed does not depend on sample order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ seed: fc.integer({ min: 0, max: 50 }), value: fc.integer({ min: -20, max: 20 }) }), {
          minLength: 1,
          maxLength: 15,
        }),
        (samples) => {
          const a = checkBand('s', -30, { min: 0 }, samples);
          const b = checkBand('s', -30, { min: 0 }, [...samples].reverse());
          return a !== null && b !== null && a.worstSeed === b.worstSeed;
        },
      ),
      { numRuns: 150 },
    );
  });

  it('tolerance check passes exactly inside the tolerance and is symmetric about the baseline', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 30 }),
        (baseline, delta, absTol, relPct) => {
          const rel = relPct / 100;
          const tol = Math.max(absTol, rel * baseline);
          const up = withinTolerance(baseline + delta, baseline, absTol, rel);
          const down = withinTolerance(baseline - delta, baseline, absTol, rel);
          const expected = Math.abs(delta) <= tol;
          const report = checkTolerance('median', baseline + delta, baseline, absTol, rel);
          return up === down && up === expected && (report === null) === up;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Wilson interval contains the rate and stays within [0, 1]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 0, max: 500 }), (total, w) => {
        const wins = w % (total + 1);
        const r = winRate(wins, total);
        return 0 <= r.lo && r.lo <= r.rate && r.rate <= r.hi && r.hi <= 1;
      }),
      { numRuns: 300 },
    );
  });
});

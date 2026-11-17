// Property 28: Balance simulator determinism (task 18.9).
// Same Seed set, policies and toggles give identical output for 1 and N workers.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { POLICY_NAMES } from '../../tools/balance/policies';
import { runPool } from '../../tools/balance/pool';
import { FEATURE_KEYS, aggregate, planUnits } from '../../tools/balance/simulator';

describe('Property 28: balance simulator determinism', () => {
  it('identical reports for 1 and N workers and for repeated runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100_000 }),
        fc.subarray([...POLICY_NAMES], { minLength: 1, maxLength: 2 }),
        fc.subarray(FEATURE_KEYS.filter((k) => k !== 'B1G1W1'), { maxLength: 1 }),
        fc.integer({ min: 2, max: 4 }),
        async (baseSeed, policies, toggles, workers) => {
          const units = planUnits({ baseSeed, n: 1, levels: [1], policies, toggles, togglePolicy: 'threeKey' });
          const a = aggregate(await runPool(units, DEFAULT_CONFIG, { workers: 1 }));
          const b = aggregate(await runPool(units, DEFAULT_CONFIG, { workers }));
          const c = aggregate(await runPool(units, DEFAULT_CONFIG, { workers: 1 }));
          expect(JSON.stringify(b)).toBe(JSON.stringify(a));
          expect(JSON.stringify(c)).toBe(JSON.stringify(a));
        },
      ),
      { numRuns: 4 },
    );
  }, 600_000);
});

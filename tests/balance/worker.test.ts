// worker_threads execution (task 18.5).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { chunk, defaultWorkerCount, runPool } from '../../tools/balance/pool';
import { compareUnits, planUnits } from '../../tools/balance/simulator';

describe('balance worker pool', () => {
  it('splits into contiguous chunks that concatenate back to the input', () => {
    const xs = Array.from({ length: 23 }, (_, i) => i);
    for (const k of [1, 2, 3, 7, 23, 40]) {
      const parts = chunk(xs, k);
      expect(parts.flat()).toEqual(xs);
      expect(parts.length).toBeLessThanOrEqual(Math.min(k, xs.length));
      const sizes = parts.map((p) => p.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it('defaults to min(cpuCount - 1, 8) workers, at least 1', () => {
    const k = defaultWorkerCount();
    expect(k).toBeGreaterThanOrEqual(1);
    expect(k).toBeLessThanOrEqual(8);
  });

  it('merges worker results in canonical order and matches the single-thread run', async () => {
    const units = planUnits({ baseSeed: 7, n: 2, levels: [1], policies: ['oneKey', 'bombAggressive'], toggles: ['B0G0W0'], togglePolicy: 'threeKey' });
    const shuffled = [...units].reverse();
    const one = await runPool(shuffled, DEFAULT_CONFIG, { workers: 1 });
    const many = await runPool(shuffled, DEFAULT_CONFIG, { workers: 3 });
    expect(many.map((r) => r.unit)).toEqual([...units].sort(compareUnits));
    expect(many).toEqual(one);
  }, 180_000);
});

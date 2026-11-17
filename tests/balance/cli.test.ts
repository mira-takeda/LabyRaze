// Balance CLI and baseline I/O (task 18.6).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { configHash, measurePlan, seedSetHash, stripMeta } from '../../tools/balance/cli';
import type { Baseline } from '../../tools/balance/cli';

describe('balance CLI helpers', () => {
  it('config hash ignores audio and balance-tool settings and changes with gameplay values', () => {
    const a = configHash(DEFAULT_CONFIG);
    expect(configHash({ ...DEFAULT_CONFIG, audio: { ...DEFAULT_CONFIG.audio, maxVoices: 3 } })).toBe(a);
    expect(configHash({ ...DEFAULT_CONFIG, balanceBand: { p5Min: 9, medianMax: 10 }, balanceFullSeeds: 7 })).toBe(a);
    expect(configHash({ ...DEFAULT_CONFIG, bombRadius: 1.5 })).not.toBe(a);
    expect(configHash({ ...DEFAULT_CONFIG, prefilterBand: { min: 1, max: 2 } })).not.toBe(a);
  });

  it('seed-set hash identifies the plan', () => {
    expect(seedSetHash(measurePlan(10, 1))).toBe(seedSetHash(measurePlan(10, 1)));
    expect(seedSetHash(measurePlan(10, 1))).not.toBe(seedSetHash(measurePlan(11, 1)));
    expect(seedSetHash(measurePlan(10, 1))).not.toBe(seedSetHash(measurePlan(10, 2)));
  });

  it('the measure plan covers levels 1, 5, 10, 20, 40, all policies and all toggles', () => {
    const p = measurePlan(3, 1);
    expect([...p.levels]).toEqual([1, 5, 10, 20, 40]);
    expect(p.policies).toHaveLength(8);
    expect(p.toggles).toHaveLength(7);
  });

  it('stripMeta drops only gitDescribe and toolVersion', () => {
    const b = { schema: 1, meta: { seedSetHash: 's', configHash: 'c', gitDescribe: 'g', toolVersion: 't', n: 1, baseSeed: 1, levels: [1], policies: [], toggles: [] } } as unknown as Baseline;
    const s = stripMeta(b);
    expect(s.meta).toEqual({ seedSetHash: 's', configHash: 'c', n: 1, baseSeed: 1, levels: [1], policies: [], toggles: [] });
  });
});

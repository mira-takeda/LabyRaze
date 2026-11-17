// Balance smoke integration test (task 19.8): a small fixed Seed set lies within the committed
// Balance_Baseline bands; a deliberately shifted statistic fails with the statistic and worst Seed.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { readBaseline } from '../../tools/balance/cli';
import { runPool } from '../../tools/balance/pool';
import { aggregate, checkReport, planUnits } from '../../tools/balance/simulator';

const baseline = readBaseline();

describe('balance smoke', () => {
  it('a committed baseline with bands exists', () => {
    expect(baseline, 'tools/balance/baseline.json is missing: run npm run balance:measure').not.toBeNull();
    expect(baseline!.bands.p5Min).toBeGreaterThan(0);
    expect(baseline!.bands.medianMax).toBeGreaterThan(baseline!.bands.p5Min);
  });

  it('a small fixed Seed set lies within the committed bands', async () => {
    const units = planUnits({ baseSeed: 700_001, n: 12, levels: [1], policies: ['threeKey'], toggles: [], togglePolicy: 'threeKey' });
    const report = aggregate(await runPool(units, DEFAULT_CONFIG, { workers: 1 }));
    // Banded statistics only (p5 and median); the centre tolerance needs the larger check Seed set.
    const failures = checkReport(report, baseline!.report, baseline!.bands, { policies: ['threeKey'] }).filter((f) => f.stat !== 'ratio.median~baseline');
    expect(failures).toEqual([]);
  }, 300_000);

  it('a deliberately shifted statistic fails, naming the statistic and the worst Seed', async () => {
    const units = planUnits({ baseSeed: 700_001, n: 6, levels: [1], policies: ['threeKey'], toggles: [], togglePolicy: 'threeKey' });
    const report = aggregate(await runPool(units, DEFAULT_CONFIG, { workers: 1 }));
    const cs = report.stats.B1G1W1!['1']!.threeKey!;
    // Shift every ratio far below the band.
    const shifted = {
      ...report,
      stats: { B1G1W1: { '1': { threeKey: { ...cs, ratio: { ...cs.ratio!, p5: 0.01, median: 0.02 }, ratioSamples: cs.ratioSamples.map((s, i) => ({ seed: s.seed, value: 0.01 + i * 0.001 })) } } } },
    };
    const f = checkReport(shifted, baseline!.report, baseline!.bands, { policies: ['threeKey'] });
    const p5 = f.find((x) => x.stat === 'ratio.p5');
    expect(p5).toBeDefined();
    expect(p5!.worstSeed).toBe(cs.ratioSamples[0]!.seed);
    expect(p5!.policy).toBe('threeKey');
  }, 300_000);
});

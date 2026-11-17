// Simulator check mode (task 18.4): bands plus tolerance, offending statistic and worst Seed.
import { describe, expect, it } from 'vitest';
import { checkReport, proposeBands } from '../../tools/balance/simulator';
import type { CellStats, MeasureReport } from '../../tools/balance/simulator';
import { summarize } from '../../tools/balance/stats';

function cell(values: Array<[number, number]>): CellStats {
  return {
    ratio: summarize(values.map(([, v]) => v)),
    ratioSamples: values.map(([seed, value]) => ({ seed, value })),
    rescueTicks: summarize([100]),
    timeouts: 0,
    winRatePlayer: 0.5,
    winRateHunter: 0.5,
    winRatePlayerCI: [0.4, 0.6],
    livesLostMean: 0,
    ghostHunt: { pickups: 0, catchesPerPickup: null, zeroCatchFraction: 0 },
    bombs: { collected: 0, detonated: 0, wallsPerBomb: 0 },
    wisps: { collectedMean: 0, maxComboMedian: 1, wispScoreShare: 0 },
  };
}

function report(values: Array<[number, number]>): MeasureReport {
  return {
    schema: 1,
    levels: [1],
    n: values.length,
    stats: { B1G1W1: { '1': { threeKey: cell(values) } } },
    pelletClear: {},
    pelletClearTimeouts: {},
    generation: { attemptsMean: 1, repairsMean: 0, fallbackCount: 0, units: 1 },
  };
}

const base = report([[1, 2.0], [2, 2.2], [3, 2.4], [4, 2.6], [5, 2.8]]);

describe('balance check', () => {
  it('proposes bands from the measured distribution with the margin', () => {
    const b = proposeBands(base, 'threeKey', 0.1, 0.15);
    const cs = base.stats.B1G1W1!['1']!.threeKey!;
    expect(b.p5Min).toBeLessThanOrEqual(cs.ratio!.p5 * 0.9 + 1e-9);
    expect(b.medianMax).toBeGreaterThanOrEqual(cs.ratio!.median * 1.1 - 1e-9);
  });

  it('passes a report equal to the baseline', () => {
    const b = proposeBands(base, 'threeKey', 0.1, 0.15);
    expect(checkReport(base, base, b)).toEqual([]);
  });

  it('a shifted statistic fails with the offending statistic, observed value and worst Seed', () => {
    const b = proposeBands(base, 'threeKey', 0.1, 0.15);
    const low = report([[11, 0.4], [12, 2.0], [13, 2.1], [14, 2.2], [15, 2.3]]);
    const f = checkReport(low, base, b);
    const p5 = f.find((x) => x.stat === 'ratio.p5');
    expect(p5).toBeDefined();
    expect(p5!.worstSeed).toBe(11);
    expect(p5!.policy).toBe('threeKey');
    expect(p5!.level).toBe('1');

    const high = report([[21, 4.0], [22, 4.2], [23, 4.4], [24, 4.6], [25, 9.0]]);
    const g = checkReport(high, base, b);
    const med = g.find((x) => x.stat === 'ratio.median');
    expect(med).toBeDefined();
    expect(med!.worstSeed).toBe(25);
    expect(g.some((x) => x.stat === 'ratio.median~baseline')).toBe(true);
  });
});

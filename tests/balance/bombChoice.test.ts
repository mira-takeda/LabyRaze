// Bomb radius and count choices (tasks 19.3 and 19.4). The design rules are applied unchanged.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { RULES } from '../../tools/balance/calibrate';
import type { CalibrationOutput } from '../../tools/balance/calibrate';
import { readBaseline } from '../../tools/balance/cli';
const cal = readBaseline()?.calibration as Record<string, CalibrationOutput> | undefined;
describe('Bomb choices', () => {
  it('bombRadius sweeps 1.5..3.5 and the chosen radius is the largest qualifying one', () => {
    const r = cal!.bombRadius!;
    expect(r.sweep.map((x) => x.radius)).toEqual([1.5, 2, 2.5, 3, 3.5]);
    const ok = r.sweep.filter((x) => (x.wallsPerBomb as number) <= RULES.bombMaxWalls && (x.ratioShift as number) <= RULES.bombRatioShift && (x.detonated as number) > 0);
    if (ok.length === 0) {
      expect(r.chosen).toBeNull();
      return;
    }
    expect(r.chosen!.radius).toBe(ok[ok.length - 1]!.radius);
    expect(DEFAULT_CONFIG.bombRadius).toBe(r.chosen!.radius);
  });
  it('bombsPerLevel x bombFairnessDelta sweeps 1..4 x 0..5 under the unchanged win-rate rule', () => {
    const b = cal!.bombs!;
    expect(b.sweep).toHaveLength(24);
    expect(b.justification).not.toMatch(/replaced|dropped/);
    const ok = b.sweep.filter((x) => (x.winAggressive as number) <= RULES.playerWinRateCeiling && (x.winAggressive as number) >= (x.winNone as number) - RULES.bombWinMargin);
    if (ok.length === 0) {
      expect(b.chosen).toBeNull();
      expect(DEFAULT_CONFIG.bombsPerLevel).toBe(b.kept!.bombsPerLevel);
      expect(DEFAULT_CONFIG.bombFairnessDelta).toBe(b.kept!.bombFairnessDelta);
      return;
    }
    const row = b.sweep.find((x) => x.bombsPerLevel === b.chosen!.bombsPerLevel && x.bombFairnessDelta === b.chosen!.bombFairnessDelta)!;
    expect(row.qualifies).toBe(true);
    expect(DEFAULT_CONFIG.bombsPerLevel).toBe(b.chosen!.bombsPerLevel);
    expect(DEFAULT_CONFIG.bombFairnessDelta).toBe(b.chosen!.bombFairnessDelta);
  });
});
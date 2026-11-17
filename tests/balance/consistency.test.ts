// Baseline consistency (task 19.9): the committed baseline, config.ts and open-decisions.md agree.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { readBaseline } from '../../tools/balance/cli';
import { baselineCompatibility } from '../../tools/balance/compatibility';
import type { CalibrationOutput } from '../../tools/balance/calibrate';

const baseline = readBaseline();
const decisions = readFileSync('.kiro/steering/open-decisions.md', 'utf8');
const cal = (baseline?.calibration ?? {}) as Partial<Record<string, CalibrationOutput>>;

describe('baseline consistency', () => {
  it('compatibility rejects changed defaults and hashes other gameplay changes', () => {
    for (const patch of [
      { hunterSpeedPermille: 1100 }, { oneUpThresholds: [9999] }, { oneUpRepeat: 40000 },
      { celebrationFirstLevel: 99 }, { celebrationEvery: 40 },
    ]) expect(baselineCompatibility({ ...DEFAULT_CONFIG, ...patch }).problems.length).toBeGreaterThan(0);
    expect(baselineCompatibility({ ...DEFAULT_CONFIG, bombRadius: 1.5 }).hash).not.toBe(baselineCompatibility(DEFAULT_CONFIG).hash);
  });
  it('the baseline exists and was measured with a compatible config', () => {
    expect(baseline).not.toBeNull();
    // The baseline predates five config fields (1UP x2, celebrations x2, difficulty x1).
    // neutrality.test.ts proves each of them is behavior-neutral at its default value on
    // the balance workload, so they are stripped for the legacy-hash comparison — the same
    // convention tools/balance/verifyBaseline.ts uses for prefilterBand. The baseline file
    // itself is historical evidence and is never rewritten; every stripped field is pinned
    // at its proven-neutral value below, so any gameplay change still fails this test.
    const compat = baselineCompatibility(DEFAULT_CONFIG);
    expect(compat.problems).toEqual([]);
    expect(baseline!.meta.configHash).toBe(compat.hash);
    expect(DEFAULT_CONFIG.hunterSpeedPermille).toBe(1000);
    expect(DEFAULT_CONFIG.oneUpThresholds).toEqual([10000, 25000, 50000]);
    expect(DEFAULT_CONFIG.oneUpRepeat).toBe(50000);
    expect(DEFAULT_CONFIG.celebrationFirstLevel).toBe(100);
    expect(DEFAULT_CONFIG.celebrationEvery).toBe(50);
  });

  it('contains the Ghost Hunt sweep and its chosen value equals config.ghostHuntTicks', () => {
    const gh = cal.ghostHunt!;
    expect(gh.sweep.length).toBeGreaterThanOrEqual(12);
    expect(DEFAULT_CONFIG.ghostHuntTicks).toBe((gh.chosen ?? gh.kept)!.ticks);
    expect(gh.justification.length).toBeGreaterThan(20);
  });

  it('bombRadius, bombsPerLevel, bombFairnessDelta and wispDensity equal the chosen values', () => {
    const pick = (c: CalibrationOutput | undefined): Record<string, number> => (c!.chosen ?? c!.kept ?? {}) as Record<string, number>;
    expect(DEFAULT_CONFIG.bombRadius).toBe(pick(cal.bombRadius).radius);
    expect(DEFAULT_CONFIG.bombsPerLevel).toBe(pick(cal.bombs).bombsPerLevel);
    expect(DEFAULT_CONFIG.bombFairnessDelta).toBe(pick(cal.bombs).bombFairnessDelta);
    // An explicit, user-approved override with a recorded reason may differ from the rule pick.
    const wo = (cal.wisps as unknown as { override?: { density: number; approvedBy: string; reason: string } }).override;
    if (wo) {
      expect(wo.approvedBy).toBe('user');
      expect(wo.reason.length).toBeGreaterThan(40);
      expect(DEFAULT_CONFIG.wispDensity).toBe(wo.density);
    } else {
      expect(DEFAULT_CONFIG.wispDensity).toBe(pick(cal.wisps).density);
    }
    expect(DEFAULT_CONFIG.comboCap).toBe(cal.combo!.chosen!.comboCap);
    expect(DEFAULT_CONFIG.comboWindowTicks).toBe(cal.combo!.chosen!.comboWindowTicks);
  });

  it('balanceBand equals the committed bands and the placeholders are gone', () => {
    expect(DEFAULT_CONFIG.balanceBand).toEqual({ p5Min: baseline!.bands.p5Min, medianMax: baseline!.bands.medianMax });
    expect(DEFAULT_CONFIG.balanceFullSeeds).toBe(baseline!.meta.n);
    expect(DEFAULT_CONFIG.balanceBand).not.toEqual({ p5Min: 1.3, medianMax: 3.0 });
  });

  it('open-decisions.md records every tuned value', () => {
    for (const v of [
      `ghostHuntTicks = ${DEFAULT_CONFIG.ghostHuntTicks}`,
      `bombRadius = ${DEFAULT_CONFIG.bombRadius}`,
      `bombsPerLevel = ${DEFAULT_CONFIG.bombsPerLevel}`,
      `bombFairnessDelta = ${DEFAULT_CONFIG.bombFairnessDelta}`,
      `wispDensity = ${DEFAULT_CONFIG.wispDensity}`,
      `comboWindowTicks = ${DEFAULT_CONFIG.comboWindowTicks}`,
      `p5Min = ${DEFAULT_CONFIG.balanceBand.p5Min}`,
      `medianMax = ${DEFAULT_CONFIG.balanceBand.medianMax}`,
      `balanceFullSeeds = ${DEFAULT_CONFIG.balanceFullSeeds}`,
    ]) {
      expect(decisions, v).toContain(v);
    }
  });
});

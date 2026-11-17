// Ghost Hunt duration choice (task 19.2): the committed sweep covers 240..900 in steps of 60 (widened
// when nothing qualifies) and the choice follows the design rule exactly. When no duration qualifies
// the provisional value is kept and the reason is recorded; no criterion is dropped.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { RULES } from '../../tools/balance/calibrate';
import type { CalibrationOutput } from '../../tools/balance/calibrate';
import { readBaseline } from '../../tools/balance/cli';
const gh = (readBaseline()?.calibration as Record<string, CalibrationOutput> | undefined)?.ghostHunt;
describe('Ghost Hunt duration choice', () => {
  it('the sweep starts with the 12 design durations and records the metrics', () => {
    expect(gh, 'run npm run balance:calibrate -- ghostHunt, then balance:measure').toBeDefined();
    expect(gh!.sweep.slice(0, 12).map((r) => r.ticks)).toEqual([240, 300, 360, 420, 480, 540, 600, 660, 720, 780, 840, 900]);
    for (const r of gh!.sweep) for (const k of ['catchesMean', 'catchesP95', 'zeroCatchFraction', 'hunterWinRate', 'humanHunterWinRate']) expect(r[k], k).toBeTypeOf('number');
  });
  it('applies the design rule unchanged and config uses the result', () => {
    const ok = gh!.sweep.filter(
      (r) => (r.catchesMean as number) >= RULES.ghostHuntMinCatches && (r.catchesP95 as number) <= RULES.ghostHuntMaxP95 && (r.hunterWinRate as number) >= RULES.hunterWinRateFloor,
    );
    expect(gh!.justification).not.toMatch(/dropped|replaced/);
    if (ok.length === 0) {
      expect(gh!.chosen).toBeNull();
      expect(gh!.kept).toBeDefined();
      expect(DEFAULT_CONFIG.ghostHuntTicks).toBe(gh!.kept!.ticks);
      expect(gh!.justification).toContain('kept unchanged');
      return;
    }
    expect(gh!.chosen!.ticks).toBe(ok[0]!.ticks);
    expect(DEFAULT_CONFIG.ghostHuntTicks).toBe(gh!.chosen!.ticks);
  });
});
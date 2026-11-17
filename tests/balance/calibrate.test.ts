// Calibration sweeps (task 18.4): shape, selection rules and the full sweep table.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { CALIBRATIONS, RULES, calibrate } from '../../tools/balance/calibrate';

const cfg = DEFAULT_CONFIG;
const quiet = { workers: 1, log: (): void => undefined };

describe('balance calibrate', () => {
  it('names the five sweeps', () => {
    expect([...CALIBRATIONS]).toEqual(['ghostHunt', 'bombRadius', 'bombs', 'wisps', 'combo']);
  });

  it('bombRadius sweeps 1.5 to 3.5 in steps of 0.5 and only chooses a qualifying radius', async () => {
    const out = await calibrate('bombRadius', cfg, { ...quiet, n: 2 });
    expect(out.sweep.map((s) => s.radius)).toEqual([1.5, 2, 2.5, 3, 3.5]);
    if (out.chosen) {
      const row = out.sweep.find((s) => s.radius === out.chosen!.radius)!;
      expect(row.qualifies).toBe(true);
      expect(row.wallsPerBomb as number).toBeLessThanOrEqual(RULES.bombMaxWalls);
      expect(out.justification).toContain('Largest radius');
    } else {
      expect(out.justification).toContain('No radius');
    }
  }, 300_000);

  it('combo keeps the window unless the cap is never or always reached', async () => {
    const out = await calibrate('combo', cfg, { ...quiet, n: 2 });
    expect(out.sweep.map((s) => s.comboWindowTicks)).toEqual([60, 90, 120, 150, 180]);
    expect(out.chosen).not.toBeNull();
    expect(out.justification.length).toBeGreaterThan(10);
  }, 300_000);
});

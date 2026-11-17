// Captive wobble: caged ghosts drift and glance around on render time only.
import { describe, expect, it } from 'vitest';
import { captiveWobble } from '../../src/render/allies';

describe('captiveWobble', () => {
  it('is deterministic and stays within a couple of pixels', () => {
    for (const t of [0, 333, 1000, 7777]) {
      for (const i of [0, 1, 2]) {
        expect(captiveWobble(t, i)).toEqual(captiveWobble(t, i));
        const { dx, dy, dir } = captiveWobble(t, i);
        expect(Math.abs(dx)).toBeLessThanOrEqual(2);
        expect(Math.abs(dy)).toBeLessThanOrEqual(2);
        expect([null, 'left', 'right']).toContain(dir);
      }
    }
  });

  it('moves over time with independent timing per ghost', () => {
    const seen = [new Set<string>(), new Set<string>(), new Set<string>()];
    for (let t = 0; t < 12000; t += 120) {
      for (const i of [0, 1, 2] as const) {
        const { dx, dy } = captiveWobble(t, i);
        seen[i]!.add(`${dx},${dy}`);
      }
    }
    for (const i of [0, 1, 2] as const) expect(seen[i]!.size, `ghost ${i}`).toBeGreaterThan(3);
    // Not lockstep: the three ghosts disagree most of the time.
    let disagree = 0;
    for (let t = 0; t < 12000; t += 120) {
      const ds = [captiveWobble(t, 0), captiveWobble(t, 1), captiveWobble(t, 2)].map((w) => `${w.dx},${w.dy}`);
      if (new Set(ds).size > 1) disagree++;
    }
    expect(disagree).toBeGreaterThan(80);
  });

  it('glances left and right over time', () => {
    const dirs = new Set<string>();
    for (let t = 0; t < 20000; t += 150) {
      for (const i of [0, 1, 2] as const) dirs.add(String(captiveWobble(t, i).dir));
    }
    expect(dirs.has('left')).toBe(true);
    expect(dirs.has('right')).toBe(true);
  });
});

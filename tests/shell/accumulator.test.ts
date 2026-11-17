// Property 2: Accumulator tick count (task 22.9).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_FRAME_MS, MAX_TICKS_PER_FRAME, TICK_MS, advance, createAccumulator } from '../../src/shell/loop';

describe('Property 2: accumulator tick count', () => {
  it('without clamping, total Ticks equal floor(total time / Tick) within one Tick; alpha stays in [0, 1)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: TICK_MS * MAX_TICKS_PER_FRAME * 0.99, noNaN: true }), { minLength: 1, maxLength: 400 }), (deltas) => {
        const a = createAccumulator();
        advance(a, 0);
        let t = 0;
        let ticks = 0;
        for (const d of deltas) {
          t += d;
          const r = advance(a, t);
          ticks += r.ticks;
          expect(r.ticks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
          expect(r.alpha).toBeGreaterThanOrEqual(0);
          expect(r.alpha).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(ticks - Math.floor(t / TICK_MS))).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });

  it('long frames are clamped: never more than MAX_TICKS_PER_FRAME Ticks per frame', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 5000, noNaN: true }), { minLength: 1, maxLength: 100 }), (deltas) => {
        const a = createAccumulator();
        advance(a, 0);
        let t = 0;
        for (const d of deltas) {
          t += d;
          const r = advance(a, t);
          expect(r.ticks).toBeLessThanOrEqual(Math.min(MAX_TICKS_PER_FRAME, Math.ceil(MAX_FRAME_MS / TICK_MS)));
        }
      }),
      { numRuns: 200 },
    );
  });
});

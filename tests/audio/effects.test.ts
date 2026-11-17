// Reactive music effects (task 29.4) and Properties 46 and 25 (part of task 29.7).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { CRUSH_ATTACK_S, CRUSH_HOLD_S, MusicEffects, RATE_HARD_CAP, crushCurve, equalPower, urgencyTargets } from '../../src/audio/effects';
import { MockAudioContext } from './mockAudio';
import type { MockParam } from './mockAudio';

const acfg = DEFAULT_CONFIG.audio;

describe('music effects chain', () => {
  it('is source -> shelf -> (dry | crusher -> low-pass -> wet) -> output; idle is fully dry', () => {
    const ctx = new MockAudioContext();
    const out = ctx.createGain();
    const fx = new MusicEffects(ctx, out, acfg);
    const edge = (a: unknown, b: unknown): boolean => ctx.edges.some((e) => e.from === a && e.to === b);
    expect(fx.input.type).toBe('highshelf');
    expect(edge(fx.input, fx.dry)).toBe(true);
    expect(edge(fx.input, fx.crusher)).toBe(true);
    expect(edge(fx.crusher, fx.lowpass)).toBe(true);
    expect(edge(fx.lowpass, fx.wet)).toBe(true);
    expect(edge(fx.dry, out) && edge(fx.wet, out)).toBe(true);
    expect(fx.dry.gain.value).toBeCloseTo(1, 9);
    expect(fx.wet.gain.value).toBeCloseTo(0, 9);
    expect(fx.crusher.oversample).toBe('none');
  });

  it('the crush curve is a 2^bits staircase in [-1, 1]', () => {
    const c = crushCurve(5);
    expect(new Set(Array.from(c).map((v) => v.toFixed(6))).size).toBe(32);
    expect(Math.min(...c)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...c)).toBeLessThanOrEqual(1);
  });

  it('equal-power crossfade keeps dry^2 + wet^2 = 1', () => {
    for (const m of [0, 0.2, 0.35, 0.7, 1]) {
      const g = equalPower(m);
      expect(g.dry * g.dry + g.wet * g.wet).toBeCloseTo(1, 9);
    }
  });

  it('Property 46: a Key pickup bitcrush ramps to the intensity, returns to dry, and retriggers from the current value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 1000 }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 1.2, noNaN: true }), { minLength: 1, maxLength: 4 }),
        (ms, intensity, gaps) => {
          const ctx = new MockAudioContext();
          const cfg = { ...acfg, soundtrackDistortionMs: ms, soundtrackDistortionIntensity: intensity };
          const fx = new MusicEffects(ctx, ctx.createGain(), cfg);
          for (const gap of gaps) {
            ctx.advance(gap * (ms / 1000));
            const before = fx.currentMix();
            fx.triggerCrush();
            const wet = (fx.wet.gain as unknown as MockParam).calls;
            const n = wet.length;
            const [cancel, set, ramp, back] = wet.slice(n - 4);
            expect(cancel!.op).toBe('cancelScheduledValues');
            expect(set!.op).toBe('setValueAtTime');
            // Retrigger starts from the current mix, never a hard reset.
            expect(set!.value).toBeCloseTo(equalPower(before).wet, 6);
            expect(ramp!.op).toBe('linearRampToValueAtTime');
            expect(ramp!.value).toBeCloseTo(equalPower(intensity).wet, 6);
            expect(ramp!.time).toBeCloseTo(ctx.currentTime + CRUSH_ATTACK_S, 9);
            expect(back!.op).toBe('setTargetAtTime');
            expect(back!.value).toBe(0);
            // The return is complete (within 2% of dry) by distortionMs plus the exponential tail.
            const release = Math.max(0.01, Math.min(1, Math.max(0.05, ms / 1000)) - CRUSH_ATTACK_S - CRUSH_HOLD_S);
            expect(back!.timeConstant!).toBeCloseTo(release / 4, 9);
            for (const c of wet) if (c.op !== 'cancelScheduledValues') {
              expect(c.value).toBeGreaterThanOrEqual(0);
              expect(c.value).toBeLessThanOrEqual(1);
            }
          }
          ctx.advance(10);
          expect(fx.currentMix()).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 25: urgency is monotone, bounded by the max shift (<= 0.08) and disable-able', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1.6, noNaN: true }),
        fc.double({ min: 1, max: 1.6, noNaN: true }),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        fc.constantFrom<'off' | 'rate' | 'rate+filter'>('off', 'rate', 'rate+filter'),
        (a0, b0, shift, mode) => {
          const [a, b] = a0 <= b0 ? [a0, b0] : [b0, a0];
          const c = { soundtrackMaxRateShift: shift, soundtrackUrgency: mode, soundtrackUrgencyShelfDb: 2 };
          const ta = urgencyTargets(a, 1.6, c);
          const tb = urgencyTargets(b, 1.6, c);
          expect(ta.rate).toBeLessThanOrEqual(tb.rate + 1e-12);
          expect(tb.rate).toBeGreaterThanOrEqual(1);
          expect(tb.rate).toBeLessThanOrEqual(1 + Math.min(shift, RATE_HARD_CAP) + 1e-12);
          expect(ta.shelfDb).toBeLessThanOrEqual(tb.shelfDb + 1e-12);
          if (mode === 'off') {
            expect(ta).toEqual({ rate: 1, shelfDb: 0 });
            expect(tb).toEqual({ rate: 1, shelfDb: 0 });
          }
          if (mode === 'rate') expect(tb.shelfDb).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('setUrgency ramps the shelf gain with cancelScheduledValues first', () => {
    const ctx = new MockAudioContext();
    const fx = new MusicEffects(ctx, ctx.createGain(), acfg);
    const t = fx.setUrgency(1.6, 1.6);
    expect(t.rate).toBeCloseTo(1 + acfg.soundtrackMaxRateShift, 9);
    const calls = (fx.input.gain as unknown as MockParam).calls;
    expect(calls.map((c) => c.op)).toEqual(['cancelScheduledValues', 'setTargetAtTime']);
    expect(calls[1]!.value).toBeCloseTo(acfg.soundtrackUrgencyShelfDb, 9);
  });
});

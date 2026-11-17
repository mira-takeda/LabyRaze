// Quality tier controller (task 27.1).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { DOWNGRADE_AFTER_MS, QualityController, RECOVER_AFTER_MS, TIER_SETTINGS } from '../../src/render/quality';

describe('quality controller', () => {
  it('steps down after 2 s of p95 above 16.7 ms and not before', () => {
    const q = new QualityController();
    let t = 0;
    for (let i = 0; i < 200 && t < DOWNGRADE_AFTER_MS - 100; i++) {
      q.record(30, t);
      t += 33;
    }
    expect(q.tier).toBe('high');
    for (let i = 0; i < 40; i++) {
      q.record(30, t);
      t += 33;
    }
    expect(q.tier).toBe('medium');
  });

  it('recovers only after 10 s of good frames (hysteresis)', () => {
    const q = new QualityController(['high', 'medium', 'low'], 'low');
    let t = 0;
    while (t < RECOVER_AFTER_MS - 500) {
      q.record(5, t);
      t += 16;
    }
    expect(q.tier).toBe('low');
    while (t < RECOVER_AFTER_MS + 1000) {
      q.record(5, t);
      t += 16;
    }
    expect(q.tier).toBe('medium');
  });

  it('tiers only change visual settings; low disables glow and trails but keeps the camera shake', () => {
    expect(TIER_SETTINGS.low).toMatchObject({ glow: false, trailEvery: 0, shake: true });
    expect(TIER_SETTINGS.high.particleDensity).toBeGreaterThan(TIER_SETTINGS.medium.particleDensity);
    const s = createRun(1, DEFAULT_CONFIG).state;
    const snap = structuredClone(s);
    const q = new QualityController();
    for (let i = 0; i < 500; i++) q.record(40, i * 33);
    expect(s).toEqual(snap);
  });
});

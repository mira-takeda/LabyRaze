// Task 37.3: level milestone celebration overlay (render only).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createRun } from '../../src/core/sim';
import { CELEBRATION_MS, CelebrationLayer } from '../../src/render/celebration';
import { ParticlePool } from '../../src/render/particles';
import { TIER_SETTINGS } from '../../src/render/quality';
import { Renderer } from '../../src/render/renderer';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

const cfg = DEFAULT_CONFIG;
const ev: GameEvent = { t: 'LevelMilestone', level: 150 };

function frames(c: CelebrationLayer, pool: ParticlePool, from: number, to: number, m = mockCtx()): ReturnType<typeof mockCtx> {
  for (let t = from; t <= to; t += 16) {
    pool.update(0.016);
    c.draw(m.ctx, t, 504, 568);
  }
  return m;
}

describe('celebration layer', () => {
  it('shows CONGRATULATIONS! letter by letter and LEVEL N below', () => {
    const pool = new ParticlePool(cfg.particleCap);
    const c = new CelebrationLayer(pool);
    c.handle([ev], 1000);
    const m = mockCtx();
    c.draw(m.ctx, 1050, 504, 568);
    const letters = m.calls
      .filter((k) => k.op === 'fillText' && String(k.args[0]).length === 1 && k.fillStyle !== '#0b0614')
      .map((k) => String(k.args[0]))
      .join('');
    expect(letters).toBe('CONGRATULATIONS!');
    expect(letters).toContain('CONGRATULATIONS!');
    expect(m.texts()).toContain('LEVEL 150');
    const ys = m.calls.filter((k) => k.op === 'fillText');
    const levelY = ys.find((k) => k.args[0] === 'LEVEL 150')!.args[2] as number;
    const titleY = ys.find((k) => k.args[0] === 'C')!.args[2] as number;
    expect(levelY).toBeGreaterThan(titleY);
  });

  it('draws nothing before the event and after the duration; finish() ends it early', () => {
    const pool = new ParticlePool(cfg.particleCap);
    const c = new CelebrationLayer(pool);
    expect(frames(c, pool, 0, 100).calls.length).toBe(0);
    c.handle([ev], 1000);
    expect(c.isActive(1000 + CELEBRATION_MS - 1)).toBe(true);
    expect(c.isActive(1000 + CELEBRATION_MS)).toBe(false);
    c.finish(1500);
    expect(c.isActive(1500)).toBe(false);
  });

  it('spawns fireworks and confetti but never beyond the particle cap', () => {
    const pool = new ParticlePool(60);
    const c = new CelebrationLayer(pool);
    c.handle([ev], 0);
    frames(c, pool, 0, CELEBRATION_MS);
    expect(pool.active).toBeGreaterThan(0);
    expect(pool.active).toBeLessThanOrEqual(60);
  });

  it('the low quality tier spawns fewer particles than the high tier', () => {
    const count = (density: number): number => {
      const pool = new ParticlePool(5000);
      pool.density = density;
      const c = new CelebrationLayer(pool);
      c.handle([ev], 0);
      frames(c, pool, 0, 700);
      return pool.active;
    };
    expect(count(TIER_SETTINGS.low.particleDensity)).toBeLessThan(count(TIER_SETTINGS.high.particleDensity));
  });

  it('reduced motion: weaker golden flash, flat text, fewer bursts', () => {
    const run = (reduced: boolean): { flash: number; ys: Set<number>; active: number } => {
      const pool = new ParticlePool(5000);
      const c = new CelebrationLayer(pool);
      c.flashScale = reduced ? 0.4 : 1;
      c.motionEnabled = !reduced;
      c.handle([ev], 0);
      const m = mockCtx();
      c.draw(m.ctx, 10, 504, 568);
      const flash = Math.max(0, ...m.calls.filter((k) => k.op === 'fillRect' && k.fillStyle === '#ffd95a').map((k) => k.globalAlpha));
      const ys = new Set<number>();
      for (let t = 100; t < 1500; t += 50) {
        const mm = mockCtx();
        c.draw(mm.ctx, t, 504, 568);
        for (const k of mm.calls) if (k.op === 'fillText' && k.args[0] === 'N' && k.fillStyle === '#ffd95a') ys.add(k.args[2] as number);
      }
      return { flash, ys, active: pool.active };
    };
    const full = run(false);
    const calm = run(true);
    expect(calm.flash).toBeLessThan(full.flash);
    expect(calm.ys.size).toBe(1);
    expect(full.ys.size).toBeGreaterThan(1);
    expect(calm.active).toBeLessThan(full.active);
  });

  it('never shakes the camera and never mutates the state or events (deep-frozen)', () => {
    const s = createRun(1, cfg).state;
    const snapshot = structuredClone(s);
    const pool = new ParticlePool(cfg.particleCap);
    const c = new CelebrationLayer(pool);
    const m = mockCtx();
    const r = new Renderer(m.ctx, cfg, mockFactory().factory);
    r.layers = { particles: pool, celebration: c };
    const events = Object.freeze([Object.freeze({ ...ev })]);
    r.draw(s, { alpha: 0, timeMs: 0 });
    r.onEvents(events, 16);
    for (let i = 1; i < 40; i++) {
      r.draw(s, { alpha: 0, timeMs: 16 + i * 16 });
      expect(pool.active).toBeLessThanOrEqual(cfg.particleCap);
    }
    expect(r.lastShake).toEqual({ x: 0, y: 0 });
    expect(s).toEqual(snapshot);
    expect(m.texts()).toContain('LEVEL 150');
  });
});

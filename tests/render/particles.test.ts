// Particle pool and emitters (task 26.1) and Property 24 (particle pool bounds).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EXPLOSION_PARTICLE_MAX, Emitters, ParticleKind, ParticlePool, VisualRng, WISP_SPARKS } from '../../src/render/particles';
import { mockCtx } from '../helpers/mockCanvas';

describe('particle pool', () => {
  it('never exceeds its capacity, drops on full and reuses freed slots', () => {
    const p = new ParticlePool(10);
    for (let i = 0; i < 15; i++) p.spawn(0, 0, 1, 1, 0.5, 2, ParticleKind.Spark, 0xffffff);
    expect(p.active).toBe(10);
    expect(p.dropped).toBe(5);
    p.update(1);
    expect(p.active).toBe(0);
    expect(p.spawn(0, 0, 0, 0, 1, 1, 0, 0)).toBe(true);
    expect(p.active).toBe(1);
  });

  it('Property 24: for any spawn/update sequence the active count stays within the cap and no arrays are reallocated', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), fc.array(fc.oneof(fc.integer({ min: 0, max: 80 }), fc.double({ min: -0.1, max: 1, noNaN: true })), { maxLength: 60 }), (cap, ops) => {
        const p = new ParticlePool(cap);
        const arrays = [p.x, p.y, p.vx, p.vy, p.life, p.kind, p.color];
        for (const op of ops) {
          if (Number.isInteger(op)) for (let i = 0; i < op; i++) p.spawn(1, 1, 1, 1, 0.3, 2, 0, 0xff00ff);
          else p.update(op);
          expect(p.active).toBeGreaterThanOrEqual(0);
          expect(p.active).toBeLessThanOrEqual(cap);
        }
        expect([p.x, p.y, p.vx, p.vy, p.life, p.kind, p.color]).toEqual(arrays);
        arrays.forEach((a, i) => expect(a).toBe([p.x, p.y, p.vx, p.vy, p.life, p.kind, p.color][i]));
      }),
      { numRuns: 150 },
    );
  });

  it('emitters respect their budgets and the quality density', () => {
    const p = new ParticlePool(500);
    const e = new Emitters(p);
    e.wispSparkles(10, 10);
    expect(p.active).toBe(WISP_SPARKS);
    p.clear();
    e.bombDebris(Array.from({ length: 21 }, (_, i) => ({ x: i, y: i })));
    expect(p.active).toBeLessThanOrEqual(EXPLOSION_PARTICLE_MAX);
    p.clear();
    p.density = 0.3;
    e.powerBurst(0, 0);
    expect(p.active).toBe(Math.round(16 * 0.3));
  });

  it('uses a visual-only PRNG and draws live particles', () => {
    const a = new VisualRng(5);
    const b = new VisualRng(5);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    const p = new ParticlePool(4);
    p.spawn(5, 5, 0, 0, 1, 3, ParticleKind.Pixel, 0x112233);
    const m = mockCtx();
    p.draw(m.ctx);
    expect(m.rects()).toHaveLength(1);
    expect(m.rects()[0]!.fill).toBe('rgb(17,34,51)');
  });
});

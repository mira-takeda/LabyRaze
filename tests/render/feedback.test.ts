// Task 36.2: stronger death, pickup and explosion feedback (render only).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createRun } from '../../src/core/sim';
import type { GameState } from '../../src/core/types';
import {
  FeedbackLayer,
  HIT_STOP_TIME_SCALE,
  MAX_RINGS,
  MAX_TEXTS,
  PLAYER_HIT_STOP_MS,
} from '../../src/render/feedback';
import { ParticlePool } from '../../src/render/particles';
import { TIER_SETTINGS } from '../../src/render/quality';
import { Renderer } from '../../src/render/renderer';
import { opaque } from '../../src/render/sprites/format';
import { ghostSprite } from '../../src/render/sprites/ghost';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

const cfg = DEFAULT_CONFIG;
const cell = { x: 3, y: 3 };

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v) && !ArrayBuffer.isView(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

const EVENTS: Array<[string, GameEvent]> = [
  ['PlayerEaten', { t: 'PlayerEaten', cell, keysDropped: 0 }],
  ['HunterEaten', { t: 'HunterEaten', cell, by: 'player' }],
  ['KeyCollected', { t: 'KeyCollected', cell }],
  ['WispCollected', { t: 'WispCollected', cell, combo: 3, points: 60, bonus: 0 }],
  ['power', { t: 'PelletCollected', kind: 'power', by: 'player', cell }],
  ['speed', { t: 'PelletCollected', kind: 'speed', by: 'player', cell }],
  ['BombCollected', { t: 'BombCollected', cell, inventory: 1 }],
  ['BombDetonated', { t: 'BombDetonated', cell, radius: 2.5, destroyed: [cell, { x: 4, y: 3 }] }],
  ['CaptiveReleased', { t: 'CaptiveReleased', index: 1 }],
];

function setup(): { s: GameState; pool: ParticlePool; fb: FeedbackLayer } {
  const s = createRun(1, cfg).state;
  const pool = new ParticlePool(cfg.particleCap);
  return { s, pool, fb: new FeedbackLayer(pool) };
}

function drawAll(fb: FeedbackLayer, now: number): ReturnType<typeof mockCtx> {
  const m = mockCtx();
  fb.draw(m.ctx, now);
  fb.drawFlash(m.ctx, now, 504, 568);
  return m;
}

describe('feedback layer', () => {
  it.each(EVENTS)('%s triggers a visible effect', (name, e) => {
    const { s, pool, fb } = setup();
    fb.handle([e], 1000, s);
    const m = drawAll(fb, 1050);
    const visible = pool.active > 0 || fb.activeRings > 0 || fb.activeTexts > 0;
    expect(visible, name).toBe(true);
    expect(m.calls.some((c) => c.op === 'fillRect' || c.op === 'fillText')).toBe(true);
  });

  it('shows floating score text for wisps and rescues', () => {
    const { s, fb } = setup();
    fb.handle([{ t: 'WispCollected', cell, combo: 3, points: 60, bonus: 0 }, { t: 'CaptiveReleased', index: 0 }], 0, s);
    const texts = drawAll(fb, 100).texts();
    expect(texts).toContain('+60 x3');
    expect(texts).toContain('+500');
  });

  it('flashes a big MAX COMBO with the bonus only on the cap milestone', () => {
    const a = setup();
    a.fb.handle([{ t: 'WispCollected', cell, combo: 5, points: 100, bonus: 100 }], 0, a.s);
    const texts = drawAll(a.fb, 100).texts();
    expect(texts).toContain('MAX COMBO');
    expect(texts).toContain('+100 BONUS');
    const b = setup();
    b.fb.handle([{ t: 'WispCollected', cell, combo: 4, points: 80, bonus: 0 }], 0, b.s);
    expect(drawAll(b.fb, 100).texts()).not.toContain('MAX COMBO');
  });

  it('disintegrates the player sprite into many pixel particles with gravity, thinned by density', () => {
    const { s, pool, fb } = setup();
    fb.handle([EVENTS[0]![1]], 0, s);
    const full = pool.active;
    // About one particle per four sprite pixels (stride-2 sampling of the default art).
    const art = opaque(ghostSprite(0, 'none'));
    expect(full).toBeGreaterThan(art / 5);
    expect(full).toBeLessThan(art / 3);
    expect(pool.gravity.some((g) => g > 0)).toBe(true);
    const low = new ParticlePool(cfg.particleCap);
    low.density = TIER_SETTINGS.low.particleDensity;
    new FeedbackLayer(low).handle([EVENTS[0]![1]], 0, s);
    expect(low.active).toBeLessThan(full);
    expect(low.active).toBeGreaterThan(0);
  });

  it('never exceeds the particle cap or the text and ring pools', () => {
    const { s } = setup();
    const pool = new ParticlePool(50);
    const fb = new FeedbackLayer(pool);
    for (let i = 0; i < 40; i++) fb.handle(EVENTS.map(([, e]) => e), i, s);
    expect(pool.active).toBeLessThanOrEqual(50);
    expect(fb.activeTexts).toBeLessThanOrEqual(MAX_TEXTS);
    expect(fb.activeRings).toBeLessThanOrEqual(MAX_RINGS);
  });

  it('shake is strong and scales with destroyed walls, and is zero when disabled', () => {
    const { s, fb } = setup();
    const few: GameEvent = { t: 'BombDetonated', cell, radius: 2.5, destroyed: [cell] };
    const many: GameEvent = { t: 'BombDetonated', cell, radius: 2.5, destroyed: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 1 })) };
    const mag = (f: FeedbackLayer, e: GameEvent): number => {
      f.handle([e], 0, s);
      let m = 0;
      for (let t = 1; t < 60; t++) {
        const o = f.shake(t);
        m = Math.max(m, Math.abs(o.x), Math.abs(o.y));
      }
      return m;
    };
    const a = mag(fb, few);
    const b = mag(new FeedbackLayer(new ParticlePool(100)), many);
    expect(b).toBeGreaterThan(a);
    const off = new FeedbackLayer(new ParticlePool(100), false);
    expect(mag(off, many)).toBe(0);
    expect(off.shake(5)).toEqual({ x: 0, y: 0 });
  });

  it('hit-stop holds the render alpha and slows visuals only during the window', () => {
    const { s, fb } = setup();
    fb.handle([EVENTS[0]![1]], 1000, s);
    const first = fb.applyHitStop(1010, 0.25);
    expect(first).toEqual({ alpha: 0.25, timeScale: HIT_STOP_TIME_SCALE });
    expect(fb.applyHitStop(1050, 0.9).alpha).toBe(0.25);
    expect(fb.applyHitStop(1000 + PLAYER_HIT_STOP_MS + 1, 0.9)).toEqual({ alpha: 0.9, timeScale: 1 });
  });
});

describe('1UP feedback (task 37.3)', () => {
  const up = (lives: number): GameEvent => ({ t: 'ExtraLife', lives, milestone: 10000 });

  it('shows an animated 1UP! message with a green and gold particle burst and a lives pulse', () => {
    const { s, pool, fb } = setup();
    fb.handle([up(4)], 1000, s);
    expect(fb.activeOneUps).toBe(1);
    expect(pool.active).toBeGreaterThan(0);
    expect(fb.livesPulse(1100)).toBeGreaterThan(0);
    expect(fb.livesPulse(1000 + 5000)).toBe(0);
    const early = mockCtx();
    fb.draw(early.ctx, 1050);
    expect(early.texts()).toContain('1UP!');
    const pulse = mockCtx();
    fb.drawHudPulse(pulse.ctx, 1100);
    expect(pulse.calls.some((c) => c.op === 'fillRect')).toBe(true);
    const gone = mockCtx();
    fb.draw(gone.ctx, 1000 + 1300);
    expect(gone.texts()).not.toContain('1UP!');
  });

  it('plays several awards from one Tick one after another, one message visible at a time', () => {
    const { s, fb } = setup();
    fb.handle([up(4), up(5), up(6)], 1000, s);
    expect(fb.activeOneUps).toBe(3);
    expect(fb.oneUpStarts()).toEqual([1000, 2200, 3400]);
    for (const t of [1100, 1900, 2300, 3000, 3500, 4100]) {
      const m = mockCtx();
      fb.draw(m.ctx, t);
      const n = m.texts().filter((x) => x === '1UP!').length;
      expect(n, 'at ' + t).toBe(t < 4200 ? 3 : 0); // shadow, gold, green of exactly one message
    }
    const gone = mockCtx();
    fb.draw(gone.ctx, 4600);
    expect(gone.texts()).not.toContain('1UP!');
  });

  it('the lives pulse starts with the first message and lasts until the last one ends', () => {
    const { s, fb } = setup();
    fb.handle([up(4), up(5), up(6)], 1000, s);
    expect(fb.livesPulse(999)).toBe(0);
    expect(fb.livesPulse(1100)).toBeGreaterThan(0);
    expect(fb.livesPulse(2500)).toBeGreaterThan(0);
    expect(fb.livesPulse(3500)).toBeGreaterThan(0);
    expect(fb.livesPulse(4600)).toBe(0);
  });

  it('keeps the particle cap and the queue bound under many awards', () => {
    const { s } = setup();
    const pool = new ParticlePool(40);
    const fb = new FeedbackLayer(pool);
    for (let i = 0; i < 30; i++) fb.handle([up(4 + i), up(5 + i)], i * 100, s);
    for (let t = 0; t < 4000; t += 50) fb.draw(mockCtx().ctx, t);
    expect(pool.active).toBeLessThanOrEqual(40);
    expect(fb.activeOneUps).toBeLessThanOrEqual(8);
  });

  it('reduced motion removes the bob', () => {
    const ys = (flash: number): Set<unknown> => {
      const { s, fb } = setup();
      fb.flashScale = flash;
      fb.handle([up(4)], 0, s);
      const out = new Set<unknown>();
      for (let t = 400; t < 1000; t += 40) {
        const m = mockCtx();
        fb.draw(m.ctx, t);
        const k = m.calls.filter((c) => c.op === 'fillText' && c.args[0] === '1UP!' && c.fillStyle === '#5dff7a')[0];
        if (k) out.add(k.args[2]);
      }
      return out;
    };
    expect(ys(0.4).size).toBe(1);
    expect(ys(1).size).toBeGreaterThan(1);
  });

  it('the Renderer draws it, the HUD shows the new lives count and the state is not mutated', () => {
    const s = createRun(1, cfg).state;
    const lifted = { ...s, lives: s.lives + 1 };
    const snapshot = structuredClone(lifted);
    deepFreeze(lifted);
    const pool = new ParticlePool(cfg.particleCap);
    const m = mockCtx();
    const r = new Renderer(m.ctx, cfg, mockFactory().factory);
    r.layers = { particles: pool, feedback: new FeedbackLayer(pool) };
    r.draw(lifted, { alpha: 0, timeMs: 0 });
    r.onEvents([{ t: 'ExtraLife', lives: lifted.lives, milestone: 10000 }], 16);
    m.reset();
    r.draw(lifted, { alpha: 0, timeMs: 60 });
    expect(m.texts()).toContain('1UP!');
    expect(r.lastHud?.lives).toBe(lifted.lives);
    expect(lifted).toEqual(snapshot);
  });
});

describe('feedback through the Renderer', () => {
  it('leaves deep-frozen state and events unchanged and draws the effects', () => {
    const s0 = createRun(1, cfg).state;
    const snapshot = structuredClone(s0);
    const frozen = deepFreeze(s0);
    const pool = new ParticlePool(cfg.particleCap);
    const m = mockCtx();
    const r = new Renderer(m.ctx, cfg, mockFactory().factory);
    r.layers = { particles: pool, feedback: new FeedbackLayer(pool) };
    const events = EVENTS.map(([, e]) => e);
    const evSnap = structuredClone(events);
    r.draw(frozen, { alpha: 0.5, timeMs: 0 });
    r.onEvents(events, 16);
    for (let i = 1; i < 30; i++) {
      r.draw(frozen, { alpha: 0.5, timeMs: 16 + i * 16 });
      expect(pool.active).toBeLessThanOrEqual(cfg.particleCap);
    }
    expect(frozen).toEqual(snapshot);
    expect(events).toEqual(evSnap);
    expect(m.texts().some((t) => t.startsWith('+'))).toBe(true);
  });

  it('applies no shake translation when screen shake is disabled', () => {
    const s = createRun(1, { ...cfg, screenShake: false }).state;
    const pool = new ParticlePool(100);
    const m = mockCtx();
    const r = new Renderer(m.ctx, { ...cfg, screenShake: false }, mockFactory().factory);
    r.layers = { particles: pool, feedback: new FeedbackLayer(pool) };
    r.draw(s, { alpha: 0, timeMs: 0 });
    r.onEvents([EVENTS[0]![1], EVENTS[7]![1]], 16);
    m.reset();
    r.draw(s, { alpha: 0, timeMs: 40 });
    const t = m.calls.find((c) => c.op === 'translate');
    expect(t?.args).toEqual([0, 0]);
  });

  it('the low tier keeps the death shake; the Reduced motion setting turns it off', () => {
    const s = createRun(1, cfg).state;
    const offset = (shake: boolean): number[] => {
      const pool = new ParticlePool(100);
      const m = mockCtx();
      const r = new Renderer(m.ctx, cfg, mockFactory().factory);
      r.layers = { particles: pool, feedback: new FeedbackLayer(pool), settings: () => TIER_SETTINGS.low };
      r.motion = { shake, flash: 1 };
      r.draw(s, { alpha: 0, timeMs: 0 });
      r.onEvents([EVENTS[0]![1]], 16);
      m.reset();
      r.draw(s, { alpha: 0, timeMs: 40 });
      return m.calls.find((c) => c.op === 'translate')?.args as number[];
    };
    const on = offset(true);
    expect(Math.abs(on[0]!) + Math.abs(on[1]!)).toBeGreaterThan(4);
    expect(offset(false)).toEqual([0, 0]);
  });

  it('hit-stop changes only render alpha: the same state draws at the held alpha', () => {
    const s = createRun(1, cfg).state;
    const pool = new ParticlePool(100);
    const fb = new FeedbackLayer(pool);
    const r = new Renderer(mockCtx().ctx, cfg, mockFactory().factory);
    r.layers = { particles: pool, feedback: fb };
    r.draw(s, { alpha: 0.2, timeMs: 0 });
    r.onEvents([EVENTS[0]![1]], 16);
    r.draw(s, { alpha: 0.2, timeMs: 20 });
    expect(fb.hitStopActive(20)).toBe(true);
    expect(fb.hitStopActive(16 + PLAYER_HIT_STOP_MS + 1)).toBe(false);
  });
});

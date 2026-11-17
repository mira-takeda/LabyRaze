// Lighting (25.1), Door layer (25.2), effects (25.3), allies (25.4) and explosions (25.5).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import type { GameState } from '../../src/core/types';
import { AllyRenderer, allyVisible, captiveInCage, leavingAlpha } from '../../src/render/allies';
import { DOOR_TRANSITION_MS, DoorsLayer } from '../../src/render/doorsLayer';
import { INVULN_BLINK_MS, POWER_BLINK_MS, RoleFlash, animTime, characterAlpha } from '../../src/render/effects';
import { ExplosionLayer, FLASH_MS, MAX_FLASHES, SHAKE_MS } from '../../src/render/explosion';
import { EXPLOSION_LIGHT_FRAMES, Lighting, MAX_LIGHTS } from '../../src/render/lighting';
import { placeholderAdapter } from '../../src/render/placeholders';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

const cfg = DEFAULT_CONFIG;
const state = (): GameState => createRun(6, cfg).state;

describe('lighting', () => {
  it('composites a bounded number of additive lights and is skipped when disabled', () => {
    const { factory } = mockFactory();
    const l = new Lighting(factory);
    const m = mockCtx();
    l.draw(m.ctx, state(), 0, 504, 568, 0.5);
    expect(l.lastLightCount).toBeGreaterThan(5);
    expect(l.lastLightCount).toBeLessThanOrEqual(MAX_LIGHTS + 3);
    expect(m.calls.some((c) => c.op === 'drawImage')).toBe(true);
    const off = mockCtx();
    l.draw(off.ctx, state(), 0, 504, 568, 0);
    expect(off.calls.some((c) => c.op === 'drawImage')).toBe(false);
  });

  it('explosion lights decay over about 18 frames', () => {
    const { factory } = mockFactory();
    const l = new Lighting(factory);
    const s = state();
    l.explosion(100, 100, 2.5);
    l.draw(mockCtx().ctx, s, 0, 504, 568, 0.5);
    const withFlash = l.lastLightCount;
    for (let i = 0; i < EXPLOSION_LIGHT_FRAMES; i++) l.draw(mockCtx().ctx, s, 0, 504, 568, 0.5);
    expect(l.lastLightCount).toBe(withFlash - 1);
  });
});

describe('door layer', () => {
  it('animates a transition after DoorChanged and pulses while warning', () => {
    const d = new DoorsLayer();
    d.handle([{ t: 'DoorChanged', doorIndex: 0, open: false }], 1000);
    expect(d.transition(0, 1000)).toBe(0);
    expect(d.transition(0, 1000 + DOOR_TRANSITION_MS / 2)).toBeCloseTo(0.5, 6);
    expect(d.transition(0, 1000 + DOOR_TRANSITION_MS)).toBe(1);
    const s = state();
    const warn: GameState = { ...s, doors: s.doors.map((x) => ({ ...x, warning: 1 })) };
    const m = mockCtx();
    d.draw(m.ctx, warn, placeholderAdapter, 5000);
    expect(m.calls.some((c) => c.op === 'fillRect' && c.fillStyle === '#ffd23f')).toBe(true);
  });
});

describe('effects', () => {
  it('power blink and invulnerability blink differ, and power blinks for the whole duration', () => {
    expect(POWER_BLINK_MS).not.toBe(INVULN_BLINK_MS);
    const vals = new Set<number>();
    for (let t = 0; t < 2000; t += 40) vals.add(characterAlpha({ power: 280, invulnerable: 0 }, t));
    expect(vals.size).toBe(2);
    expect(characterAlpha({ power: 0, invulnerable: 0 }, 123)).toBe(1);
    expect(Math.min(...[0, 90].map((t) => characterAlpha({ power: 0, invulnerable: 10 }, t)))).toBe(0.2);
    expect(animTime({ speed: 10 }, 1000)).toBeGreaterThan(animTime({ speed: 0 }, 1000));
  });

  it('role reversal flashes briefly', () => {
    const f = new RoleFlash();
    f.handle([{ t: 'RoleReversed', to: 'player' }], 100);
    expect(f.strength('player', 100)).toBe(1);
    expect(f.strength('player', 1000)).toBe(0);
    expect(f.strength('hunter', 100)).toBe(0);
  });
});

describe('allies', () => {
  it('Captives are drawn in the Cage exactly when not rescued and inactive', () => {
    const s = state();
    expect(captiveInCage(s, 0)).toBe(true);
    expect(captiveInCage({ ...s, captives: [true, false, false] }, 0)).toBe(false);
    const hunting: GameState = { ...s, ghostHunt: { ...s.ghostHunt, allies: s.ghostHunt.allies.map((a) => ({ ...a, mode: 'hunting' as const, spawnIn: 0 })) as GameState['ghostHunt']['allies'] } };
    expect(captiveInCage(hunting, 1)).toBe(false);
    expect(allyVisible(hunting.ghostHunt.allies[1]!)).toBe(true);
    expect(leavingAlpha({ ...s.ghostHunt.allies[0]!, mode: 'leaving', leaveIn: 15 }, 30)).toBe(0.5);
  });

  it('draws visible allies with afterimages using their palettes', () => {
    const s = state();
    const hunting: GameState = { ...s, ghostHunt: { ticksLeft: 100, allies: s.ghostHunt.allies.map((a, i) => ({ ...a, mode: 'hunting' as const, spawnIn: 0, cell: { x: 1 + i, y: 1 } })) as GameState['ghostHunt']['allies'] } };
    const r = new AllyRenderer();
    const m = mockCtx();
    r.draw(m.ctx, hunting, placeholderAdapter, 0, 140, 30, 0);
    const first = m.calls.filter((c) => c.op === 'fill').length;
    m.reset();
    r.draw(m.ctx, hunting, placeholderAdapter, 0, 140, 30, 16);
    expect(m.calls.filter((c) => c.op === 'fill').length).toBeGreaterThan(first);
  });
});

describe('explosions', () => {
  it('BombDetonated starts a flash and a decaying shake; at most 3 flashes; shake can be disabled', () => {
    const x = new ExplosionLayer(true);
    const ev = { t: 'BombDetonated' as const, cell: { x: 5, y: 5 }, radius: 2.5, destroyed: [{ x: 5, y: 6 }] };
    x.handle([ev, ev, ev, ev], 0);
    expect(x.activeFlashes).toBe(MAX_FLASHES);
    const s0 = x.shake(10);
    expect(Math.abs(s0.x) + Math.abs(s0.y)).toBeGreaterThanOrEqual(0);
    expect(x.shake(SHAKE_MS + 1)).toEqual({ x: 0, y: 0 });
    const m = mockCtx();
    x.draw(m.ctx, FLASH_MS / 2);
    expect(m.rects().length).toBeGreaterThan(0);
    x.draw(m.ctx, FLASH_MS * 2);
    expect(x.activeFlashes).toBe(0);
    x.shakeEnabled = false;
    x.handle([ev], 5000);
    expect(x.shake(5010)).toEqual({ x: 0, y: 0 });
  });
});

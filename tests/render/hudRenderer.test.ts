// Polished HUD (task 28.5): icons, bars and dirty tracking.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { buildHud } from '../../src/core/hud';
import { createRun } from '../../src/core/sim';
import { HudRenderer, comboTierColor, hudKey } from '../../src/render/hudRenderer';
import { buildAtlas } from '../../src/render/spriteAdapter';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

describe('HUD renderer', () => {
  it('redraws only when the visible view-model changes', () => {
    const { factory } = mockFactory();
    const atlas = buildAtlas(factory);
    const h = new HudRenderer(factory, 504, atlas);
    const s = createRun(2, DEFAULT_CONFIG).state;
    const m = mockCtx();
    expect(h.draw(m.ctx, buildHud(s, DEFAULT_CONFIG))).toBe(true);
    expect(h.draw(m.ctx, buildHud(s, DEFAULT_CONFIG))).toBe(false);
    expect(h.draw(m.ctx, buildHud({ ...s, score: 10 }, DEFAULT_CONFIG))).toBe(true);
    expect(h.redraws).toBe(2);
    expect(m.calls.filter((c) => c.op === 'drawImage')).toHaveLength(3);
  });

  it('shows every field: score, level, lives, keys, captives, pellets, bomb slots, Ghost Hunt, Combo, timers', () => {
    const { factory, surfaces } = mockFactory();
    const atlas = buildAtlas(factory);
    const h = new HudRenderer(factory, 504, atlas);
    const s0 = createRun(2, DEFAULT_CONFIG).state;
    const s = { ...s0, bombs: 2, ghostHunt: { ...s0.ghostHunt, ticksLeft: 120 }, comboCount: 3, comboTicksLeft: 60, player: { ...s0.player, power: 60, speed: 60 } };
    h.draw(mockCtx().ctx, buildHud(s, DEFAULT_CONFIG));
    const hudSurface = surfaces[surfaces.length - 1]!;
    const text = hudSurface.texts().join(' | ');
    for (const f of ['SCORE', 'LEVEL', 'LIVES', 'x0', '0/3', 'BOMBS', '2.0s', 'COMBO x3', 'POWER 1.0s', 'SPEED 1.0s']) expect(text).toContain(f);
    // Three Bomb slots drawn from the atlas (two full, one dimmed).
    expect(hudSurface.calls.filter((c) => c.op === 'drawImage').length).toBeGreaterThan(5);
  });

  it('shows wisp progress, chain points and a tier colour; MAX at the cap', () => {
    const { factory, surfaces } = mockFactory();
    const h = new HudRenderer(factory, 504, buildAtlas(factory));
    const s0 = createRun(2, DEFAULT_CONFIG).state;
    const s = { ...s0, comboCount: 2, comboTicksLeft: 60, comboChainPoints: 60, items: { ...s0.items, wispsRemaining: s0.items.wispsRemaining - 2 } };
    h.draw(mockCtx().ctx, buildHud(s, DEFAULT_CONFIG));
    const text = surfaces[surfaces.length - 1]!.texts().join(' | ');
    expect(text).toContain(`WISPS 2/${s0.maze.wisps.length}`);
    expect(text).toContain('COMBO x2 +60');
    const cap = DEFAULT_CONFIG.comboCap;
    h.draw(mockCtx().ctx, buildHud({ ...s, comboCount: cap, comboChainPoints: 260 }, DEFAULT_CONFIG));
    expect(surfaces[surfaces.length - 1]!.texts().join(' | ')).toContain(`MAX x${cap} +260`);
    expect(comboTierColor(1, cap)).not.toBe(comboTierColor(cap, cap));
  });

  it('the Combo text never overlaps the SB SPEED timer or the WISPS text at 504 px', () => {
    const { factory, surfaces } = mockFactory();
    const h = new HudRenderer(factory, 504, buildAtlas(factory));
    const s0 = createRun(2, DEFAULT_CONFIG).state;
    const cap = DEFAULT_CONFIG.comboCap;
    const s = {
      ...s0,
      comboCount: cap,
      comboTicksLeft: 60,
      comboChainPoints: 12345,
      hunter: { ...s0.hunter, speed: 60, power: 60 },
      player: { ...s0.player, power: 60, speed: 60 },
    };
    h.draw(mockCtx().ctx, buildHud(s, DEFAULT_CONFIG));
    const calls = surfaces[surfaces.length - 1]!.calls.filter((c) => c.op === 'fillText');
    const run = (prefix: string): { x0: number; x1: number; y: number } => {
      const c = calls.find((k) => String(k.args[0]).startsWith(prefix));
      expect(c, prefix).toBeDefined();
      const t = String(c!.args[0]);
      const x = c!.args[1] as number;
      const w = t.length * 7; // measureText mock: 7 px per char
      const x0 = c!.textAlign === 'right' ? x - w : x;
      return { x0, x1: x0 + w, y: c!.args[2] as number };
    };
    const overlap = (a: ReturnType<typeof run>, b: ReturnType<typeof run>): boolean =>
      a.x0 < b.x1 && b.x0 < a.x1 && Math.abs(a.y - b.y) < 12; // 12 px font height
    const combo = run('MAX');
    expect(combo.x1).toBeLessThanOrEqual(504);
    expect(overlap(combo, run('SB SPEED'))).toBe(false);
    expect(overlap(combo, run('WISPS'))).toBe(false);
    expect(overlap(run('SB SPEED'), run('SPEED '))).toBe(false);
  });

  it('lives readout keeps a gap between the +N count and LIVES for 4 to 99 lives', () => {
    const s0 = createRun(2, DEFAULT_CONFIG).state;
    for (const lives of [1, 4, 6, 10, 30, 31, 99]) {
      const { factory, surfaces } = mockFactory();
      const h = new HudRenderer(factory, 504, buildAtlas(factory));
      h.draw(mockCtx().ctx, buildHud({ ...s0, lives }, DEFAULT_CONFIG));
      const calls = surfaces[surfaces.length - 1]!.calls.filter((c) => c.op === 'fillText' && c.args[2] === 47);
      const label = calls.find((c) => c.args[0] === 'LIVES');
      expect(label, 'LIVES at ' + lives).toBeDefined();
      const lx = label!.args[1] as number;
      expect(lx + 5 * 7).toBeLessThanOrEqual(150); // stays left of column 2
      const extra = calls.find((c) => String(c.args[0]).startsWith('+'));
      if (lives <= 4) expect(extra).toBeUndefined();
      else {
        expect(extra!.args[0]).toBe('+' + (lives - 4));
        const ex = extra!.args[1] as number;
        expect(ex + String(extra!.args[0]).length * 7.2 + 2).toBeLessThanOrEqual(lx);
      }
    }
  });

  it('the dirty key ignores sub-decisecond timer changes', () => {
    const s = createRun(2, DEFAULT_CONFIG).state;
    const a = hudKey(buildHud({ ...s, player: { ...s.player, power: 120 } }, DEFAULT_CONFIG));
    const b = hudKey(buildHud({ ...s, player: { ...s.player, power: 119 } }, DEFAULT_CONFIG));
    expect(a).toBe(b);
  });
});

describe('HUD difficulty label', () => {
  it('draws nothing by default, and the label in a warning colour in the bottom-right corner', () => {
    const hud = buildHud(createRun(2, DEFAULT_CONFIG).state, DEFAULT_CONFIG);
    const a = mockFactory();
    new HudRenderer(a.factory, 504, buildAtlas(a.factory)).draw(mockCtx().ctx, hud);
    expect(a.surfaces[a.surfaces.length - 1]!.texts().join('|')).not.toMatch(/NORMAL|VERY HARD|EXTREME/);
    const { factory, surfaces } = mockFactory();
    const h = new HudRenderer(factory, 504, buildAtlas(factory));
    h.difficulty = { label: 'EXTREME', color: '#ff4d4d' };
    expect(h.draw(mockCtx().ctx, hud)).toBe(true);
    const calls = surfaces[surfaces.length - 1]!.calls.filter((c) => c.op === 'fillText' && c.args[0] === 'EXTREME');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fillStyle).toBe('#ff4d4d');
    expect(calls[0]!.textAlign).toBe('right');
    // Right-aligned at the margin on y 58: below the Combo / Wisp text row (50), right of the Combo bars
    // (x <= 381), far from the lives text and the CHEAT RUN badge (x 180).
    expect(calls[0]!.args[1]).toBe(504 - 8);
    expect(calls[0]!.args[2]).toBe(58);
    const comboOrWisp = surfaces[surfaces.length - 1]!.calls.find((c) => c.op === 'fillText' && /WISP =|COMBO|MAX/.test(String(c.args[0])));
    expect(comboOrWisp!.args[2]).toBe(50);
    // 'VERY HARD' at 10px (about 6 px per glyph) starts right of the Combo bars.
    expect(504 - 8 - 'VERY HARD'.length * 6.5).toBeGreaterThan(285 + 96);
    h.difficulty = { label: 'VERY HARD', color: '#ff9f43' };
    expect(h.draw(mockCtx().ctx, hud)).toBe(true);
  });
});

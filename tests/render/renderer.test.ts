// Frame composition (task 22.5).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import type { GameState } from '../../src/core/types';
import { HUD_H, TILE } from '../../src/render/layout';
import { PALETTE } from '../../src/render/placeholders';
import { INVULN_BLINK_MS, POWER_BLINK_MS, Renderer } from '../../src/render/renderer';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

const cfg = DEFAULT_CONFIG;

function setup(): { r: Renderer; m: ReturnType<typeof mockCtx>; f: ReturnType<typeof mockFactory>; s: GameState } {
  const m = mockCtx();
  const f = mockFactory();
  const r = new Renderer(m.ctx, cfg, f.factory);
  return { r, m, f, s: createRun(9, cfg).state };
}

describe('renderer', () => {
  it('composes static layer, items, characters and a complete HUD', () => {
    const { r, m, s } = setup();
    r.draw({ ...s, bombs: 2 }, { alpha: 0, timeMs: 0 });
    expect(m.calls.some((c) => c.op === 'drawImage' && c.args[2] === HUD_H)).toBe(true);
    const texts = m.texts().join(' | ');
    for (const field of ['SCORE', 'LEVEL', 'LIVES', 'KEYS', 'FREED 0/3', 'PELLETS', 'BOMBS']) expect(texts).toContain(field);
    // Squareman is a square at its start Cell.
    const hx = s.hunter.cell.x * TILE;
    const hy = s.hunter.cell.y * TILE + HUD_H;
    const sq = m.rects().find((q) => q.fill === PALETTE.hunter && q.x >= hx && q.x < hx + TILE && q.y >= hy && q.y < hy + TILE);
    expect(sq).toBeDefined();
    expect(sq!.w).toBe(sq!.h);
    // Two filled bomb slots, one empty.
    expect(r.lastHud!.bombs.filled).toEqual([true, true, false]);
  });

  it('shows Ghost Hunt time, Combo, Power and Speed seconds when active', () => {
    const { r, m, s } = setup();
    const st: GameState = {
      ...s,
      ghostHunt: { ...s.ghostHunt, ticksLeft: 300 },
      comboCount: 3,
      comboTicksLeft: 60,
      player: { ...s.player, power: 120, speed: 60 },
    };
    r.draw(st, { alpha: 0, timeMs: 0 });
    const texts = m.texts().join(' | ');
    expect(texts).toContain('HUNT 5.0s');
    expect(texts).toContain('COMBO x3');
    expect(texts).toContain('POWER 2.0s');
    expect(texts).toContain('SPEED 1.0s');
  });

  it('draws one Door per DoorSpec with its open state', () => {
    const { r, m, s } = setup();
    r.draw(s, { alpha: 0, timeMs: 0 });
    const doorRects = m.rects().filter((q) => q.fill === PALETTE.doorOpen || q.fill === PALETTE.doorClosed);
    expect(doorRects).toHaveLength(s.maze.doors.length);
  });

  it('patches the static layer on WallsDestroyed instead of rebuilding it', () => {
    const { r, f, s } = setup();
    r.draw(s, { alpha: 0, timeMs: 0 });
    expect(f.surfaces).toHaveLength(1);
    r.onEvents([{ t: 'WallsDestroyed', cells: [{ x: 2, y: 2 }] }]);
    f.surfaces[0]!.reset();
    r.draw(s, { alpha: 0, timeMs: 0 });
    expect(f.surfaces).toHaveLength(1);
    expect(f.surfaces[0]!.rects().length).toBe(9);
  });

  it('power blink and invulnerability blink use different periods', () => {
    expect(POWER_BLINK_MS).not.toBe(INVULN_BLINK_MS);
    const { r, m, s } = setup();
    const alphaAt = (st: GameState, t: number): number[] => {
      m.reset();
      r.draw(st, { alpha: 0, timeMs: t });
      return m.calls.filter((c) => c.op === 'fill' && c.fillStyle === PALETTE.player).map((c) => c.globalAlpha);
    };
    const powered = { ...s, player: { ...s.player, power: 250 } };
    expect(alphaAt(powered, 0)[0]).toBe(1);
    expect(alphaAt(powered, POWER_BLINK_MS)[0]).toBeLessThan(1);
    const invuln = { ...s, player: { ...s.player, invulnerable: 50 } };
    expect(alphaAt(invuln, INVULN_BLINK_MS)[0]).toBeLessThan(alphaAt(powered, POWER_BLINK_MS)[0]!);
  });
});

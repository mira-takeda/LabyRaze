// Placeholder drawing (task 22.1).
import { describe, expect, it } from 'vitest';
import { ALLY_COLOURS, PALETTE, placeholderAdapter } from '../../src/render/placeholders';
import type { ItemDrawKind } from '../../src/render/placeholders';
import { mockCtx } from '../helpers/mockCanvas';

describe('placeholder adapter', () => {
  it('draws the hunter as a single filled square in every state', () => {
    for (const frightened of [false, true]) {
      const m = mockCtx();
      placeholderAdapter.drawCharacter(m.ctx, 'hunter', 0, 0, 24, { frightened });
      const body = m.rects()[0]!;
      expect(body.w).toBe(body.h);
      expect(body.fill).toBe(frightened ? PALETTE.hunterFrightened : PALETTE.hunter);
      expect(m.calls.some((c) => c.op === 'arc' || c.op === 'quadraticCurveTo')).toBe(false);
    }
  });

  it('draws the Player as a white rounded ghost with two oval eyes', () => {
    const m = mockCtx();
    placeholderAdapter.drawCharacter(m.ctx, 'player', 0, 0, 24, {});
    const fills = m.calls.filter((c) => c.op === 'fill');
    expect(fills[0]!.fillStyle).toBe(PALETTE.player);
    expect(m.calls.filter((c) => c.op === 'ellipse')).toHaveLength(2);
    expect(m.calls.some((c) => c.op === 'quadraticCurveTo')).toBe(true);
  });

  it('gives Captives and allies their own colours, distinct from the Player', () => {
    const seen = new Set<unknown>();
    for (const kind of ['captive', 'ally'] as const) {
      for (let i = 0; i < 3; i++) {
        const m = mockCtx();
        placeholderAdapter.drawCharacter(m.ctx, kind, 0, 0, 24, { index: i });
        const body = m.calls.find((c) => c.op === 'fill')!.fillStyle;
        expect(body).toBe(ALLY_COLOURS[i]);
        expect(body).not.toBe(PALETTE.player);
        seen.add(body);
      }
    }
    expect(seen.size).toBe(3);
  });

  it('draws pellets as warm squares and Wisps as cool round orbs', () => {
    const p = mockCtx();
    placeholderAdapter.drawItem(p.ctx, 'ordinary', 0, 0, 24, 0);
    expect(p.rects()[0]!.fill).toBe(PALETTE.ordinary);
    expect(p.calls.some((c) => c.op === 'arc')).toBe(false);
    const w = mockCtx();
    placeholderAdapter.drawItem(w.ctx, 'wisp', 0, 0, 24, 0);
    expect(w.calls.filter((c) => c.op === 'arc').length).toBeGreaterThan(0);
    expect(w.calls.find((c) => c.op === 'fill')!.fillStyle).toBe(PALETTE.wisp);
  });

  it('every item kind draws something with its own colour', () => {
    const kinds: ItemDrawKind[] = ['ordinary', 'power', 'speed', 'wisp', 'bomb', 'ghostHunt', 'key'];
    const colours = new Set<unknown>();
    for (const k of kinds) {
      const m = mockCtx();
      placeholderAdapter.drawItem(m.ctx, k, 0, 0, 24, 0);
      const first = m.calls.find((c) => c.op === 'fill' || c.op === 'fillRect');
      expect(first, k).toBeDefined();
      colours.add(first!.fillStyle);
    }
    expect(colours.size).toBe(kinds.length);
  });

  it('distinguishes open, closed and warning Doors', () => {
    const open = mockCtx();
    placeholderAdapter.drawDoor(open.ctx, 0, 0, 24, true, 0, 0);
    const closed = mockCtx();
    placeholderAdapter.drawDoor(closed.ctx, 0, 0, 24, false, 0, 0);
    const warn = mockCtx();
    placeholderAdapter.drawDoor(warn.ctx, 0, 0, 24, true, 0.5, 0);
    expect(open.rects()[0]!.fill).toBe(PALETTE.doorOpen);
    expect(closed.rects()[0]!.fill).toBe(PALETTE.doorClosed);
    expect(warn.calls.some((c) => c.op === 'strokeRect' && c.strokeStyle === PALETTE.doorWarn)).toBe(true);
    expect(open.calls.some((c) => c.op === 'strokeRect')).toBe(false);
  });

  it('draws the Cage interior and gate', () => {
    const m = mockCtx();
    placeholderAdapter.drawCageInterior(m.ctx, 0, 0, 24);
    placeholderAdapter.drawCageGate(m.ctx, 24, 0, 24);
    expect(m.rects().some((r) => r.fill === PALETTE.cage)).toBe(true);
    expect(m.rects().some((r) => r.fill === PALETTE.gate)).toBe(true);
  });
});

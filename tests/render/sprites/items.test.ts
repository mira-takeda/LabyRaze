// Item sprites (task 24.4): warm square pellets, cool round Wisps, distinct items.
import { describe, expect, it } from 'vitest';
import { bounds, opaque } from '../../../src/render/sprites/format';
import type { SpriteDef } from '../../../src/render/sprites/format';
import { ITEM_SPRITES, WISP_FRAMES } from '../../../src/render/sprites/items';

function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function mainColour(s: SpriteDef): string {
  const counts = new Map<string, number>();
  for (const r of s.rows) for (const c of r) if (c !== '.') counts.set(c, (counts.get(c) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  return s.palette[top]!;
}

describe('item sprites', () => {
  it('Ordinary_Pellets are small warm squares', () => {
    const p = ITEM_SPRITES.ordinary;
    const b = bounds(p);
    expect(b.x1 - b.x0).toBeLessThanOrEqual(3);
    expect(b.y1 - b.y0).toBeLessThanOrEqual(3);
    const h = hue(mainColour(p));
    expect(h).toBeGreaterThanOrEqual(20);
    expect(h).toBeLessThanOrEqual(50);
  });

  it('Spirit_Wisps are cool, round and bob across frames', () => {
    for (const w of WISP_FRAMES) {
      const h = hue(mainColour(w));
      expect(h).toBeGreaterThanOrEqual(170);
      expect(h).toBeLessThanOrEqual(290);
      const b = bounds(w);
      expect(b.x1 - b.x0).toBe(b.y1 - b.y0); // round orb: equal width and height
    }
    const tops = WISP_FRAMES.map((w) => bounds(w).y0);
    expect(new Set(tops).size).toBeGreaterThan(1);
  });

  it('Wisp hue differs clearly from the pellet hue', () => {
    expect(Math.abs(hue(mainColour(WISP_FRAMES[0]!)) - hue(mainColour(ITEM_SPRITES.ordinary)))).toBeGreaterThan(90);
  });

  it('every item has its own shape and colour', () => {
    const all = Object.values(ITEM_SPRITES);
    expect(new Set(all.map((s) => s.rows.join('|'))).size).toBe(all.length);
    expect(new Set(all.map(mainColour)).size).toBe(all.length);
    for (const s of all) expect(opaque(s)).toBeGreaterThan(0);
  });
});

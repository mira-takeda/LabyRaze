// Character Workshop skins: validation, default designs and legacy migration (cosmetic data only).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIN_ANTAGONIST_PIXELS,
  MIN_PROTAGONIST_PIXELS,
  PIXEL_CHARS,
  SKIN_SIZE,
  blankRows,
  checkRows,
  defaultRows,
  fleeingSprite,
  skinSprite,
  upscaleLegacySquareman,
  validateSkin,
} from '../../src/render/skins';
import { ghostRows } from '../../src/render/sprites/ghost';
const kiro = (rows: string[] = defaultRows('kiro')) => ({ id: 'k-1', kind: 'kiro', name: 'My Hero', rows });
describe('skins', () => {
  it('the default protagonist and antagonist convert to valid skins', () => {
    const k = defaultRows('kiro');
    expect(k.map((r) => r.replace(/[^.]/g, 'X'))).toEqual(ghostRows(0, 'none').map((r) => r.replace(/[^.]/g, 'X')));
    expect(checkRows('kiro', k)).toBeNull();
    expect(checkRows('squareman', defaultRows('squareman'))).toBeNull();
    expect(validateSkin(kiro()).ok).toBe(true);
    expect(skinSprite(k).w).toBe(18);
  });
  it('rejects wrong sizes, unknown colours and invisible protagonists', () => {
    const k = defaultRows('kiro');
    expect(checkRows('kiro', k.slice(1))).toMatch(/18x24/);
    expect(checkRows('kiro', k.map((r) => r + '.'))).toMatch(/18x24/);
    expect(checkRows('kiro', ['z'.repeat(18), ...k.slice(1)])).toMatch(/colour/);
    expect(checkRows('kiro', blankRows('kiro'))).toMatch(String(MIN_PROTAGONIST_PIXELS));
    expect(checkRows('kiro', 'nope')).not.toBeNull();
  });
  it('antagonist skins are 24x24 free drawings with enough pixels to stay visible', () => {
    const s = defaultRows('squareman');
    expect([s[0]!.length, s.length]).toEqual([24, 24]);
    // Transparency is allowed and there is no border rule: only size, colours and count matter.
    const hole = [...s];
    hole[5] = hole[5]!.slice(0, 5) + '.' + hole[5]!.slice(6);
    expect(checkRows('squareman', hole)).toBeNull();
    const edge = [...s];
    edge[0] = 'h'.repeat(24);
    expect(checkRows('squareman', edge)).toBeNull();
    expect(checkRows('squareman', s.slice(1))).toMatch(/24x24/);
    expect(checkRows('squareman', blankRows('squareman'))).toMatch(String(MIN_ANTAGONIST_PIXELS));
    expect(checkRows('squareman', blankRows('squareman'))).toMatch(/antagonist/);
  });
  it('validates names and ids and drops unknown fields', () => {
    expect(validateSkin({ ...kiro(), name: '' }).ok).toBe(false);
    expect(validateSkin({ ...kiro(), name: 'x'.repeat(17) }).ok).toBe(false);
    expect(validateSkin({ ...kiro(), name: '<script>' }).ok).toBe(false);
    expect(validateSkin({ ...kiro(), id: '../../x' }).ok).toBe(false);
    expect(validateSkin({ ...kiro(), kind: 'boss' }).ok).toBe(false);
    const r = validateSkin({ ...kiro(), name: '  Neon   Hero ', hitbox: 99, speed: 5 });
    expect(r.ok && r.skin).toEqual({ id: 'k-1', kind: 'kiro', name: 'Neon Hero', rows: defaultRows('kiro') });
  });
  it('never throws on arbitrary data and only accepts complete pictures', () => {
    const { w, h } = SKIN_SIZE.kiro;
    const base = defaultRows('kiro');
    const row = fc.oneof(fc.string({ unit: fc.constantFrom(...PIXEL_CHARS, '.', 'z'), minLength: w - 1, maxLength: w + 1 }), fc.constantFrom(...base));
    fc.assert(
      fc.property(fc.array(row, { minLength: h - 1, maxLength: h + 1 }), fc.anything(), (rows, junk) => {
        const r = validateSkin(kiro(rows));
        if (r.ok) {
          expect(r.skin.rows).toHaveLength(h);
          for (const x of r.skin.rows) expect(x).toHaveLength(w);
        }
        expect(() => validateSkin(junk)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
  it("a custom antagonist keeps the standard 'edible' look: blues with white features", () => {
    const f = fleeingSprite(defaultRows('squareman'));
    expect(f.palette['a']).toMatch(/^#(4a6cff|2a44c0|a8b8ff)$/);
    expect(f.palette['0']).toBe('#ffffff');
  });
  it('upscales legacy 12x12 antagonist pictures to identical 24x24 pixels', () => {
    const legacy = Array.from({ length: 12 }, (_, y) => [...Array(12)].map((_, x) => ((x + y) % 3 === 0 ? '.' : PIXEL_CHARS[(x + y * 12) % PIXEL_CHARS.length]!)).join(''));
    const up = upscaleLegacySquareman(legacy);
    expect(up).not.toBeNull();
    expect([up![0]!.length, up!.length]).toEqual([24, 24]);
    legacy.forEach((row, y) => {
      [...row].forEach((c, x) => {
        expect(up![y * 2]!.slice(x * 2, x * 2 + 2)).toBe(c + c);
        expect(up![y * 2 + 1]!.slice(x * 2, x * 2 + 2)).toBe(c + c);
      });
    });
    expect(upscaleLegacySquareman(legacy.slice(1))).toBeNull();
    expect(upscaleLegacySquareman(['z'.repeat(12), ...legacy.slice(1)])).toBeNull();
    expect(upscaleLegacySquareman('nope')).toBeNull();
  });
});

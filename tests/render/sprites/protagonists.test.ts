// LABYRAZE protagonist sprites: seven original 18x24 spirits with two frames and
// facing-adapted eyes (structure only; the gallery screenshots show the looks).
import { describe, expect, it } from 'vitest';
import { bounds, opaque } from '../../../src/render/sprites/format';
import {
  DEFAULT_PROTAGONIST,
  FACINGS,
  PROTAGONIST_FRAMES,
  PROTAGONIST_H,
  PROTAGONIST_IDS,
  PROTAGONIST_NAME,
  PROTAGONIST_W,
  protagonistDef,
  protagonistRows,
  protagonistSprite,
} from '../../../src/render/sprites/protagonists';

const count = (rows: string[], ch: string): number => rows.join('').split(ch).length - 1;

describe('protagonist sprites', () => {
  it('defines exactly the eight LABYRAZE protagonists with prime Maze Spirit first and default', () => {
    expect(PROTAGONIST_IDS).toEqual([
      'maze-spirit-prime',
      'maze-spirit',
      'lantern-wisp',
      'rune-ghost',
      'mask-wisp',
      'lab-lantern',
      'neon-sprite',
      'blob-spirit',
    ]);
    expect(DEFAULT_PROTAGONIST).toBe('maze-spirit-prime');
    expect(PROTAGONIST_NAME['maze-spirit-prime']).toBe('Maze Spirit');
    expect(PROTAGONIST_NAME['maze-spirit']).toBe('Maze Spirit Classic');
    expect(PROTAGONIST_NAME['blob-spirit']).toBe('Blob Spirit');
    expect([PROTAGONIST_W, PROTAGONIST_H, PROTAGONIST_FRAMES]).toEqual([18, 24, 2]);
  });

  it('every character is 18x24 in every frame and facing, with stamped eyes', () => {
    for (const id of PROTAGONIST_IDS) {
      for (let f = 0; f < PROTAGONIST_FRAMES; f++) {
        for (const facing of FACINGS) {
          const s = protagonistSprite(id, f, facing);
          expect([s.w, s.h]).toEqual([18, 24]);
          expect(count([...s.rows], 'o')).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('both frames differ (animation) while the silhouette stays put', () => {
    for (const id of PROTAGONIST_IDS) {
      const a = protagonistSprite(id, 0, 'none');
      const b = protagonistSprite(id, 1, 'none');
      expect(a.rows).not.toEqual(b.rows);
      expect(bounds(a)).toEqual(bounds(b));
      expect(Math.abs(opaque(a) - opaque(b))).toBeLessThanOrEqual(12);
    }
  });

  it('eyes follow the facing and the left view mirrors the right one', () => {
    for (const id of PROTAGONIST_IDS) {
      const eyeRow = (rows: string[]): number => rows.findIndex((r) => r.includes('o'));
      expect(eyeRow(protagonistRows(id, 0, 'up'))).toBeLessThanOrEqual(eyeRow(protagonistRows(id, 0, 'none')));
      expect(eyeRow(protagonistRows(id, 0, 'down'))).toBeGreaterThanOrEqual(eyeRow(protagonistRows(id, 0, 'none')));
      const right = protagonistRows(id, 0, 'right');
      expect(protagonistRows(id, 0, 'left')).toEqual(right.map((r) => [...r].reverse().join('')));
      expect(protagonistRows(id, 0, 'right')).toEqual(protagonistRows(id, 0, 'none'));
    }
  });

  it('eyes land on the face, never on transparency', () => {
    for (const id of PROTAGONIST_IDS) {
      const def = protagonistDef(id);
      for (const o of Object.values(def.eyes.origin)) {
        for (const [dx, dy] of [...def.eyes.cells, ...(def.eyes.spark ?? [])]) {
          for (let f = 0; f < PROTAGONIST_FRAMES; f++) {
            const ch = def.frames[f]![o[1] + dy]?.[o[0] + dx];
            expect(ch, `${id} f${f}`).not.toBe('.');
            expect(ch, `${id} f${f}`).toBeDefined();
          }
        }
      }
    }
  });

  it('all eight silhouettes are distinct and Arcade Phantom is not among them', () => {
    const shapes = PROTAGONIST_IDS.map((id) => protagonistSprite(id, 0, 'none').rows.map((r) => r.replace(/[^.]/g, 'X')).join('|'));
    expect(new Set(shapes).size).toBe(8);
    expect(PROTAGONIST_IDS).not.toContain('arcade-phantom');
  });

  it('the prime Maze Spirit has black oval eyes with cyan glints', () => {
    const rows = protagonistSprite('maze-spirit-prime', 0, 'none').rows;
    expect(count([...rows], 'o')).toBe(8);
    expect(count([...rows], 'G')).toBe(4);
  });

  it('every character stays readable: enough pixels in every frame and facing', () => {
    for (const id of PROTAGONIST_IDS) {
      for (let f = 0; f < PROTAGONIST_FRAMES; f++) {
        for (const facing of FACINGS) {
          expect(opaque(protagonistSprite(id, f, facing)), `${id} f${f} ${facing}`).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });
});

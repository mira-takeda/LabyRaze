// Maze Spirit sprites (LABYRAZE default protagonist, kept under the ghost API).
import { describe, expect, it } from 'vitest';
import { bounds, opaque } from '../../../src/render/sprites/format';
import {
  ALLY_PALETTES,
  FACINGS,
  GHOST_FRAMES,
  GHOST_H,
  GHOST_W,
  PLAYER_PALETTE,
  ghostIconRows,
  ghostRows,
  ghostSprite,
} from '../../../src/render/sprites/ghost';
import { MAZE_SPIRIT_PRIME_PALETTE, protagonistRows } from '../../../src/render/sprites/protagonists';

const count = (rows: string[], ch: string): number => rows.join('').split(ch).length - 1;

describe('Maze Spirit sprite', () => {
  it('is the ghost API: 18x24 in every frame and facing, with stamped eyes', () => {
    expect([GHOST_W, GHOST_H]).toEqual([18, 24]);
    for (let f = 0; f < GHOST_FRAMES; f++) {
      for (const facing of FACINGS) {
        const s = ghostSprite(f, facing);
        expect([s.w, s.h]).toEqual([18, 24]);
        expect(s.rows).toEqual(protagonistRows('maze-spirit-prime', f, facing));
        expect(count([...s.rows], 'o')).toBe(8);
        expect(count([...s.rows], 'G')).toBe(4);
      }
    }
  });

  it('animates between frames and mirrors for the left facing', () => {
    expect(ghostRows(0, 'none')).not.toEqual(ghostRows(1, 'none'));
    const right = ghostRows(0, 'right');
    expect(ghostRows(0, 'left')).toEqual(right.map((r) => [...r].reverse().join('')));
  });

  it('the Player is pale white with dark eyes; allies share the silhouette in pink, teal and orange', () => {
    expect(PLAYER_PALETTE).toEqual(MAZE_SPIRIT_PRIME_PALETTE);
    expect(PLAYER_PALETTE.W).toBe('#f2ecff');
    expect(PLAYER_PALETTE.o).toBe('#17102b');
    const base = ghostSprite(0, 'none');
    expect(ALLY_PALETTES.map((p) => p.W)).toEqual(['#ff6fb5', '#2fb3a5', '#ff9f43']);
    expect(Object.values(ALLY_PALETTES[1]!)).toContain('#3fd6c6');
    for (const pal of ALLY_PALETTES) {
      const s = ghostSprite(0, 'none', pal);
      expect(s.rows).toEqual(base.rows);
      expect(opaque(s)).toBe(opaque(base));
      expect(bounds(s)).toEqual(bounds(base));
    }
  });

  it('the 9x12 HUD icon keeps the silhouette and both eyes', () => {
    const icon = ghostIconRows();
    expect([icon[0]!.length, icon.length]).toEqual([9, 12]);
    expect(count(icon, 'o')).toBeGreaterThanOrEqual(2);
  });
});

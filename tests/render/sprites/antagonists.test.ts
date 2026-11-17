// LABYRAZE antagonist sprites: six original 24x24 haunts with two frames and five
// states (structure only; the gallery screenshots show the looks).
import { describe, expect, it } from 'vitest';
import { bounds, opaque } from '../../../src/render/sprites/format';
import {
  ANTAGONIST_FRAMES,
  ANTAGONIST_H,
  ANTAGONIST_IDS,
  ANTAGONIST_NAME,
  ANTAGONIST_STATES,
  ANTAGONIST_W,
  DEFAULT_ANTAGONIST,
  antagonistRows,
  antagonistSprite,
} from '../../../src/render/sprites/antagonists';

describe('antagonist sprites', () => {
  it('defines exactly the seven LABYRAZE antagonists with prime Shadow Bite default', () => {
    expect(ANTAGONIST_IDS).toEqual(['shadow-bite-prime', 'lantern-maw', 'cursed-mask', 'shadow-bite', 'pumpkin-tech', 'grave-wisp', 'night-idol']);
    expect(DEFAULT_ANTAGONIST).toBe('shadow-bite-prime');
    expect(ANTAGONIST_NAME['shadow-bite-prime']).toBe('Shadow Bite');
    expect(ANTAGONIST_NAME['shadow-bite']).toBe('Shadow Bite Classic');
    expect([ANTAGONIST_W, ANTAGONIST_H, ANTAGONIST_FRAMES]).toEqual([24, 24, 2]);
    expect(ANTAGONIST_STATES).toEqual(['normal', 'power', 'speed', 'respawn', 'fleeing']);
  });

  it('every character, state and frame is 24x24', () => {
    for (const id of ANTAGONIST_IDS) {
      for (const st of ANTAGONIST_STATES) {
        for (let f = 0; f < ANTAGONIST_FRAMES; f++) {
          const s = antagonistSprite(id, st, f);
          expect([s.w, s.h]).toEqual([24, 24]);
        }
      }
    }
  });

  it('states differ in face or colour, never in silhouette', () => {
    for (const id of ANTAGONIST_IDS) {
      const base = antagonistSprite(id, 'normal', 0);
      const keys = ANTAGONIST_STATES.map((st) => JSON.stringify([antagonistRows(id, st, 0), antagonistSprite(id, st, 0).palette]));
      expect(new Set(keys).size).toBe(ANTAGONIST_STATES.length);
      for (const st of ANTAGONIST_STATES) {
        const s = antagonistSprite(id, st, 0);
        const shape = (rows: readonly string[]): string => rows.map((r) => r.replace(/[^.]/g, 'X')).join('|');
        expect(shape([...s.rows])).toBe(shape([...base.rows]));
      }
    }
  });

  it('both frames differ (animation) while the silhouette stays put', () => {
    for (const id of ANTAGONIST_IDS) {
      for (const st of ANTAGONIST_STATES) {
        const a = antagonistSprite(id, st, 0);
        const b = antagonistSprite(id, st, 1);
        expect(a.rows).not.toEqual(b.rows);
        expect(bounds(a)).toEqual(bounds(b));
      }
    }
  });

  it('fleeing reads edible: white features on frightened blues', () => {
    for (const id of ANTAGONIST_IDS) {
      const s = antagonistSprite(id, 'fleeing', 0);
      const used = new Set(s.rows.join('').replace(/\./g, ''));
      const colours = [...used].map((c) => s.palette[c]!.toLowerCase());
      expect(colours).toContain('#ffffff');
      expect(colours.some((c) => ['#2a44c0', '#4a6cff', '#a8b8ff', '#101a5a', '#16205c', '#0a1030'].includes(c))).toBe(true);
      expect(s.palette).not.toEqual(antagonistSprite(id, 'normal', 0).palette);
    }
  });

  it('all seven silhouettes are distinct and readable at gameplay size', () => {
    const shapes = ANTAGONIST_IDS.map((id) => antagonistSprite(id, 'normal', 0).rows.map((r) => r.replace(/[^.]/g, 'X')).join('|'));
    expect(new Set(shapes).size).toBe(7);
    for (const id of ANTAGONIST_IDS) {
      for (const st of ANTAGONIST_STATES) {
        expect(opaque(antagonistSprite(id, st, 0)), `${id} ${st}`).toBeGreaterThanOrEqual(80);
      }
    }
  });
});

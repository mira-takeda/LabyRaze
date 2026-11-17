// Shadow Bite sprites (LABYRAZE default antagonist, kept under the Squareman API).
import { describe, expect, it } from 'vitest';
import { bounds, opaque } from '../../../src/render/sprites/format';
import { antagonistSprite } from '../../../src/render/sprites/antagonists';
import { SQUAREMAN_FRAMES, SQUAREMAN_H, SQUAREMAN_STATES, SQUAREMAN_W, squaremanSprite } from '../../../src/render/sprites/squareman';

describe('Shadow Bite sprites', () => {
  it('is the Squareman API: 24x24 in every state and frame', () => {
    expect([SQUAREMAN_W, SQUAREMAN_H]).toEqual([24, 24]);
    for (const st of SQUAREMAN_STATES) {
      for (let f = 0; f < SQUAREMAN_FRAMES; f++) {
        const s = squaremanSprite(st, f);
        expect([s.w, s.h]).toEqual([24, 24]);
        expect(s.rows).toEqual(antagonistSprite('shadow-bite-prime', st, f).rows);
        expect(opaque(s)).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it('states differ in face or colour, never in silhouette', () => {
    const shape = (rows: readonly string[]): string => rows.map((r) => r.replace(/[^.]/g, 'X')).join('|');
    const base = squaremanSprite('normal', 0);
    const keys = SQUAREMAN_STATES.map((st) => JSON.stringify([squaremanSprite(st, 0).rows, squaremanSprite(st, 0).palette]));
    expect(new Set(keys).size).toBe(SQUAREMAN_STATES.length);
    for (const st of SQUAREMAN_STATES) {
      const s = squaremanSprite(st, 0);
      expect(shape([...s.rows])).toBe(shape([...base.rows]));
      expect(bounds(s)).toEqual(bounds(base));
    }
  });

  it('the normal body is dark with amber eyes and fleeing looks edible', () => {
    const normal = squaremanSprite('normal', 0);
    expect(normal.palette.K).toBe('#150b28');
    expect(normal.palette.e).toBe('#ffb42d');
    const fleeing = squaremanSprite('fleeing', 0);
    expect(fleeing.palette.f).toBe('#ffffff');
    expect(fleeing.palette.K).not.toBe(normal.palette.K);
  });

  it('defeated crosses the eyes out and chase narrows them', () => {
    const defeated = squaremanSprite('respawn', 0);
    expect(defeated.rows.join('').replace(/\./g, '')).toContain('e');
    expect(defeated.palette.e).toBe('#cfc2f2');
    expect(squaremanSprite('power', 0).rows).not.toEqual(squaremanSprite('normal', 0).rows);
  });
});

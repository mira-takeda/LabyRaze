import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { collectWisp, scoreFor, INITIAL_COMBO, type ComboState } from '../../src/core/score';

// Validates: Requirements 16.1
const cfg = DEFAULT_CONFIG;
const w = cfg.scoreWeights;

describe('score weights (10 / 500 / 100 / 1000)', () => {
  it('default weights match the design', () => {
    expect(w).toEqual({ ordinary: 10, captive: 500, hunterEaten: 100, level: 1000 });
  });

  it('captive release scores 500', () => {
    expect(scoreFor(w, 'captive')).toBe(500);
  });

  it('Hunter eaten scores 100 (same weight for player and ally catches)', () => {
    // Design: ally catches use the shared eaten handler; score goes to the Player at hunterEaten.
    expect(scoreFor(w, 'hunterEaten')).toBe(100);
  });

  it('level completion scores 1000', () => {
    expect(scoreFor(w, 'level')).toBe(1000);
  });

  it('ordinary weight is 10 and follows custom weights', () => {
    expect(scoreFor(w, 'ordinary')).toBe(10);
    expect(scoreFor({ ordinary: 1, captive: 2, hunterEaten: 3, level: 4 }, 'level')).toBe(4);
  });
});

describe('wisp points at each multiplier', () => {
  it('awards wispPoints * m for m = 1..comboCap', () => {
    let combo: ComboState = { ...INITIAL_COMBO };
    for (let m = 1; m <= cfg.comboCap; m++) {
      const r = collectWisp(combo, { x: 0, y: 0 } as never, cfg);
      expect(r.combo.comboCount).toBe(m);
      expect(r.points).toBe(cfg.wispPoints * m);
      combo = r.combo;
    }
  });

  it('stays at comboCap beyond the cap', () => {
    const combo: ComboState = { comboCount: cfg.comboCap, comboTicksLeft: 5 };
    const r = collectWisp(combo, { x: 0, y: 0 } as never, cfg);
    expect(r.points).toBe(cfg.wispPoints * cfg.comboCap);
  });
});

describe('Ordinary_Pellets never score for the Player', () => {
  it('Player wisp pickup ignores the ordinary weight', () => {
    const zero = { ...cfg, scoreWeights: { ...w, ordinary: 0 } };
    const huge = { ...cfg, scoreWeights: { ...w, ordinary: 999999 } };
    const a = collectWisp(INITIAL_COMBO, { x: 1, y: 1 } as never, zero);
    const b = collectWisp(INITIAL_COMBO, { x: 1, y: 1 } as never, huge);
    expect(a.points).toBe(b.points);
    expect(a.points).toBe(cfg.wispPoints);
  });
});

describe('combined example', () => {
  it('2 captives + 1 Hunter eaten + level + two chained wisps', () => {
    const first = collectWisp(INITIAL_COMBO, { x: 0, y: 0 } as never, cfg);
    const second = collectWisp(first.combo, { x: 1, y: 0 } as never, cfg);
    const total =
      2 * scoreFor(w, 'captive') +
      scoreFor(w, 'hunterEaten') +
      scoreFor(w, 'level') +
      first.points +
      second.points;
    expect(total).toBe(1000 + 100 + 1000 + 20 + 40);
  });
});

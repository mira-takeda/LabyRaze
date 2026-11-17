import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import {
  INITIAL_COMBO,
  collectWisp,
  resetComboOnEaten,
  scoreFor,
  tickCombo,
  type ComboState,
} from '../../src/core/score';
import { arbComboSequence } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const cell = { x: 1, y: 1 };

function advance(c: ComboState, n: number): ComboState {
  let s = c;
  for (let i = 0; i < n; i++) s = tickCombo(s).combo;
  return s;
}

// Property simulations are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('score weights', () => {
  it('reads each configured weight', () => {
    expect(scoreFor(cfg.scoreWeights, 'ordinary')).toBe(10);
    expect(scoreFor(cfg.scoreWeights, 'captive')).toBe(500);
    expect(scoreFor(cfg.scoreWeights, 'hunterEaten')).toBe(100);
    expect(scoreFor(cfg.scoreWeights, 'level')).toBe(1000);
  });
});

describe('Combo', () => {
  it('first wisp scores wispPoints x1 and opens the window', () => {
    const r = collectWisp(INITIAL_COMBO, cell, cfg);
    expect(r.points).toBe(cfg.wispPoints);
    expect(r.combo).toEqual({ comboCount: 1, comboTicksLeft: cfg.comboWindowTicks });
    expect(r.event).toEqual({ t: 'WispCollected', cell, combo: 1, points: cfg.wispPoints, bonus: 0 });
  });

  it('increments inside the window and multiplies points', () => {
    let c = collectWisp(INITIAL_COMBO, cell, cfg).combo;
    c = advance(c, 10);
    const r = collectWisp(c, cell, cfg);
    expect(r.combo.comboCount).toBe(2);
    expect(r.points).toBe(cfg.wispPoints * 2);
    expect(r.combo.comboTicksLeft).toBe(cfg.comboWindowTicks);
  });

  it('caps at comboCap', () => {
    let c: ComboState = INITIAL_COMBO;
    let last = 0;
    for (let i = 0; i < cfg.comboCap + 4; i++) {
      const r = collectWisp(c, cell, cfg);
      c = r.combo;
      last = r.points;
    }
    expect(c.comboCount).toBe(cfg.comboCap);
    expect(last).toBe(cfg.wispPoints * cfg.comboCap);
  });

  it('expires after the window, emitting ComboReset once', () => {
    let c = collectWisp(INITIAL_COMBO, cell, cfg).combo;
    c = collectWisp(c, cell, cfg).combo;
    c = advance(c, cfg.comboWindowTicks - 1);
    expect(c.comboCount).toBe(2);
    const t = tickCombo(c);
    expect(t.combo).toEqual({ comboCount: 1, comboTicksLeft: 0 });
    expect(t.events).toEqual([{ t: 'ComboReset', reason: 'expired' }]);
    expect(tickCombo(t.combo).events).toEqual([]);
    expect(collectWisp(t.combo, cell, cfg).combo.comboCount).toBe(1);
  });

  it('resets when the Player is eaten', () => {
    const c = collectWisp(collectWisp(INITIAL_COMBO, cell, cfg).combo, cell, cfg).combo;
    const r = resetComboOnEaten(c);
    expect(r.combo).toEqual({ comboCount: 1, comboTicksLeft: 0 });
    expect(r.events).toEqual([{ t: 'ComboReset', reason: 'playerEaten' }]);
    expect(resetComboOnEaten(INITIAL_COMBO).events).toEqual([]);
  });

  it('does not mutate its input', () => {
    const c: ComboState = Object.freeze({ comboCount: 2, comboTicksLeft: 5 });
    collectWisp(c, cell, cfg);
    tickCombo(c);
    resetComboOnEaten(c);
    expect(c).toEqual({ comboCount: 2, comboTicksLeft: 5 });
  });
});

describe('Combo property', () => {
  it('multiplier in [1, cap], score monotone, score equals reference model', () => {
    fc.assert(
      fc.property(arbComboSequence, fc.integer({ min: 1, max: 8 }), (seq, cap) => {
        const conf = { ...cfg, comboWindowTicks: seq.window, comboCap: cap };
        let c: ComboState = INITIAL_COMBO;
        let score = 0;
        let prevScore = 0;
        let refScore = 0;
        let refCombo = 0;
        let prevTick = -Infinity;
        let tick = 0;
        for (const at of seq.ticks) {
          // Tick loop: countdown runs at the end of every Tick before the pickup Tick.
          while (tick < at) {
            c = tickCombo(c).combo;
            tick++;
          }
          const r = collectWisp(c, cell, conf);
          c = r.combo;
          score += r.points;
          // Reference: combo continues iff gap since previous pickup is < window.
          refCombo = at - prevTick < seq.window ? Math.min(cap, refCombo + 1) : 1;
          refScore += conf.wispPoints * refCombo;
          prevTick = at;
          expect(c.comboCount).toBeGreaterThanOrEqual(1);
          expect(c.comboCount).toBeLessThanOrEqual(cap);
          expect(c.comboCount).toBe(refCombo);
          expect(score).toBeGreaterThanOrEqual(prevScore);
          expect(score).toBe(refScore);
          prevScore = score;
        }
      }),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { evaluateOutcome } from '../../src/core/rules';
import {
  INITIAL_COMBO,
  collectWisp,
  resetComboOnEaten,
  tickCombo,
  type ComboState,
} from '../../src/core/score';
import { cageState } from '../helpers/fixtures';

const cell = { x: 1, y: 1 };

type Op = 'wisp' | 'tick' | 'eaten';
const arbOps = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: fc.constant<Op>('wisp') },
    { weight: 5, arbitrary: fc.constant<Op>('tick') },
    { weight: 1, arbitrary: fc.constant<Op>('eaten') },
  ),
  { maxLength: 120 },
);

// Property simulations are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Feature: kirobit-halloween-maze, Property 44: Combo semantics', () => {
  // **Validates: Requirements 30.2, 30.3, 30.6, 30.7, 30.8**
  it('window reset, capped increments, single expiry reset and eaten reset follow the reference model', () => {
    fc.assert(
      fc.property(
        arbOps,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 50 }),
        (ops, window, cap, wispPoints) => {
          const cfg = { ...DEFAULT_CONFIG, comboWindowTicks: window, comboCap: cap, wispPoints };
          let c: ComboState = INITIAL_COMBO;
          // Independent reference model.
          let count = 1;
          let left = 0;
          let score = 0;
          let refScore = 0;

          for (const op of ops) {
            if (op === 'wisp') {
              const wasActive = left > 0;
              const r = collectWisp(c, cell, cfg);
              count = wasActive ? Math.min(cap, count + 1) : 1;
              left = window;
              c = r.combo;
              score += r.points;
              refScore += wispPoints * count;
              // Window resets on every wisp; count increments only inside the window, capped.
              expect(c.comboTicksLeft).toBe(window);
              expect(c.comboCount).toBe(count);
              expect(c.comboCount).toBeLessThanOrEqual(cap);
              expect(r.points).toBe(wispPoints * count);
              expect(r.event).toEqual({ t: 'WispCollected', cell, combo: count, points: r.points, bonus: r.event.bonus });
            } else if (op === 'tick') {
              const r = tickCombo(c);
              const expires = left === 1;
              if (left > 0) left -= 1;
              if (expires) count = 1;
              c = r.combo;
              const expected: GameEvent[] = expires ? [{ t: 'ComboReset', reason: 'expired' }] : [];
              expect(r.events).toEqual(expected); // expiry emits exactly one ComboReset
            } else {
              const running = left > 0 || count > 1;
              const r = resetComboOnEaten(c);
              count = 1;
              left = 0;
              c = r.combo;
              const expected: GameEvent[] = running ? [{ t: 'ComboReset', reason: 'playerEaten' }] : [];
              expect(r.events).toEqual(expected); // only when a combo was running
            }
            expect(c).toEqual({ comboCount: count, comboTicksLeft: left });
          }
          expect(score).toBe(refScore);
        },
      ),
    );
  });

  it('after expiry no further ComboReset is emitted until a new window opens', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 40 }), (window, extra) => {
        const cfg = { ...DEFAULT_CONFIG, comboWindowTicks: window };
        let c = collectWisp(INITIAL_COMBO, cell, cfg).combo;
        let resets = 0;
        for (let i = 0; i < window + extra; i++) {
          const r = tickCombo(c);
          c = r.combo;
          resets += r.events.length;
        }
        expect(resets).toBe(1);
      }),
    );
  });

  it('combo operations change score only, never ordinaryRemaining, captives or the outcome', () => {
    fc.assert(
      fc.property(arbOps, (ops) => {
        const base = cageState();
        let state = base;
        for (const op of ops) {
          const combo = { comboCount: state.comboCount, comboTicksLeft: state.comboTicksLeft };
          if (op === 'wisp') {
            const r = collectWisp(combo, cell, DEFAULT_CONFIG);
            state = { ...state, ...r.combo, score: state.score + r.points };
          } else if (op === 'tick') {
            state = { ...state, ...tickCombo(combo).combo };
          } else {
            state = { ...state, ...resetComboOnEaten(combo).combo };
          }
          const out = evaluateOutcome(state);
          expect(out.state.phase).toBe(base.phase);
          expect(out.state.outcome).toBe(base.outcome);
          expect(out.events).toEqual([]);
        }
        expect(state.items).toBe(base.items);
        expect(state.items.ordinaryRemaining).toBe(base.items.ordinaryRemaining);
        expect(state.captives).toEqual(base.captives);
        expect(state.lives).toBe(base.lives);
        expect(state.score).toBeGreaterThanOrEqual(base.score);
      }),
    );
  });
});

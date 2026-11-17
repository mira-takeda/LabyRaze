import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import { grantPower, tickPowerTimers, type Duo } from '../../src/core/powers';
import type { Who } from '../../src/core/types';
import { makeCharacter } from '../helpers/fixtures';

const fresh = (): Duo => ({
  player: makeCharacter('player', { x: 1, y: 1 }),
  hunter: makeCharacter('hunter', { x: 7, y: 1 }),
});

const WHO: Who[] = ['player', 'hunter'];

type Op = { k: 'grant'; who: Who } | { k: 'tick'; n: number };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ k: fc.constant('grant' as const), who: fc.constantFrom(...WHO) }),
  fc.record({ k: fc.constant('tick' as const), n: fc.integer({ min: 1, max: cfg.powerTicks + 20 }) }),
);

describe('Feature: kirobit-halloween-maze, Property 18: Power timing and refresh', () => {
  it('Feature: kirobit-halloween-maze, Property 18: Power timing and refresh (random sequences)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        let s = fresh();
        const model: Record<Who, number> = { player: 0, hunter: 0 };
        const count = (ev: { t: string; who?: Who }[], t: string, who: Who) =>
          ev.filter((e) => e.t === t && e.who === who).length;

        for (const op of ops) {
          if (op.k === 'grant') {
            const opp: Who = op.who === 'player' ? 'hunter' : 'player';
            const r = grantPower(s, op.who, cfg);
            const reversed = r.events.some((e) => e.t === 'RoleReversed');
            // Same-holder refresh (or fresh grant) never reverses roles; only a cancellation does.
            expect(reversed).toBe(model[opp] > 0);
            expect(count(r.events, 'PowerEnded', opp)).toBe(model[opp] > 0 ? 1 : 0);
            if (model[op.who] > 0 && model[opp] === 0) {
              expect(reversed).toBe(false);
              expect(r.events.some((e) => e.t === 'PowerEnded')).toBe(false);
            }
            // Grant or refresh restarts the timer to exactly powerTicks.
            expect(r[op.who].power).toBe(cfg.powerTicks);
            model[op.who] = cfg.powerTicks;
            model[opp] = 0;
            s = { player: r.player, hunter: r.hunter };
          } else {
            for (let i = 0; i < op.n; i++) {
              const r = tickPowerTimers(s);
              for (const w of WHO) {
                const expectedEnd = model[w] === 1 ? 1 : 0;
                model[w] = Math.max(0, model[w] - 1);
                if (count(r.events, 'PowerEnded', w) !== expectedEnd) {
                  throw new Error(`PowerEnded count wrong for ${w}`);
                }
                if (r[w].power !== model[w] || r[w].power < 0) {
                  throw new Error(`timer mismatch for ${w}: ${r[w].power} vs ${model[w]}`);
                }
              }
              s = { player: r.player, hunter: r.hunter };
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it('a grant lasts exactly powerTicks Ticks, then PowerEnded fires once', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WHO), (who) => {
        let s: Duo = fresh();
        s = grantPower(s, who, cfg);
        let ended = 0;
        for (let i = 1; i <= cfg.powerTicks + 10; i++) {
          const r = tickPowerTimers(s);
          ended += r.events.filter((e) => e.t === 'PowerEnded').length;
          s = r;
          if (i < cfg.powerTicks) expect(s[who].power).toBeGreaterThan(0);
          if (i === cfg.powerTicks) expect(s[who].power).toBe(0);
          expect(ended).toBe(i >= cfg.powerTicks ? 1 : 0);
        }
      }),
    );
  }, 30000);

  it('duration in seconds is powerTicks / tickRate, about 5', () => {
    const seconds = cfg.powerTicks / cfg.tickRate;
    expect(seconds).toBe(5);
    expect(Math.abs(seconds - 5)).toBeLessThanOrEqual(0.5);
  });
});

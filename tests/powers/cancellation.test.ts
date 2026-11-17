import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import {
  powerHolder,
  resolvePowerPickups,
  tickPowerTimers,
  ticksLeft,
  other,
  type Duo,
} from '../../src/core/powers';
import type { Who } from '../../src/core/types';
import { makeCharacter } from '../helpers/fixtures';

const fresh = (): Duo => ({
  player: makeCharacter('player', { x: 1, y: 1 }),
  hunter: makeCharacter('hunter', { x: 7, y: 1 }),
});

const count = (evs: { t: string }[], t: string) => evs.filter((e) => e.t === t).length;

// A step: which characters pick up a Power_Pellet on this Tick (none, one, or both).
const stepArb = fc.record({
  player: fc.boolean(),
  hunter: fc.boolean(),
  // extra idle Ticks that elapse after this one (lets timers run down/expire)
  idle: fc.integer({ min: 0, max: 40 }),
});

describe('Feature: kirobit-halloween-maze, Property 17: Single power holder with cancellation', () => {
  it('holds for random sequences of pickups, ticks and same-Tick double pickups', () => {
    // **Validates: Requirements 9.4, 9.5, 9.6, 19.5, 19.6, 31.7**
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 40 }), fc.nat(1000), (steps, t0) => {
        let s = fresh();
        let tick = t0;
        for (const st of steps) {
          const before = s;
          const r = resolvePowerPickups(s, tick, { player: st.player, hunter: st.hunter }, cfg);
          s = { player: r.player, hunter: r.hunter };

          // at most one holder right after the pickup
          expect(s.player.power > 0 && s.hunter.power > 0).toBe(false);

          const anyPick = st.player || st.hunter;
          if (anyPick) {
            const grantee: Who =
              st.player && st.hunter ? (tick % 2 === 0 ? 'player' : 'hunter') : st.player ? 'player' : 'hunter';
            const prev = other(grantee);
            // holder's timer is exactly powerTicks right after the grant
            expect(ticksLeft(s, grantee)).toBe(cfg.powerTicks);
            expect(powerHolder(s)).toBe(grantee);
            // previous holder loses power on the SAME Tick
            expect(ticksLeft(s, prev)).toBe(0);
            // RoleReversed exactly when an active holder is cancelled
            const cancelled = before[prev].power > 0;
            expect(count(r.events, 'RoleReversed')).toBe(cancelled ? 1 : 0);
            if (cancelled) {
              expect(r.events).toContainEqual({ t: 'RoleReversed', to: grantee });
            }
          } else {
            expect(r.events).toEqual([]);
            expect(s).toEqual(before);
          }

          // advance the Tick and any idle Ticks
          for (let i = 0; i <= st.idle; i++) {
            const tr = tickPowerTimers(s);
            s = { player: tr.player, hunter: tr.hunter };
            expect(count(tr.events, 'RoleReversed')).toBe(0);
            expect(s.player.power > 0 && s.hunter.power > 0).toBe(false);
            tick++;
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('power cancellation examples', () => {
  it('a Squareman pellet cancels the Player Power_State on the same Tick', () => {
    const first = resolvePowerPickups(fresh(), 4, { player: true, hunter: false }, cfg);
    expect(first.player.power).toBe(cfg.powerTicks);
    const r = resolvePowerPickups(first, 5, { player: false, hunter: true }, cfg);
    expect(r.player.power).toBe(0);
    expect(r.hunter.power).toBe(cfg.powerTicks);
    expect(r.events).toContainEqual({ t: 'RoleReversed', to: 'hunter' });
    expect(r.events).toContainEqual({ t: 'PowerEnded', who: 'player' });
  });

  it('a Player pellet cancels the Squareman Power_State on the same Tick', () => {
    const first = resolvePowerPickups(fresh(), 4, { player: false, hunter: true }, cfg);
    expect(first.hunter.power).toBe(cfg.powerTicks);
    const r = resolvePowerPickups(first, 5, { player: true, hunter: false }, cfg);
    expect(r.hunter.power).toBe(0);
    expect(r.player.power).toBe(cfg.powerTicks);
    expect(r.events).toContainEqual({ t: 'RoleReversed', to: 'player' });
    expect(r.events).toContainEqual({ t: 'PowerEnded', who: 'hunter' });
  });

  it('same-Tick double pickup: even tick favours the Player', () => {
    const r = resolvePowerPickups(fresh(), 10, { player: true, hunter: true }, cfg);
    expect(powerHolder(r)).toBe('player');
    expect(r.hunter.power).toBe(0);
    expect(r.events).toContainEqual({ t: 'PowerDenied', who: 'hunter' });
    expect(count(r.events, 'RoleReversed')).toBe(0);
  });

  it('same-Tick double pickup: odd tick favours the Squareman', () => {
    const r = resolvePowerPickups(fresh(), 11, { player: true, hunter: true }, cfg);
    expect(powerHolder(r)).toBe('hunter');
    expect(r.player.power).toBe(0);
    expect(r.events).toContainEqual({ t: 'PowerDenied', who: 'player' });
    expect(count(r.events, 'RoleReversed')).toBe(0);
  });

  it('double pickup against an active holder: the winner cancels it (RoleReversed once)', () => {
    const held = resolvePowerPickups(fresh(), 2, { player: true, hunter: false }, cfg);
    const r = resolvePowerPickups(held, 7, { player: true, hunter: true }, cfg); // odd: hunter wins
    expect(powerHolder(r)).toBe('hunter');
    expect(r.player.power).toBe(0);
    expect(count(r.events, 'RoleReversed')).toBe(1);
  });
});

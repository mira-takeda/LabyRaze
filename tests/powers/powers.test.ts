import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import {
  grantPower,
  grantSpeed,
  powerHolder,
  resolvePowerPickups,
  speedUnits,
  tickPowerTimers,
  ticksLeft,
  type Duo,
} from '../../src/core/powers';
import { makeCharacter } from '../helpers/fixtures';

const fresh = (): Duo => ({
  player: makeCharacter('player', { x: 1, y: 1 }),
  hunter: makeCharacter('hunter', { x: 7, y: 1 }),
});

describe('power grant, cancellation, refresh, expiry', () => {
  it('grants power for powerTicks and reports the holder', () => {
    const r = grantPower(fresh(), 'player', cfg);
    expect(r.player.power).toBe(cfg.powerTicks);
    expect(powerHolder(r)).toBe('player');
    expect(ticksLeft(r, 'player')).toBe(300);
    expect(r.events).toEqual([{ t: 'PowerStarted', who: 'player' }]);
  });

  it('hunter pellet cancels player power on the same call, and vice versa', () => {
    const p = grantPower(fresh(), 'player', cfg);
    const h = grantPower(p, 'hunter', cfg);
    expect(h.player.power).toBe(0);
    expect(h.hunter.power).toBe(cfg.powerTicks);
    expect(h.events).toContainEqual({ t: 'RoleReversed', to: 'hunter' });
    const back = grantPower(h, 'player', cfg);
    expect(back.hunter.power).toBe(0);
    expect(powerHolder(back)).toBe('player');
    expect(back.events).toContainEqual({ t: 'RoleReversed', to: 'player' });
  });

  it('refresh restarts duration without RoleReversed', () => {
    let s: Duo = grantPower(fresh(), 'player', cfg);
    for (let i = 0; i < 100; i++) s = tickPowerTimers(s);
    expect(s.player.power).toBe(200);
    const r = grantPower(s, 'player', cfg);
    expect(r.player.power).toBe(cfg.powerTicks);
    expect(r.events.some((e) => e.t === 'RoleReversed')).toBe(false);
  });

  it('expires after exactly powerTicks ticks with PowerEnded', () => {
    let s: Duo = grantPower(fresh(), 'hunter', cfg);
    for (let i = 0; i < cfg.powerTicks - 1; i++) {
      const r = tickPowerTimers(s);
      expect(r.events).toEqual([]);
      s = r;
    }
    const r = tickPowerTimers(s);
    expect(r.hunter.power).toBe(0);
    expect(r.events).toEqual([{ t: 'PowerEnded', who: 'hunter' }]);
    expect(powerHolder(r)).toBeNull();
  });
});

describe('same-Tick double pickup tie-break', () => {
  it('even tick favors the player, odd tick the hunter, loser is denied', () => {
    const even = resolvePowerPickups(fresh(), 10, { player: true, hunter: true }, cfg);
    expect(powerHolder(even)).toBe('player');
    expect(even.events).toContainEqual({ t: 'PowerDenied', who: 'hunter' });
    const odd = resolvePowerPickups(fresh(), 11, { player: true, hunter: true }, cfg);
    expect(powerHolder(odd)).toBe('hunter');
    expect(odd.events).toContainEqual({ t: 'PowerDenied', who: 'player' });
    expect(odd.player.power).toBe(0);
  });

  it('a single pickup is never denied', () => {
    const r = resolvePowerPickups(fresh(), 3, { player: true, hunter: false }, cfg);
    expect(powerHolder(r)).toBe('player');
    expect(r.events.some((e) => e.t === 'PowerDenied')).toBe(false);
  });
});

describe('speed state', () => {
  it('grants, refreshes and expires independently of power', () => {
    let s: Duo = grantPower(fresh(), 'player', cfg);
    const g = grantSpeed(s, 'player', cfg);
    expect(g.events).toEqual([{ t: 'SpeedStarted', who: 'player' }]);
    s = g;
    expect(s.player.speed).toBe(cfg.speedDurationTicks);
    expect(s.player.power).toBe(cfg.powerTicks);
    for (let i = 0; i < 100; i++) s = tickPowerTimers(s);
    s = grantSpeed(s, 'player', cfg);
    expect(s.player.speed).toBe(cfg.speedDurationTicks);
    let ended = 0;
    for (let i = 0; i < cfg.speedDurationTicks; i++) {
      const r = tickPowerTimers(s);
      ended += r.events.filter((e) => e.t === 'SpeedEnded').length;
      s = r;
    }
    expect(ended).toBe(1);
    expect(s.player.speed).toBe(0);
  });

  it('multiplier changes movement units only while sped up', () => {
    const base = 125;
    const slow = makeCharacter('player', { x: 1, y: 1 });
    const fast = makeCharacter('player', { x: 1, y: 1 }, { speed: 5 });
    expect(speedUnits(base, slow, cfg)).toBe(base);
    expect(speedUnits(base, fast, cfg)).toBe(Math.round(base * cfg.speedMultiplier));
    // other fields are untouched by the speed grant
    const g = grantSpeed(fresh(), 'hunter', cfg);
    expect({ ...g.hunter, speed: 0 }).toEqual(fresh().hunter);
  });
});

describe('Property 17: single power holder', () => {
  it('at most one holder after any pickup sequence', () => {
    const step = fc.record({
      player: fc.boolean(),
      hunter: fc.boolean(),
      speed: fc.constantFrom<'player' | 'hunter' | null>('player', 'hunter', null),
    });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 400 }), (steps) => {
        let s: Duo = fresh();
        steps.forEach((p, tick) => {
          const r = resolvePowerPickups(s, tick, p, cfg);
          s = r;
          if (p.speed) s = grantSpeed(s, p.speed, cfg);
          s = tickPowerTimers(s);
          expect(s.player.power > 0 && s.hunter.power > 0).toBe(false);
          if (p.player || p.hunter) {
            // the Tick's grant is visible immediately: exactly one holder
            expect(powerHolder(s)).not.toBeNull();
          }
        });
      }),
      { numRuns: 100 },
    );
  });
});

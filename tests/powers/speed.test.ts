import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import { stepMovement, type MoveEnv } from '../../src/core/movement';
import {
  grantPower,
  grantSpeed,
  speedTicksLeft,
  speedUnits,
  tickPowerTimers,
  type Duo,
} from '../../src/core/powers';
import type { Who } from '../../src/core/types';
import { makeCharacter, mazeFromAscii } from '../helpers/fixtures';

const fresh = (): Duo => ({
  player: makeCharacter('player', { x: 1, y: 1 }),
  hunter: makeCharacter('hunter', { x: 7, y: 1 }),
});

const WHO: Who[] = ['player', 'hunter'];

// One Tick of input: optional Speed_Pellet and Power_Pellet pickups, then the timers tick.
interface Op {
  speed: Who | null;
  power: Who | null;
}
const opArb: fc.Arbitrary<Op> = fc.record({
  speed: fc.option(fc.constantFrom(...WHO), { nil: null }),
  power: fc.option(fc.constantFrom(...WHO), { nil: null }),
});

describe('Feature: kirobit-halloween-maze, Property 20: Speed state', () => {
  it('Feature: kirobit-halloween-maze, Property 20: Speed state (random pickup/tick sequences)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 700 }), (ops) => {
        let s = fresh();
        // Reference model: remaining speed ticks per character.
        const model: Record<Who, number> = { player: 0, hunter: 0 };
        const levelUnits = cfg.baseUnitsPerTick;

        for (const op of ops) {
          const before = { player: s.player.power, hunter: s.hunter.power };

          if (op.power) s = { ...s, ...grantPower(s, op.power, cfg) };
          const powerAfterGrant = { player: s.player.power, hunter: s.hunter.power };

          if (op.speed) {
            const r = grantSpeed(s, op.speed, cfg);
            // A grant (or refresh) sets the full duration.
            expect(r[op.speed].speed).toBe(cfg.speedDurationTicks);
            expect(r.events).toEqual([{ t: 'SpeedStarted', who: op.speed }]);
            // Speed never alters Power_State, nor the other character's speed.
            expect(r.player.power).toBe(powerAfterGrant.player);
            expect(r.hunter.power).toBe(powerAfterGrant.hunter);
            expect(speedTicksLeft(r, other(op.speed))).toBe(speedTicksLeft(s, other(op.speed)));
            s = { player: r.player, hunter: r.hunter };
            model[op.speed] = cfg.speedDurationTicks;
          }

          // Speed multiplier applies only while active.
          for (const w of WHO) {
            const expected =
              model[w] > 0 ? Math.round(levelUnits * cfg.speedMultiplier) : levelUnits;
            expect(speedUnits(levelUnits, s[w], cfg)).toBe(expected);
          }

          const t = tickPowerTimers(s);
          const powerBefore = { player: s.player.power, hunter: s.hunter.power };
          s = { player: t.player, hunter: t.hunter };

          for (const w of WHO) {
            const ended = model[w] === 1;
            model[w] = Math.max(0, model[w] - 1);
            expect(speedTicksLeft(s, w)).toBe(model[w]);
            // SpeedEnded fires exactly once, on the Tick the timer reaches zero.
            expect(t.events.filter((e) => e.t === 'SpeedEnded' && e.who === w).length).toBe(
              ended ? 1 : 0,
            );
            // Power decrements independently of speed.
            expect(s[w].power).toBe(Math.max(0, powerBefore[w] - 1));
          }
          void before;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('expires after exactly speedDurationTicks ticks with a single SpeedEnded, for both characters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WHO), (who) => {
        let s: Duo = fresh();
        const g = grantSpeed(s, who, cfg);
        s = { player: g.player, hunter: g.hunter };
        let ended = 0;
        for (let i = 1; i <= cfg.speedDurationTicks + 5; i++) {
          const t = tickPowerTimers(s);
          s = { player: t.player, hunter: t.hunter };
          ended += t.events.filter((e) => e.t === 'SpeedEnded').length;
          expect(speedTicksLeft(s, who) > 0).toBe(i < cfg.speedDurationTicks);
        }
        expect(ended).toBe(1);
      }),
    );
  });

  it('both characters can hold speed, and power, at the same time independently', () => {
    let s = fresh();
    s = { ...s, ...grantPower(s, 'player', cfg) };
    s = { ...s, ...grantSpeed(s, 'player', cfg) };
    s = { ...s, ...grantSpeed(s, 'hunter', cfg) };
    expect(s.player.power).toBe(cfg.powerTicks);
    expect(s.player.speed).toBe(cfg.speedDurationTicks);
    expect(s.hunter.speed).toBe(cfg.speedDurationTicks);
    expect(s.hunter.power).toBe(0);
  });

  it('a character with speed covers more cells in N ticks along a straight corridor', () => {
    const maze = mazeFromAscii([
      'H'.repeat(60),
      'P' + '.'.repeat(58) + 'U',
      'H'.repeat(60),
    ]);
    const env: MoveEnv = {
      width: maze.width,
      height: maze.height,
      tiles: maze.tiles,
      doors: maze.doors,
      doorMask: 0,
      wrapPairs: maze.wrapPairs,
    };
    fc.assert(
      fc.property(fc.constantFrom(...WHO), fc.integer({ min: 16, max: 100 }), (who, n) => {
        const run = (fast: boolean): number => {
          let c = makeCharacter(who, { x: 1, y: 1 }, { speed: fast ? cfg.speedDurationTicks : 0 });
          const units = speedUnits(cfg.baseUnitsPerTick, c, cfg);
          c = stepMovement(c, 'right', units, env);
          for (let i = 1; i < n; i++) c = stepMovement(c, null, units, env);
          return c.cell.x - 1;
        };
        expect(run(true)).toBeGreaterThan(run(false));
      }),
    );
  });
});

function other(w: Who): Who {
  return w === 'player' ? 'hunter' : 'player';
}

// Feature: kirobit-halloween-maze, Property 10: Door schedule shape
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 18.x**
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import type { DoorSpec, DoorState } from '../../src/core/types';
import { carveMaze } from '../../src/core/maze/carve';
import { placeDoors } from '../../src/core/maze/doorPlacement';
import {
  MIN_DOOR_WARN_TICKS,
  initDoors,
  openDuration,
  scheduleAt,
  stepDoors,
  type DoorOccupants,
} from '../../src/core/doors';

const cfg = DEFAULT_CONFIG;
const WARN = Math.max(MIN_DOOR_WARN_TICKS, cfg.doorWarnTicks);

// No occupants anywhere: both characters stand far from any Door.
const nobody: DoorOccupants = {
  player: { cell: { x: -5, y: -5 }, next: null },
  hunter: { cell: { x: -6, y: -6 }, next: null },
};

interface Logged {
  tick: number;
  ev: GameEvent;
}

function simulate(specs: DoorSpec[], ticks: number): { log: Logged[]; history: DoorState[][] } {
  let doors = initDoors(specs, 0, cfg);
  const history: DoorState[][] = [doors];
  const log: Logged[] = [];
  for (let t = 1; t <= ticks; t++) {
    const r = stepDoors(specs, doors, t, nobody, cfg);
    doors = r.doors;
    history.push(doors);
    for (const ev of r.events) log.push({ tick: t, ev });
  }
  return { log, history };
}

/** Every DoorChanged (after `exemptUntil`) has a same-direction DoorWarning >= WARN ticks earlier. */
function expectWarned(log: Logged[], exemptUntil: number): void {
  const warnings = new Map<string, number[]>();
  for (const { tick, ev } of log) {
    if (ev.t === 'DoorWarning') {
      const k = `${ev.doorIndex}:${ev.open}`;
      const list = warnings.get(k) ?? [];
      list.push(tick);
      warnings.set(k, list);
    }
  }
  for (const { tick, ev } of log) {
    if (ev.t !== 'DoorChanged' || tick <= exemptUntil) continue;
    const list = warnings.get(`${ev.doorIndex}:${ev.open}`) ?? [];
    expect(list.some((w) => w <= tick - WARN && w <= tick - MIN_DOOR_WARN_TICKS)).toBe(true);
  }
}

function checkShape(specs: DoorSpec[], exemptUntil: number): void {
  const maxPeriod = Math.max(...specs.map((s) => s.period));
  const { log, history } = simulate(specs, 3 * maxPeriod);

  specs.forEach((s, i) => {
    const dur = openDuration(s);
    // Scheduled shape: periodic, with the exact open fraction.
    let scheduledOpen = 0;
    for (let t = 0; t < s.period; t++) {
      const a = scheduleAt(s, t).open;
      if (scheduleAt(s, t + s.period).open !== a || scheduleAt(s, t + 2 * s.period).open !== a) {
        throw new Error(`schedule not periodic at tick ${t}`);
      }
      if (a) scheduledOpen++;
    }
    expect(scheduledOpen).toBe(dur);
    expect(scheduledOpen / s.period).toBe(Math.round(s.period * s.openRatio) / s.period);
    expect(scheduledOpen / s.period).toBeGreaterThanOrEqual(cfg.doorMinOpenRatio - 0.5 / s.period);

    // Simulated shape. A close that would leave less than a full warning before the
    // reopen is skipped (only adds open time); otherwise the run equals the schedule.
    let simOpen = 0;
    for (let t = 0; t < s.period; t++) if (history[t]![i]!.open) simOpen++;
    expect(simOpen).toBeGreaterThanOrEqual(scheduledOpen);
    if (s.period - dur >= WARN) {
      expect(simOpen).toBe(scheduledOpen);
      for (let t = 0; t + s.period < history.length; t++) {
        if (history[t + s.period]![i]!.open !== history[t]![i]!.open) {
          throw new Error(`simulated door ${i} not periodic at tick ${t}`);
        }
      }
    }
  });

  expectWarned(log, exemptUntil);
}

describe('Property 10: Door schedule shape', () => {
  it('Feature: kirobit-halloween-maze, Property 10: Door schedule shape (random specs)', () => {
    const specArb = fc.record({
      cell: fc.record({ x: fc.integer({ min: 1, max: 9 }), y: fc.integer({ min: 1, max: 9 }) }),
      phaseOffset: fc.integer({ min: 0, max: 959 }),
      period: fc.integer({ min: cfg.doorPeriod.min, max: cfg.doorPeriod.max }),
      openRatio: fc.double({ min: cfg.doorMinOpenRatio, max: 0.95, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(specArb, { minLength: 1, maxLength: 4 }), (specs) => {
        // Random phases may put a change inside the initial warn window, which has no earlier Tick.
        checkShape(specs, WARN);
      }),
      { numRuns: 60 },
    );
  }, 60000);

  it('Feature: kirobit-halloween-maze, Property 10: Door schedule shape (carved mazes, placeDoors)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.integer({ min: 1, max: 30 }),
        (seed, level) => {
          const carved = carveMaze(seed, level, 0, cfg);
          const placed = placeDoors(carved, seed, level, 0, cfg);
          fc.pre(placed.doors.length > 0);
          checkShape(placed.doors, 0);
          // No change inside the initial warn window.
          const { log } = simulate(placed.doors, WARN + 1);
          for (const { tick, ev } of log) {
            if (ev.t === 'DoorChanged') expect(tick).toBeGreaterThan(WARN);
          }
          for (const d of placed.doors) {
            expect(scheduleAt(d, 0).nextChangeIn).toBeGreaterThan(WARN);
          }
        },
      ),
      { numRuns: 40 },
    );
  }, 60000);

  it('example: every Door emits DoorWarning at least 30 Ticks before DoorChanged', () => {
    const specs: DoorSpec[] = [
      { cell: { x: 3, y: 3 }, phaseOffset: 0, period: 300, openRatio: 0.6 },
      { cell: { x: 5, y: 5 }, phaseOffset: 100, period: 240, openRatio: 0.5 },
    ];
    const { log } = simulate(specs, 1500);
    const changed = log.filter((l) => l.ev.t === 'DoorChanged');
    expect(changed.length).toBeGreaterThan(6);
    expect(cfg.doorWarnTicks).toBeGreaterThanOrEqual(30);
    for (const c of changed) {
      if (c.ev.t !== 'DoorChanged') continue;
      const door = c.ev.doorIndex;
      const open = c.ev.open;
      const earlier = log.filter(
        (l) => l.ev.t === 'DoorWarning' && l.ev.doorIndex === door && l.ev.open === open && l.tick <= c.tick - 30,
      );
      if (c.tick > 30) expect(earlier.length).toBeGreaterThan(0);
    }
  });
});

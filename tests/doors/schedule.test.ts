import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import type { Cell, DoorSpec, DoorState } from '../../src/core/types';
import {
  initDoors,
  openDuration,
  stepDoors,
  type CloseGate,
  type DoorOccupants,
} from '../../src/core/doors';

const cfg = DEFAULT_CONFIG;
const WARN = cfg.doorWarnTicks;
const DOOR_CELL: Cell = { x: 5, y: 5 };
const FAR: Cell = { x: 1, y: 1 };

const spec = (over: Partial<DoorSpec> = {}): DoorSpec => ({
  cell: DOOR_CELL,
  phaseOffset: 0,
  period: 300,
  openRatio: 0.6,
  ...over,
});

const away = (): DoorOccupants => ({
  player: { cell: FAR, next: null },
  hunter: { cell: { x: 9, y: 9 }, next: null },
});

interface Logged {
  tick: number;
  ev: GameEvent;
}

function run(
  specs: DoorSpec[],
  ticks: number,
  occ: (tick: number) => DoorOccupants = away,
  gates: readonly CloseGate[] = [],
): { log: Logged[]; doors: DoorState[][] } {
  let doors = initDoors(specs, 0, cfg);
  const log: Logged[] = [];
  const history: DoorState[][] = [doors];
  for (let t = 1; t <= ticks; t++) {
    const r = stepDoors(specs, doors, t, occ(t), cfg, gates);
    doors = r.doors;
    history.push(doors);
    for (const ev of r.events) log.push({ tick: t, ev });
  }
  return { log, doors: history };
}

const changes = (log: Logged[], kind: 'DoorChanged' | 'DoorWarning'): Logged[] =>
  log.filter((l) => l.ev.t === kind);

describe('door schedule', () => {
  it('follows period, phaseOffset and openRatio', () => {
    const s = spec({ period: 300, openRatio: 0.6, phaseOffset: 20 });
    const dur = openDuration(s); // 180
    expect(dur).toBe(180);
    const { doors } = run([s], 700);
    for (let t = 0; t <= 700; t++) {
      const phase = (t + 20) % 300;
      expect(doors[t]![0]!.open).toBe(phase < dur);
    }
  });

  it('emits DoorChanged on each boundary with the new state', () => {
    const { log } = run([spec({ phaseOffset: 0 })], 600);
    const ch = changes(log, 'DoorChanged');
    expect(ch.map((c) => [c.tick, (c.ev as { open: boolean }).open])).toEqual([
      [180, false],
      [300, true],
      [480, false],
      [600, true],
    ]);
  });

  it('emits DoorWarning at least doorWarnTicks before every DoorChanged', () => {
    const { log } = run([spec()], 1500);
    const ch = changes(log, 'DoorChanged');
    const wr = changes(log, 'DoorWarning');
    expect(ch.length).toBeGreaterThan(3);
    for (const c of ch) {
      const w = wr.filter((x) => x.tick <= c.tick - WARN && (x.ev as { open: boolean }).open === (c.ev as { open: boolean }).open);
      expect(w.length).toBeGreaterThan(0);
    }
    expect(WARN).toBeGreaterThanOrEqual(30);
  });

  it('exposes warning intensity and nextChangeIn', () => {
    const { doors } = run([spec()], 200);
    expect(doors[100]![0]!.warning).toBe(0);
    expect(doors[100]![0]!.nextChangeIn).toBe(80);
    expect(doors[179]![0]!.nextChangeIn).toBe(1);
    expect(doors[179]![0]!.warning).toBe(1);
    expect(doors[140]![0]!.warning).toBeGreaterThan(0);
  });
});

describe('door occupancy gate', () => {
  const closeTick = 180;
  const onDoor = (leaveAfter: number, who: 'player' | 'hunter', mode: 'on' | 'entering') =>
    (t: number): DoorOccupants => {
      const o = away();
      if (t <= leaveAfter) {
        o[who] = mode === 'on' ? { cell: DOOR_CELL, next: null } : { cell: FAR, next: DOOR_CELL };
      }
      return o;
    };

  for (const who of ['player', 'hunter'] as const) {
    for (const mode of ['on', 'entering'] as const) {
      it(`postpones a close while the ${who} is ${mode} the Door, then closes after they leave`, () => {
        const { log, doors } = run([spec()], 400, onDoor(250, who, mode));
        const ch = changes(log, 'DoorChanged').filter((c) => !(c.ev as { open: boolean }).open);
        expect(ch[0]!.tick).toBe(251);
        expect(doors[closeTick]![0]!.open).toBe(true);
        expect(doors[closeTick]![0]!.postponed).toBe(true);
        expect(doors[251]![0]!.open).toBe(false);
        expect(doors[251]![0]!.postponed).toBe(false);
      });
    }
  }

  it('does not close at all if the schedule reopens before the character leaves', () => {
    const { log } = run([spec()], 320, onDoor(310, 'player', 'on'));
    expect(changes(log, 'DoorChanged').filter((c) => !(c.ev as { open: boolean }).open)).toHaveLength(0);
  });

  it('is not blocked by allies: only player and hunter occupants are considered', () => {
    // Allies are not part of DoorOccupants, so an ally standing on the Door Cell is invisible to the gate.
    const { log } = run([spec()], 200, away);
    expect(changes(log, 'DoorChanged')[0]!.tick).toBe(180);
  });

  it('runs extra gates (extension point) after the occupancy gate', () => {
    const deny: CloseGate = () => false;
    const { log } = run([spec()], 250, away, [deny]);
    expect(changes(log, 'DoorChanged')).toHaveLength(0);
  });
});

describe('door determinism property', () => {
  const specArb = fc.record({
    cell: fc.record({ x: fc.integer({ min: 1, max: 9 }), y: fc.integer({ min: 1, max: 9 }) }),
    phaseOffset: fc.integer({ min: 0, max: 479 }),
    period: fc.integer({ min: cfg.doorPeriod.min, max: cfg.doorPeriod.max }),
    openRatio: fc.double({ min: cfg.doorMinOpenRatio, max: 0.8, noNaN: true }),
  });
  const occArb = fc.array(
    fc.record({
      pc: fc.integer({ min: 0, max: 99 }),
      hc: fc.integer({ min: 0, max: 99 }),
    }),
    { minLength: 1, maxLength: 40 },
  );

  it('identical inputs give identical event sequences; warning precedes change by >= doorWarnTicks', () => {
    fc.assert(
      fc.property(fc.array(specArb, { minLength: 1, maxLength: 4 }), occArb, (specs, occs) => {
        const occ = (t: number): DoorOccupants => {
          const o = occs[Math.floor(t / 30) % occs.length]!;
          const pick = (n: number): Cell => ({ x: 1 + (n % 9), y: 1 + Math.floor(n / 10) % 9 });
          return { player: { cell: pick(o.pc), next: null }, hunter: { cell: pick(o.hc), next: null } };
        };
        const a = run(specs, 1500, occ);
        const b = run(specs, 1500, occ);
        expect(b.log).toEqual(a.log);

        // Warning precedes every change, except a Door's first change when the Door already
        // started inside its warn window: initDoors emits no events, the warning is only in the
        // state (`warning > 0`), and an occupancy postponement may push that change past WARN.
        const lastWarn = new Map<string, number>();
        const startedInWindow = a.doors[0]!.map((d) => d.warning > 0);
        const changedBefore = new Set<number>();
        for (const { tick, ev } of a.log) {
          if (ev.t === 'DoorWarning') lastWarn.set(`${ev.doorIndex}:${ev.open}`, tick);
          if (ev.t === 'DoorChanged') {
            const first = !changedBefore.has(ev.doorIndex);
            changedBefore.add(ev.doorIndex);
            if (tick <= WARN) continue;
            const w = lastWarn.get(`${ev.doorIndex}:${ev.open}`);
            const initialExempt = w === undefined && first && (tick <= WARN + 1 || startedInWindow[ev.doorIndex]!);
            if (!initialExempt) {
              expect(w).toBeDefined();
              expect(tick - w!).toBeGreaterThanOrEqual(WARN);
            }
          }
        }
        // Open ratio never drops below the schedule's (postponing only adds open time).
        for (let i = 0; i < specs.length; i++) {
          const open = a.doors.filter((d) => d[i]!.open).length / a.doors.length;
          expect(open).toBeGreaterThanOrEqual(specs[i]!.openRatio - 0.1);
        }
      }),
      {
        numRuns: 100,
        // Regression: Door 0 starts inside its warn window and its first close is postponed
        // by the Player standing on it (occupant code 29 = Cell (3,3)) until after WARN.
        examples: [
          [
            [
              { cell: { x: 3, y: 3 }, phaseOffset: 80, period: 240, openRatio: 0.5 },
              { cell: { x: 1, y: 1 }, phaseOffset: 0, period: 240, openRatio: 0.5 },
            ],
            [{ pc: 0, hc: 0 }, { pc: 29, hc: 0 }, { pc: 0, hc: 0 }],
          ],
        ],
      },
    );
  });
});

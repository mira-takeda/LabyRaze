import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { Cell, DoorSpec, WallLayer } from '../../src/core/types';
import { Tile } from '../../src/core/types';
import {
  createReachabilityGate,
  initDoors,
  openDuration,
  rebuildDerived,
  stepDoors,
  type DoorOccupants,
} from '../../src/core/doors';

const cfg = DEFAULT_CONFIG;
const MAX = cfg.maxDisconnectTicks;
const W = 7;
const H = 5;
const nav = { width: W, height: H, wrapPairs: [] as Array<[Cell, Cell]> };

/** Corridor y=1 from x=1..5 with a Door at (3,1). Optional bypass along y=3. */
function fixture(bypass: boolean): WallLayer {
  const tiles = new Uint8Array(W * H).fill(Tile.WallHard);
  for (let x = 1; x <= 5; x++) tiles[1 * W + x] = Tile.Floor;
  tiles[1 * W + 3] = Tile.Door;
  if (bypass) {
    for (let x = 1; x <= 5; x++) tiles[3 * W + x] = Tile.Floor;
    tiles[2 * W + 1] = Tile.Floor;
    tiles[2 * W + 5] = Tile.Floor;
  }
  return { tiles, version: 0, destroyed: 0 };
}

const KEY: Cell = { x: 1, y: 1 };
const CAGE: Cell = { x: 5, y: 1 };
const objectives = [KEY, CAGE];
const doorSpec = (over: Partial<DoorSpec> = {}): DoorSpec => ({
  cell: { x: 3, y: 1 },
  phaseOffset: 0,
  period: 300,
  openRatio: 0.6,
  ...over,
});
const occ: DoorOccupants = {
  player: { cell: KEY, next: null },
  hunter: { cell: { x: 2, y: 1 }, next: null },
};

/** Runs stepDoors on the Tick the Door is first scheduled to close. */
function closeTick(spec: DoorSpec, gateFor: (specs: DoorSpec[]) => ReturnType<typeof createReachabilityGate>) {
  const specs = [spec];
  const dur = openDuration(spec);
  const before = initDoors(specs, dur - 1, cfg);
  return stepDoors(specs, before, dur, occ, cfg, [gateFor(specs)]);
}

describe('connectivity and restore tables', () => {
  it('splits objectives while the Door is closed and joins them when open', () => {
    const t = rebuildDerived(fixture(false), [doorSpec()], nav, objectives);
    expect(t.connectivity).toEqual([2, 1]);
    expect(t.fieldVersion).toBe(0);
    expect(t.labels[1]![1 * W + 1]).toBe(t.labels[1]![1 * W + 5]);
    expect(t.labels[0]![1 * W + 1]).not.toBe(t.labels[0]![1 * W + 5]);
    expect(t.labels[0]![1 * W + 3]).toBe(-1);
  });

  it('restoreTicks is the Door closed length when closed, 0 when connected', () => {
    const spec = doorSpec();
    const t = rebuildDerived(fixture(false), [spec], nav, objectives);
    expect(t.restoreTicks).toEqual([spec.period - openDuration(spec), 0]);
  });

  it('a bypass keeps every mask connected', () => {
    const t = rebuildDerived(fixture(true), [doorSpec()], nav, objectives);
    expect(t.connectivity).toEqual([1, 1]);
    expect(t.restoreTicks).toEqual([0, 0]);
  });

  it('rebuildDerived after wall removal reconnects and bumps the version', () => {
    const before = fixture(false);
    const t0 = rebuildDerived(before, [doorSpec()], nav, objectives);
    expect(t0.connectivity[0]).toBe(2);
    const tiles = before.tiles.slice();
    for (let x = 1; x <= 5; x++) tiles[3 * W + x] = Tile.Floor;
    tiles[2 * W + 1] = Tile.Floor;
    tiles[2 * W + 5] = Tile.Floor;
    const after: WallLayer = { tiles, version: 1, destroyed: 7 };
    const t1 = rebuildDerived(after, [doorSpec()], nav, objectives);
    expect(t1.connectivity).toEqual([1, 1]);
    expect(t1.restoreTicks[0]).toBe(0);
    expect(t1.fieldVersion).toBe(1);
    expect(before.tiles[3 * W + 2]).toBe(Tile.WallHard); // input untouched
  });
});

describe('reachability close gate', () => {
  const make = (bypass: boolean) => (specs: DoorSpec[]) =>
    createReachabilityGate(rebuildDerived(fixture(bypass), specs, nav, objectives), specs, nav, objectives, MAX);

  it('postpones a close that would cut the player off from the cage for too long', () => {
    const spec = doorSpec({ period: 480, openRatio: 0.5 }); // closed 240 > 180
    const r = closeTick(spec, make(false));
    expect(r.doors[0]!.open).toBe(true);
    expect(r.doors[0]!.postponed).toBe(true);
    expect(r.events.some((e) => e.t === 'DoorChanged')).toBe(false);
  });

  it('allows a short disconnection within maxDisconnectTicks', () => {
    const spec = doorSpec({ period: 300, openRatio: 0.6 }); // closed 120 <= 180
    const r = closeTick(spec, make(false));
    expect(r.doors[0]!.open).toBe(false);
    expect(r.doors[0]!.postponed).toBe(false);
  });

  it('allows a harmless close when a bypass exists', () => {
    const spec = doorSpec({ period: 480, openRatio: 0.5 });
    const r = closeTick(spec, make(true));
    expect(r.doors[0]!.open).toBe(false);
  });

  it('is deterministic', () => {
    const spec = doorSpec({ period: 480, openRatio: 0.5 });
    expect(closeTick(spec, make(false))).toEqual(closeTick(spec, make(false)));
  });
});

describe('monotonicity under wall removal', () => {
  const SW = 6;
  const SH = 6;
  const snav = { width: SW, height: SH, wrapPairs: [] as Array<[Cell, Cell]> };
  const specs: DoorSpec[] = [
    { cell: { x: 2, y: 2 }, phaseOffset: 0, period: 300, openRatio: 0.6 },
    { cell: { x: 3, y: 3 }, phaseOffset: 10, period: 300, openRatio: 0.6 },
  ];
  const objs: Cell[] = [
    { x: 1, y: 1 },
    { x: 4, y: 4 },
    { x: 1, y: 4 },
  ];
  const fixed = new Set<number>([...specs.map((s) => s.cell.y * SW + s.cell.x), ...objs.map((o) => o.y * SW + o.x)]);

  it('removing walls never lowers connectivity for any doorMask', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: SW * SH, maxLength: SW * SH }),
        fc.array(fc.boolean(), { minLength: SW * SH, maxLength: SW * SH }),
        (isWall, removed) => {
          const tiles = new Uint8Array(SW * SH);
          for (let i = 0; i < tiles.length; i++) tiles[i] = isWall[i] ? Tile.Wall : Tile.Floor;
          for (const s of specs) tiles[s.cell.y * SW + s.cell.x] = Tile.Door;
          for (const o of objs) tiles[o.y * SW + o.x] = Tile.Floor;
          const fewer = tiles.slice();
          for (let i = 0; i < fewer.length; i++) {
            if (!fixed.has(i) && removed[i] && fewer[i] === Tile.Wall) fewer[i] = Tile.Floor;
          }
          const a = rebuildDerived({ tiles, version: 0, destroyed: 0 }, specs, snav, objs);
          const b = rebuildDerived({ tiles: fewer, version: 1, destroyed: 1 }, specs, snav, objs);
          for (let m = 0; m < a.connectivity.length; m++) {
            expect(b.connectivity[m]!).toBeLessThanOrEqual(a.connectivity[m]!);
            expect(b.restoreTicks[m]!).toBeLessThanOrEqual(a.restoreTicks[m]!);
            // Cells sharing a component before still share one after.
            const la = a.labels[m]!;
            const lb = b.labels[m]!;
            const rep = new Map<number, number>();
            for (let i = 0; i < la.length; i++) {
              if (la[i]! < 0) continue;
              expect(lb[i]!).toBeGreaterThanOrEqual(0);
              const seen = rep.get(la[i]!);
              if (seen === undefined) rep.set(la[i]!, lb[i]!);
              else expect(lb[i]).toBe(seen);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

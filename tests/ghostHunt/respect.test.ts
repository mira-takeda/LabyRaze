// Feature: kirobit-halloween-maze, Property 39: Allies respect the Maze and never harm the Player
// **Validates: Requirements 29.4, 29.5, 29.8, 29.12**
import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { detonate } from '../../src/core/bombs';
import { emptyGhostHunt, stepGhostHunt } from '../../src/core/ghostHunt';
import type { GhostHuntCommand } from '../../src/core/ghostHunt';
import { isPassable } from '../../src/core/grid';
import { carveMaze } from '../../src/core/maze/carve';
import { placeDoors } from '../../src/core/maze/doorPlacement';
import { Tile } from '../../src/core/types';
import type { Cell, DoorSpec, GhostHuntState, GhostHuntView, WallLayer } from '../../src/core/types';
import { allFixtureMazes, makeCharacter, makeDerived, mazeFromAscii } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;

interface World {
  name: string;
  width: number;
  height: number;
  tiles: Uint8Array;
  doors: DoorSpec[];
  cage: { interior: Cell[]; entrance: Cell };
}

function carvedWorld(seed: number): World {
  const c = { ...cfg, mazeSize: { w: 21, h: 21 } };
  const carved = carveMaze(seed, 1, 0, c);
  const placed = placeDoors(carved, seed, 1, 0, c);
  return { name: `carved${seed}`, width: carved.width, height: carved.height, tiles: placed.tiles, doors: placed.doors, cage: carved.cage };
}

// The corridor fixture has no Cage (its entrance is a placeholder Wall cell), so Ghost Hunt cannot start there.
const fixtureWorlds: World[] = allFixtureMazes().filter((m) => m.cage.interior.length > 0).map((m, i) => ({
  name: `fixture${i}`,
  width: m.width,
  height: m.height,
  tiles: m.tiles,
  doors: m.doors,
  cage: m.cage,
}));

/** Cells an ally may walk on at all: not Wall, WallHard (Doors judged by mask). */
function floorsOf(w: World): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === Tile.Floor) out.push({ x: i % w.width, y: Math.floor(i / w.width) });
  return out;
}

interface Segment {
  ticks: number;
  mask: number; // raw bits; reduced to the door count
  bomb: number | null; // floor pick index, detonates at the segment start
  pickup: boolean;
  rescued: [boolean, boolean, boolean];
  hunterPick: number;
  hunterDead: boolean;
}

const arbSegment: fc.Arbitrary<Segment> = fc.record({
  ticks: fc.integer({ min: 1, max: 60 }),
  mask: fc.integer({ min: 0, max: 255 }),
  bomb: fc.option(fc.nat({ max: 100000 }), { nil: null, freq: 3 }),
  pickup: fc.boolean(),
  rescued: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
  hunterPick: fc.nat({ max: 100000 }),
  hunterDead: fc.boolean(),
});

const arbPlan = fc.array(arbSegment, { minLength: 1, maxLength: 8 });

const isWalkMode = (m: string): boolean => m === 'hunting' || m === 'returning';
const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

interface Trace {
  gh: GhostHuntState;
  walls: WallLayer;
  mask: number;
  view: GhostHuntView;
}

function simulate(w: World, plan: Segment[]): { trace: Trace[]; outputs: unknown[]; viewsUnchanged: boolean } {
  const floors = floorsOf(w);
  const doorMaskAll = (1 << w.doors.length) - 1;
  let walls: WallLayer = { tiles: w.tiles.slice(), version: 0, destroyed: 0 };
  let gh = emptyGhostHunt(w.cage.entrance);
  const hunterStart = floors[0]!;
  const trace: Trace[] = [];
  const outputs: unknown[] = [];
  let viewsUnchanged = true;

  for (const seg of plan) {
    const mask = seg.mask & doorMaskAll;
    const playerCell = floors[seg.bomb === null ? 0 : seg.bomb % floors.length]!;
    if (seg.bomb !== null) {
      walls = detonate(walls, w.width, w.height, { cell: playerCell, next: null, progress: 0 }, cfg.bombRadius).walls;
    }
    const hunterCell = floors[seg.hunterPick % floors.length]!;
    const view: GhostHuntView = {
      walls,
      doors: w.doors.map((_, index) => ({ index, open: true, nextChangeIn: 120, warning: 0, postponed: false })),
      derived: { ...makeDerived(w.doors.length), doorMask: mask },
      hunter: makeCharacter('hunter', hunterCell, seg.hunterDead ? { respawnIn: 100000 } : {}),
      playerCell,
      cage: w.cage,
      tick: 0,
      nav: { width: w.width, height: w.height, doors: w.doors, wrapPairs: [] },
      hunterStart,
      rescued: seg.rescued,
    };
    const snapshot = structuredClone(view);
    for (let t = 0; t < seg.ticks; t++) {
      const cmd: GhostHuntCommand = t === 0 && seg.pickup ? { pickup: true } : {};
      const r = stepGhostHunt(gh, view, cfg, cmd);
      gh = r.gh;
      outputs.push(r);
      trace.push({ gh, walls, mask, view });
    }
    if (JSON.stringify(Object.keys(view)) !== JSON.stringify(Object.keys(snapshot))) viewsUnchanged = false;
    try {
      expect(view).toEqual(snapshot);
    } catch {
      viewsUnchanged = false;
    }
  }
  return { trace, outputs, viewsUnchanged };
}

function checkRespect(w: World, plan: Segment[]): void {
  const { trace, outputs, viewsUnchanged } = simulate(w, plan);
  let prev: GhostHuntState = emptyGhostHunt(w.cage.entrance);
  for (const step of trace) {
    const { gh, walls, mask } = step;
    gh.allies.forEach((a, i) => {
      const p = prev.allies[i]!;
      const pass = (c: Cell): boolean => isPassable(walls.tiles, w.width, w.height, w.doors, mask, c.x, c.y);
      // Hard terrain: an ally never stands in a Wall or WallHard (no wall-phasing), whatever its mode.
      const tile = walls.tiles[a.cell.y * w.width + a.cell.x]!;
      expect(tile === Tile.Wall || tile === Tile.WallHard).toBe(false);
      if (a.next) {
        const nt = walls.tiles[a.next.y * w.width + a.next.x]!;
        expect(nt === Tile.Wall || nt === Tile.WallHard).toBe(false);
        // The committed step is to a 4-neighbour (no wraps in these mazes).
        expect(Math.abs(a.next.x - a.cell.x) + Math.abs(a.next.y - a.cell.y)).toBe(1);
      }
      if (isWalkMode(p.mode) && p.mode === a.mode) {
        // At most one cell boundary per step.
        expect(Math.abs(a.cell.x - p.cell.x) + Math.abs(a.cell.y - p.cell.y)).toBeLessThanOrEqual(1);
        // Entering a Cell (arrival, or committing to the next one) only on a Cell passable under the current Door state.
        if (!sameCell(a.cell, p.cell)) expect(pass(a.cell)).toBe(true);
        if (a.next && !(p.next && sameCell(p.next, a.next))) expect(pass(a.next)).toBe(true);
      }
    });
    prev = gh;
  }
  // Allies never harm the Player: the outputs carry no player-affecting field, only ally state, events, catches.
  for (const r of outputs as Array<{ gh: unknown; events: Array<{ t: string }>; catches: unknown[] }>) {
    expect(Object.keys(r).sort()).toEqual(['catches', 'events', 'gh']);
    for (const e of r.events) expect(['GhostHuntStarted', 'GhostHuntEnded']).toContain(e.t);
  }
  expect(viewsUnchanged).toBe(true);
}

function stripViews(out: ReturnType<typeof simulate>): unknown {
  return { gh: out.trace.map((t) => t.gh), outputs: out.outputs };
}

// Multi-tick simulations on carved mazes are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Property 39: allies respect the Maze and never harm the Player', () => {
  it('on carved + placeDoors 21x21 mazes with changing Door masks and mid-hunt Bombs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), arbPlan, (seed, plan) => {
        checkRespect(carvedWorld(seed), plan);
      }),
      { numRuns: 25 },
    );
  });

  it('on the hand-built fixtures with changing Door masks and Bombs', () => {
    fc.assert(
      fc.property(fc.constantFrom(...fixtureWorlds), arbPlan, (w, plan) => {
        checkRespect(w, plan);
      }),
      { numRuns: 40 },
    );
  });

  it('is deterministic: the same inputs give identical allies, events and catches', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), arbPlan, (seed, plan) => {
        const w = carvedWorld(seed);
        expect(stripViews(simulate(w, plan))).toEqual(stripViews(simulate(w, plan)));
      }),
      { numRuns: 10 },
    );
  });
});

describe('allies use destroyed walls as passable', () => {
  const m = mazeFromAscii(['HHHHHHH', 'H.#.U.H', 'HHHHHHH']);
  const w: World = { name: 'sealed', width: m.width, height: m.height, tiles: m.tiles, doors: [], cage: { interior: [], entrance: { x: 1, y: 1 } } };
  const run = (walls: WallLayer): { reached: boolean; entered: Cell[] } => {
    let gh: GhostHuntState = stepGhostHunt(emptyGhostHunt(w.cage.entrance), mkView(walls), cfg, { pickup: true }).gh;
    const entered: Cell[] = [];
    let reached = false;
    for (let i = 0; i < 300; i++) {
      const r = stepGhostHunt(gh, mkView(walls), cfg);
      gh = r.gh;
      if (r.catches.length > 0) reached = true;
      for (const a of gh.allies) entered.push(a.cell);
    }
    return { reached, entered };
  };
  const mkView = (walls: WallLayer): GhostHuntView => ({
    walls,
    doors: [],
    derived: makeDerived(0),
    hunter: makeCharacter('hunter', m.hunterStart),
    playerCell: m.playerStart,
    cage: w.cage,
    tick: 0,
    nav: { width: w.width, height: w.height, doors: [], wrapPairs: [] },
    hunterStart: m.hunterStart,
    rescued: [false, false, false],
  });

  it('cannot cross an intact Wall', () => {
    const r = run({ tiles: w.tiles.slice(), version: 0, destroyed: 0 });
    expect(r.reached).toBe(false);
    expect(r.entered.some((c) => c.x >= 2)).toBe(false);
  });

  it('crosses a Wall once a real detonation turned it into Floor', () => {
    const d = detonate({ tiles: w.tiles.slice(), version: 0, destroyed: 0 }, w.width, w.height, { cell: { x: 2, y: 1 }, next: null, progress: 0 }, 0.6);
    expect(d.destroyed).toEqual([{ x: 2, y: 1 }]);
    expect(d.walls.tiles[1 * w.width + 2]).toBe(Tile.Floor);
    const r = run(d.walls);
    expect(r.reached).toBe(true);
    expect(r.entered.some((c) => c.x === 2 && c.y === 1)).toBe(true);
  });
});

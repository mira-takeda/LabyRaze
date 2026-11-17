// Feature: kirobit-halloween-maze, Property 13: Hunter routes respect current Doors
// **Validates: Requirements 5.8, 8.1, 8.7**
//
// Multi-tick simulations: the Hunter's decision is fed into stepMovement while Doors change on
// schedule and Bombs occasionally destroy walls next to it.

import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG, CELL_UNITS } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { detonate } from '../../src/core/bombs';
import { initDoors, openMask, stepDoors } from '../../src/core/doors';
import type { GameEvent } from '../../src/core/events';
import { dirDx, dirDy, isPassable } from '../../src/core/grid';
import { createHunterBrain, decideHunter, notifyHunterEvents } from '../../src/core/hunter';
import { carveMaze } from '../../src/core/maze/carve';
import { placeDoors } from '../../src/core/maze/doorPlacement';
import { stepMovement } from '../../src/core/movement';
import { computeDistanceField, lookaheadDoorMask, UNREACHABLE } from '../../src/core/pathfinding';
import { Floor, ItemKind, Tile } from '../../src/core/types';
import type { Cell, GameState, ItemKindCode, Maze } from '../../src/core/types';
import { buildState, cageMaze, makeCharacter, makeItems } from '../helpers/fixtures';

// Multi-tick simulations on 21x21 mazes are slow by design.
vi.setConfig({ testTimeout: 300_000 });

const CFG: GameConfig = DEFAULT_CONFIG;
const UNITS = CFG.baseUnitsPerTick;
const TICKS_PER_CELL = Math.ceil(CELL_UNITS / UNITS);

function isPellet(k: number): boolean {
  return k === ItemKind.Ordinary || k === ItemKind.Power || k === ItemKind.Speed;
}

/** Carved 21x21 maze with Doors and no pre-placed items. */
function carvedMaze(seed: number, level: number): Maze {
  const carved = carveMaze(seed, level, 0, CFG);
  const placed = placeDoors(carved, seed, level, 0, CFG);
  const floors: Cell[] = [];
  for (let y = 0; y < carved.height; y++) {
    for (let x = 0; x < carved.width; x++) {
      if (placed.tiles[y * carved.width + x] === Tile.Floor) floors.push({ x, y });
    }
  }
  return {
    width: carved.width,
    height: carved.height,
    tiles: placed.tiles,
    doors: placed.doors,
    wrapPairs: [],
    playerStart: floors[0]!,
    hunterStart: floors[floors.length - 1]!,
    cage: carved.cage,
    keys: [],
    ordinary: [],
    power: [],
    speed: [],
    bombs: [],
    ghostHunt: [],
    wisps: [],
    generation: { attempts: 1, repairs: 0 },
  };
}

function floorCells(maze: Maze): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) if (maze.tiles[y * maze.width + x] === Tile.Floor) out.push({ x, y });
  }
  return out;
}

interface Scenario {
  maze: Maze;
  seed: number;
  ticks: number;
  hunterPick: number;
  playerPick: number;
  pellets: Array<{ pick: number; kind: ItemKindCode }>;
  blastTicks: ReadonlySet<number>;
  staticDoors: boolean;
}

interface SimResult {
  violations: string[];
  trace: string[];
  collectTicks: number[];
  reachablePellets: number;
  checkedAfterDoorChange: number;
  checkedAfterBlast: number;
  decisionsWithTarget: number;
}

function simulate(sc: Scenario): SimResult {
  const { maze } = sc;
  const w = maze.width;
  const floors = floorCells(maze);
  const hStart = floors[sc.hunterPick % floors.length]!;
  const pCell = floors[sc.playerPick % floors.length]!;

  let state: GameState = buildState(maze, {
    runSeed: sc.seed,
    over: { hunter: makeCharacter('hunter', hStart), player: makeCharacter('player', pCell) },
  });
  const kinds = new Uint8Array(maze.width * maze.height);
  for (const p of sc.pellets) {
    const c = floors[p.pick % floors.length]!;
    if (c.x === hStart.x && c.y === hStart.y) continue;
    kinds[c.y * w + c.x] = p.kind;
  }
  const doors = initDoors(maze.doors, 0, CFG);
  state = {
    ...state,
    doors,
    items: { ...makeItems(maze), kinds },
    derived: { ...state.derived, doorMask: openMask(doors) },
  };

  // Pellets reachable once every Door is open (walls only ever disappear).
  const allOpen = (1 << maze.doors.length) - 1;
  const f0 = computeDistanceField(maze, state.walls.tiles, allOpen, 0, [hStart.y * w + hStart.x]);
  let reachablePellets = 0;
  for (let i = 0; i < kinds.length; i++) if (isPellet(kinds[i]!) && f0.dist[i] !== UNREACHABLE) reachablePellets++;

  const res: SimResult = {
    violations: [],
    trace: [],
    collectTicks: [],
    reachablePellets,
    checkedAfterDoorChange: 0,
    checkedAfterBlast: 0,
    decisionsWithTarget: 0,
  };
  const bad = (t: number, msg: string): void => {
    if (res.violations.length < 5) res.violations.push(`tick ${t}: ${msg}`);
  };

  let brain = createHunterBrain(sc.seed, 1);
  let remaining = 0;
  for (let i = 0; i < kinds.length; i++) if (isPellet(kinds[i]!)) remaining++;
  for (let t = 1; t <= sc.ticks; t++) {
    if (remaining === 0) break;
    const events: GameEvent[] = [];
    let { walls, doors: ds } = state;
    if (!sc.staticDoors) {
      const r = stepDoors(maze.doors, ds, t, { player: state.player, hunter: state.hunter }, CFG);
      ds = r.doors;
      events.push(...r.events);
    }
    let blasted = false;
    if (sc.blastTicks.has(t)) {
      const det = detonate(walls, w, maze.height, { cell: state.hunter.cell, next: null, progress: 0 }, CFG.bombRadius);
      if (det.destroyed.length > 0) {
        walls = det.walls;
        events.push({ t: 'WallsDestroyed', cells: det.destroyed });
        blasted = true;
      }
    }
    state = { ...state, tick: t, walls, doors: ds, derived: { ...state.derived, doorMask: openMask(ds) } };
    const doorChanged = events.some((e) => e.t === 'DoorChanged');

    brain = notifyHunterEvents(brain, events);
    if (doorChanged || blasted) {
      if (brain.target !== -1) bad(t, 'commitment kept after DoorChanged/WallsDestroyed');
    }
    const d = decideHunter(state, brain, CFG);
    brain = d.brain;

    // Route validity under the current Doors and walls.
    const here = state.hunter.cell;
    const mask = lookaheadDoorMask(state.derived.doorMask, state.doors, CFG.doorLookaheadTicks);
    if (d.dir !== null) {
      const nx = here.x + dirDx(d.dir);
      const ny = here.y + dirDy(d.dir);
      if (!isPassable(state.walls.tiles, w, maze.height, maze.doors, mask, nx, ny)) {
        bad(t, `decision steps into blocked cell ${nx},${ny}`);
      } else if (d.target !== null) {
        res.decisionsWithTarget++;
        const field = computeDistanceField(maze, state.walls.tiles, mask, state.walls.version, [d.target.y * w + d.target.x]);
        const dh = field.dist[here.y * w + here.x]!;
        const dn = field.dist[ny * w + nx]!;
        if (dh === UNREACHABLE || dn !== dh - 1) bad(t, `step not on a shortest path (here ${dh}, next ${dn})`);
        if (doorChanged) res.checkedAfterDoorChange++;
        if (blasted) res.checkedAfterBlast++;
      }
    }

    // Move.
    const env = {
      width: w,
      height: maze.height,
      tiles: state.walls.tiles,
      doors: maze.doors,
      doorMask: state.derived.doorMask,
      wrapPairs: maze.wrapPairs,
    };
    const hunter = stepMovement(state.hunter, d.dir, UNITS, env);
    state = { ...state, hunter };
    const open = (c: Cell): boolean => isPassable(state.walls.tiles, w, maze.height, maze.doors, state.derived.doorMask, c.x, c.y);
    if (!open(hunter.cell)) bad(t, `Hunter occupies blocked cell ${hunter.cell.x},${hunter.cell.y}`);
    if (hunter.next !== null && !open(hunter.next)) bad(t, `Hunter entering blocked cell ${hunter.next.x},${hunter.next.y}`);

    const idx = hunter.cell.y * w + hunter.cell.x;
    if (isPellet(state.items.kinds[idx]!)) {
      state.items.kinds[idx] = ItemKind.None;
      remaining--;
      res.collectTicks.push(t);
    }
    res.trace.push(`${t}:${hunter.cell.x},${hunter.cell.y},${hunter.next?.x ?? '-'},${hunter.next?.y ?? '-'},${d.dir ?? '-'},${d.target?.x ?? '-'}`);
  }
  return res;
}

const arbPellets = fc.array(
  fc.record({
    pick: fc.nat(),
    kind: fc.constantFrom<ItemKindCode>(
      ItemKind.Ordinary,
      ItemKind.Ordinary,
      ItemKind.Ordinary,
      ItemKind.Power,
      ItemKind.Speed,
      ItemKind.Bomb,
      ItemKind.Wisp,
    ),
  }),
  { minLength: 3, maxLength: 20 },
);

const arbBlasts = fc.uniqueArray(fc.integer({ min: 1, max: 1500 }), { maxLength: 4 });

const arbCarved = fc.record({
  seed: fc.integer({ min: 1, max: 100000 }),
  level: fc.integer({ min: 1, max: 20 }),
  hunterPick: fc.nat(),
  playerPick: fc.nat(),
  pellets: arbPellets,
  blasts: arbBlasts,
  staticDoors: fc.boolean(),
});

type CarvedArgs = typeof arbCarved extends fc.Arbitrary<infer T> ? T : never;

function carvedScenario(a: CarvedArgs, ticks: number): Scenario {
  return {
    maze: carvedMaze(a.seed, a.level),
    seed: a.seed,
    ticks,
    hunterPick: a.hunterPick,
    playerPick: a.playerPick,
    pellets: a.pellets,
    blastTicks: new Set(a.blasts),
    staticDoors: a.staticDoors,
  };
}

describe('Feature: kirobit-halloween-maze, Property 13: Hunter routes respect current Doors', () => {
  it('never occupies a wall or closed Door, and every step lies on a shortest path over the current Doors (carved 21x21)', () => {
    fc.assert(
      fc.property(arbCarved, (a) => {
        const r = simulate(carvedScenario(a, 900));
        expect(r.violations).toEqual([]);
      }),
      { numRuns: 10 },
    );
  });

  it('holds on fixture mazes with a Door that closes and reopens', () => {
    const maze = cageMaze();
    const tweaked: Maze = {
      ...maze,
      doors: maze.doors.map((d) => ({ ...d, period: 240, openRatio: 0.5, phaseOffset: 0 })),
    };
    fc.assert(
      fc.property(
        fc.record({
          seed: fc.integer({ min: 1, max: 100000 }),
          hunterPick: fc.nat(),
          playerPick: fc.nat(),
          pellets: arbPellets,
          blasts: arbBlasts,
        }),
        (a) => {
          const r = simulate({
            maze: tweaked,
            seed: a.seed,
            ticks: 800,
            hunterPick: a.hunterPick,
            playerPick: a.playerPick,
            pellets: a.pellets,
            blastTicks: new Set(a.blasts),
            staticDoors: false,
          });
          expect(r.violations).toEqual([]);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('checks the first decision after Door changes and explosions (not vacuous)', () => {
    let doorChecks = 0;
    let blastChecks = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const maze = carvedMaze(seed, 1 + (seed % 5));
      const pellets = Array.from({ length: 40 }, (_, i) => ({ pick: i * 37 + seed * 11, kind: ItemKind.Ordinary as ItemKindCode }));
      const r = simulate({
        maze,
        seed,
        ticks: 1800,
        hunterPick: seed * 7,
        playerPick: seed * 13,
        pellets,
        blastTicks: new Set([200, 700, 1200, 1700]),
        staticDoors: false,
      });
      expect(r.violations).toEqual([]);
      doorChecks += r.checkedAfterDoorChange;
      blastChecks += r.checkedAfterBlast;
    }
    expect(doorChecks).toBeGreaterThan(0);
    expect(blastChecks).toBeGreaterThan(0);
  });

  it('a wall destroyed on a corridor shortcut is used on the very next decision', () => {
    const maze = cageMaze();
    const w = maze.width;
    // Hunter in the top corridor, pellet directly below a wall segment at (2,2)/(2,4)...
    let state: GameState = buildState(maze, {
      over: { hunter: makeCharacter('hunter', { x: 1, y: 3 }), player: makeCharacter('player', { x: 9, y: 7 }) },
    });
    const kinds = new Uint8Array(w * maze.height);
    kinds[1 * w + 3] = ItemKind.Ordinary; // (3,1)
    state = { ...state, items: { ...state.items, kinds } };
    const before = decideHunter(state, createHunterBrain(1, 1), CFG);
    expect(before.target).toEqual({ x: 3, y: 1 });
    // Destroy wall (2,2): the route (1,3)->(1,2)->(1,1)->(2,1)->(3,1) is no longer the only one.
    const tiles = state.walls.tiles.slice();
    expect(tiles[2 * w + 2]).toBe(Tile.Wall);
    tiles[2 * w + 2] = Floor;
    const s1: GameState = { ...state, hunter: makeCharacter('hunter', { x: 2, y: 3 }), walls: { tiles, version: 1, destroyed: 1 } };
    const after = decideHunter(s1, notifyHunterEvents(before.brain, [{ t: 'WallsDestroyed', cells: [{ x: 2, y: 2 }] }]), CFG);
    expect(after.target).toEqual({ x: 3, y: 1 });
    expect(after.dir).toBe('up'); // (2,3)->(2,2)->(2,1)->(3,1), through the new gap
  });

  it('keeps collecting: consecutive pellets are reached within a bound proportional to the maze size', () => {
    const bound = TICKS_PER_CELL * 4 * (CFG.mazeSize.w + CFG.mazeSize.h) + 2 * CFG.doorPeriod.max;
    fc.assert(
      fc.property(arbCarved, (a) => {
        const sc = carvedScenario(a, 4000);
        const r = simulate(sc);
        expect(r.violations).toEqual([]);
        const expected = Math.min(r.reachablePellets, r.collectTicks.length);
        // Every reachable pellet is eventually taken (up to what the horizon allows)...
        let prev = 0;
        for (const t of r.collectTicks) {
          expect(t - prev).toBeLessThanOrEqual(bound);
          prev = t;
        }
        // ...and the Hunter is never starved while one remains: either all were taken or the
        // last gap up to the horizon is within the bound.
        if (r.collectTicks.length < r.reachablePellets) {
          expect(sc.ticks - prev).toBeLessThanOrEqual(bound);
        }
        expect(expected).toBeLessThanOrEqual(r.reachablePellets);
      }),
      { numRuns: 8 },
    );
  });

  it('is deterministic: identical scenarios give identical traces', () => {
    fc.assert(
      fc.property(arbCarved, (a) => {
        const r1 = simulate(carvedScenario(a, 500));
        const r2 = simulate(carvedScenario(a, 500));
        expect(r2.trace).toEqual(r1.trace);
        expect(r2.collectTicks).toEqual(r1.collectTicks);
      }),
      { numRuns: 10 },
    );
  });
});

// Task 14.5: example tests for Hunter reroute and pellet collection (Requirements 8.1, 8.2, 8.7).
// Hand-built mazes with exact expected directions.

import { describe, expect, it } from 'vitest';
import { CELL_UNITS, DEFAULT_CONFIG } from '../../src/core/config';
import { detonate } from '../../src/core/bombs';
import { createHunterBrain, decideHunter, notifyHunterEvents } from '../../src/core/hunter';
import { stepMovement } from '../../src/core/movement';
import { computeDistanceField, UNREACHABLE } from '../../src/core/pathfinding';
import { isPassable } from '../../src/core/grid';
import { ItemKind, Tile } from '../../src/core/types';
import type { Cell, GameState, ItemKindCode } from '../../src/core/types';
import { buildState, makeCharacter, mazeFromAscii } from '../helpers/fixtures';

const CFG = DEFAULT_CONFIG;
const TICKS_PER_CELL = Math.ceil(CELL_UNITS / CFG.baseUnitsPerTick);

type Placed = [number, number, ItemKindCode];

function withItems(state: GameState, items: Placed[]): GameState {
  const kinds = new Uint8Array(state.items.kinds.length);
  for (const [x, y, k] of items) kinds[y * state.maze.width + x] = k;
  return { ...state, items: { ...state.items, kinds } };
}

function withDoor(state: GameState, open: boolean, nextChangeIn: number): GameState {
  return {
    ...state,
    doors: [{ index: 0, open, nextChangeIn, warning: 0, postponed: false }],
    derived: { ...state.derived, doorMask: open ? 1 : 0 },
  };
}

// Two parallel corridors joined at both ends; a Door sits on the short top corridor.
const LOOP = [
  'HHHHHHH',
  'H..D..H',
  'H.HHH.H',
  'H.....H',
  'HHHHHHH',
];

function loopState(): GameState {
  const base = mazeFromAscii(LOOP);
  return buildState(base, {
    over: {
      hunter: makeCharacter('hunter', { x: 1, y: 2 }),
      player: makeCharacter('player', { x: 5, y: 3 }),
    },
  });
}

describe('Hunter reroute when a Door changes', () => {
  const pellet: Placed[] = [[5, 1, ItemKind.Ordinary]];

  it('takes the short top corridor while the Door is open', () => {
    const s = withDoor(withItems(loopState(), pellet), true, 120);
    const d = decideHunter(s, createHunterBrain(1, 1), CFG);
    expect(d.target).toEqual({ x: 5, y: 1 });
    expect(d.dir).toBe('up'); // (1,2)->(1,1)->(2,1)->(3,1)->(4,1)->(5,1), 5 steps
  });

  it('reroutes through the longer bottom corridor when the Door closes', () => {
    const open = withDoor(withItems(loopState(), pellet), true, 120);
    const first = decideHunter(open, createHunterBrain(1, 1), CFG);
    expect(first.dir).toBe('up');
    const closed = withDoor(open, false, 100);
    const brain = notifyHunterEvents(first.brain, [{ t: 'DoorChanged', doorIndex: 0, open: false }]);
    expect(brain.target).toBe(-1);
    const d = decideHunter(closed, brain, CFG);
    expect(d.target).toEqual({ x: 5, y: 1 });
    expect(d.dir).toBe('down'); // (1,2)->(1,3)->...->(5,3)->(5,2)->(5,1), 7 steps
  });

  it('treats a Door closing within the lookahead as closed and reroutes early', () => {
    const s = withDoor(withItems(loopState(), pellet), true, CFG.doorLookaheadTicks);
    expect(decideHunter(s, createHunterBrain(1, 1), CFG).dir).toBe('down');
    const later = withDoor(s, true, CFG.doorLookaheadTicks + 1);
    expect(decideHunter(later, createHunterBrain(1, 1), CFG).dir).toBe('up');
  });

  it('waits (no direction, no target) when the closed Door is the only way', () => {
    const maze = mazeFromAscii(['HHHHHHH', 'HU.D..H', 'HHHHHHH']);
    const base = buildState(maze, { over: { player: makeCharacter('player', { x: 5, y: 1 }) } });
    const s = withItems(base, [[4, 1, ItemKind.Ordinary]]);
    const open = decideHunter(withDoor(s, true, 120), createHunterBrain(1, 1), CFG);
    expect(open.dir).toBe('right');
    const closed = decideHunter(withDoor(s, false, 100), createHunterBrain(1, 1), CFG);
    expect(closed.dir).toBeNull();
    expect(closed.target).toBeNull();
  });
});

describe('Hunter reroute after a wall is destroyed', () => {
  const GRID = [
    'HHHHHHH',
    'H.....H',
    'H.#.#.H',
    'H.....H',
    'HHHHHHH',
  ];

  it('uses the new gap on the very next decision', () => {
    const maze = mazeFromAscii(GRID);
    // Hunter at (2,3), pellet at (3,1): left detour is 5 steps, right detour is 7.
    const base = buildState(maze, {
      over: { hunter: makeCharacter('hunter', { x: 2, y: 3 }), player: makeCharacter('player', { x: 5, y: 3 }) },
    });
    const s0 = withItems(base, [[3, 1, ItemKind.Ordinary]]);
    // (2,2) is a wall and (3,2) is open; hunter at (2,3): up is blocked, so 3 via (3,3),(3,2),(3,1).
    const before = decideHunter(s0, createHunterBrain(1, 1), CFG);
    expect(before.target).toEqual({ x: 3, y: 1 });
    expect(before.dir).toBe('right'); // (2,3)->(3,3)->(3,2)->(3,1)

    // Block (3,2) too with a hand-built wall, making the left detour the best: 5 steps.
    const walled = s0.walls.tiles.slice();
    walled[2 * maze.width + 3] = Tile.Wall;
    const s1: GameState = { ...s0, walls: { tiles: walled, version: 1, destroyed: 0 } };
    const detour = decideHunter(s1, createHunterBrain(1, 1), CFG);
    expect(detour.dir).toBe('left'); // (2,3)->(1,3)->(1,2)->(1,1)->(2,1)->(3,1)

    // A bomb blast removes the wall at (2,2): up is now a 3-step route.
    const det = detonate(s1.walls, maze.width, maze.height, { cell: { x: 2, y: 2 }, next: null, progress: 0 }, 0.4);
    expect(det.destroyed).toEqual([{ x: 2, y: 2 }]);
    const s2: GameState = { ...s1, walls: det.walls };
    const brain = notifyHunterEvents(detour.brain, [{ t: 'WallsDestroyed', cells: det.destroyed }]);
    expect(brain.target).toBe(-1);
    const after = decideHunter(s2, brain, CFG);
    expect(after.target).toEqual({ x: 3, y: 1 });
    expect(after.dir).toBe('up'); // (2,3)->(2,2)->(2,1)->(3,1)
  });
});

describe('Hunter collects every Ordinary_Pellet in a small maze', () => {
  const ROWS = [
    'HHHHHHHHH',
    'H.U.....H',
    'H.#.#.#.H',
    'H.......H',
    'H.#.#.#.H',
    'H......PH',
    'HHHHHHHHH',
  ];
  const ORDINARY: Cell[] = [{ x: 5, y: 1 }, { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 7, y: 3 }, { x: 3, y: 5 }, { x: 5, y: 5 }];
  const POWER: Cell = { x: 6, y: 3 };
  const SPEED: Cell = { x: 1, y: 5 };
  const DECOYS: Placed[] = [
    [3, 3, ItemKind.Wisp],
    [6, 5, ItemKind.Bomb],
    [7, 1, ItemKind.GhostHunt],
  ];
  const KEY: Cell = { x: 4, y: 1 };

  it('collects all Ordinary, Power and Speed pellets within a computed bound and never targets decoys', () => {
    const maze = mazeFromAscii(ROWS);
    const w = maze.width;
    const items: Placed[] = [
      ...ORDINARY.map((c): Placed => [c.x, c.y, ItemKind.Ordinary]),
      [POWER.x, POWER.y, ItemKind.Power],
      [SPEED.x, SPEED.y, ItemKind.Speed],
      ...DECOYS,
    ];
    let state = withItems(buildState(maze), items);
    const kinds = state.items.kinds;
    const decoyIdx = new Set<number>([...DECOYS.map(([x, y]) => y * w + x), KEY.y * w + KEY.x]);

    // Bound: pellets * graph diameter * ticks per Cell, plus one Cell of slack per pellet.
    const pellets = ORDINARY.length + 2;
    let diameter = 0;
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < w; x++) {
        if (maze.tiles[y * w + x] !== Tile.Floor) continue;
        const f = computeDistanceField(maze, state.walls.tiles, 0, 0, [y * w + x]);
        for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== UNREACHABLE) diameter = Math.max(diameter, f.dist[i]!);
      }
    }
    const bound = pellets * (diameter + 1) * TICKS_PER_CELL;

    const targeted = new Set<number>();
    let brain = createHunterBrain(1, 1);
    let remaining = pellets;
    let t = 0;
    for (; t < bound && remaining > 0; t++) {
      const d = decideHunter(state, brain, CFG);
      brain = d.brain;
      if (d.target !== null) {
        const ti = d.target.y * w + d.target.x;
        targeted.add(ti);
        expect(decoyIdx.has(ti)).toBe(false);
        expect([ItemKind.Ordinary, ItemKind.Power, ItemKind.Speed]).toContain(kinds[ti]);
      }
      const env = {
        width: w,
        height: maze.height,
        tiles: state.walls.tiles,
        doors: maze.doors,
        doorMask: 0,
        wrapPairs: maze.wrapPairs,
      };
      const hunter = stepMovement(state.hunter, d.dir, CFG.baseUnitsPerTick, env);
      expect(isPassable(state.walls.tiles, w, maze.height, maze.doors, 0, hunter.cell.x, hunter.cell.y)).toBe(true);
      state = { ...state, hunter };
      const idx = hunter.cell.y * w + hunter.cell.x;
      const k = kinds[idx]!;
      if (k === ItemKind.Ordinary || k === ItemKind.Power || k === ItemKind.Speed) {
        kinds[idx] = ItemKind.None;
        remaining--;
      }
    }
    expect(remaining).toBe(0);
    expect(t).toBeLessThanOrEqual(bound);
    // Decoys are still on the floor, untouched by the Hunter's targeting.
    for (const [x, y, k] of DECOYS) expect(kinds[y * w + x]).toBe(k);
    // It competed for the Power and Speed pellets.
    expect(targeted.has(POWER.y * w + POWER.x)).toBe(true);
    expect(targeted.has(SPEED.y * w + SPEED.x)).toBe(true);
  });

  it('prefers a Speed pellet over an equally distant Ordinary pellet', () => {
    const maze = mazeFromAscii(['HHHHHHHHH', 'H..U....H', 'H.#####.H', 'H......PH', 'HHHHHHHHH']);
    const base = buildState(maze, { over: { player: makeCharacter('player', { x: 7, y: 3 }) } });
    const s = withItems(base, [
      [1, 1, ItemKind.Speed], // 2 steps left
      [5, 1, ItemKind.Ordinary], // 2 steps right
    ]);
    const d = decideHunter(s, createHunterBrain(1, 1), CFG);
    expect(d.target).toEqual({ x: 1, y: 1 });
    expect(d.dir).toBe('left');
  });
});

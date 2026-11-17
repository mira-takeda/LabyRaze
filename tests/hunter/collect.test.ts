import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { computeDistanceField, lookaheadDoorMask, UNREACHABLE } from '../../src/core/pathfinding';
import { dirDx, dirDy, isPassable } from '../../src/core/grid';
import {
  createHunterBrain,
  decideHunter,
  fleeSources,
  notifyHunterEvents,
  selectHunterMode,
} from '../../src/core/hunter';
import type { HunterBrain } from '../../src/core/hunter';
import { Floor, ItemKind, Tile } from '../../src/core/types';
import type { Cell, GameState, ItemKindCode } from '../../src/core/types';
import {
  allFixtureMazes,
  buildState,
  makeCharacter,
  mazeFromAscii,
} from '../helpers/fixtures';

type Placed = [number, number, ItemKindCode];

/** Replaces all items with the given (x, y, kind) entries. */
function withItems(state: GameState, items: Placed[]): GameState {
  const kinds = new Uint8Array(state.items.kinds.length);
  for (const [x, y, k] of items) kinds[y * state.maze.width + x] = k;
  return { ...state, items: { ...state.items, kinds } };
}

const RING = [
  'HHHHHHHHH',
  'H..U....H',
  'H.#####.H',
  'H.......H',
  'HHHHHHHHH',
];

function ringState(items: Placed[]): GameState {
  const maze = mazeFromAscii(RING);
  const s = buildState(maze, { over: { player: makeCharacter('player', { x: 7, y: 3 }) } });
  return withItems(s, items);
}

describe('hunter COLLECT', () => {
  it('picks the nearest pellet when all are ordinary', () => {
    const s = ringState([
      [5, 1, ItemKind.Ordinary], // 2 steps from (3,1)
      [1, 3, ItemKind.Ordinary], // far
    ]);
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.mode).toBe('COLLECT');
    expect(d.target).toEqual({ x: 5, y: 1 });
    expect(d.dir).toBe('right');
  });

  it('prefers a Power pellet over a slightly nearer ordinary one', () => {
    const s = ringState([
      [4, 1, ItemKind.Ordinary],
      [6, 1, ItemKind.Power],
    ]);
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.target).toEqual({ x: 6, y: 1 });
  });

  it('never targets player-only items', () => {
    const s = ringState([
      [4, 1, ItemKind.Bomb],
      [4, 1 + 2, ItemKind.Wisp],
      [2, 1, ItemKind.GhostHunt],
      [1, 3, ItemKind.Ordinary],
    ]);
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.target).toEqual({ x: 1, y: 3 });

    const only = withItems(s, [[4, 1, ItemKind.Bomb], [2, 1, ItemKind.GhostHunt], [5, 3, ItemKind.Wisp]]);
    const none = decideHunter(only, createHunterBrain(1, 1));
    expect(none.target).toBeNull();
    expect(none.dir).toBeNull();
  });

  it('adapts when a Door closes', () => {
    const maze = mazeFromAscii([
      'HHHHHHHHH',
      'HU..D...H',
      'H.HHHHH.H',
      'H.......H',
      'HHHHHHHHH',
    ]);
    const base = withItems(
      buildState(maze, { over: { player: makeCharacter('player', { x: 7, y: 3 }) } }),
      [[7, 1, ItemKind.Ordinary]],
    );
    const open = decideHunter(base, createHunterBrain(1, 1));
    expect(open.dir).toBe('right');
    const closed: GameState = { ...base, derived: { ...base.derived, doorMask: 0 } };
    const d = decideHunter(closed, open.brain);
    expect(d.dir).toBe('down');
  });

  it('treats a Door about to close as closed (lookahead)', () => {
    const maze = mazeFromAscii([
      'HHHHHHHHH',
      'HU..D...H',
      'H.HHHHH.H',
      'H.......H',
      'HHHHHHHHH',
    ]);
    const base = withItems(
      buildState(maze, { over: { player: makeCharacter('player', { x: 7, y: 3 }) } }),
      [[7, 1, ItemKind.Ordinary]],
    );
    const closing: GameState = {
      ...base,
      doors: base.doors.map((d) => ({ ...d, open: true, nextChangeIn: DEFAULT_CONFIG.doorLookaheadTicks })),
    };
    expect(decideHunter(closing, createHunterBrain(1, 1)).dir).toBe('down');
  });

  it('adapts when a wall is destroyed', () => {
    const maze = mazeFromAscii(RING);
    const s0 = withItems(
      buildState(maze, { over: { player: makeCharacter('player', { x: 7, y: 3 }) } }),
      [[3, 3, ItemKind.Ordinary]],
    );
    const before = decideHunter(s0, createHunterBrain(1, 1));
    expect(before.dir).toBe('left');

    const tiles = s0.walls.tiles.slice();
    tiles[2 * maze.width + 3] = Floor;
    const s1: GameState = { ...s0, walls: { tiles, version: 1, destroyed: 1 } };
    const after = decideHunter(s1, notifyHunterEvents(before.brain, [{ t: 'WallsDestroyed', cells: [{ x: 3, y: 2 }] }]));
    expect(after.dir).toBe('down');
  });

  it('clears the commitment on DoorChanged and WallsDestroyed only', () => {
    const b: HunterBrain = { ...createHunterBrain(1, 1), target: 5 };
    expect(notifyHunterEvents(b, [{ t: 'DoorChanged', doorIndex: 0, open: false }]).target).toBe(-1);
    expect(notifyHunterEvents(b, [{ t: 'WallsDestroyed', cells: [] }]).target).toBe(-1);
    expect(notifyHunterEvents(b, [{ t: 'PowerStarted', who: 'player' }]).target).toBe(5);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const s = ringState([
      [5, 1, ItemKind.Ordinary],
      [1, 3, ItemKind.Ordinary],
      [6, 3, ItemKind.Speed],
    ]);
    const kindsBefore = s.items.kinds.slice();
    const a = decideHunter(s, createHunterBrain(7, 2));
    const b = decideHunter(s, createHunterBrain(7, 2));
    expect(b).toEqual(a);
    expect(s.items.kinds).toEqual(kindsBefore);
  });
});

describe('hunter mode selection', () => {
  const base = ringState([[5, 1, ItemKind.Ordinary]]);

  it('FLEE when the Player holds power, even if Squareman holds it too', () => {
    const s: GameState = { ...base, player: { ...base.player, power: 10 }, hunter: { ...base.hunter, power: 10 } };
    expect(selectHunterMode(s, 2)).toBe('FLEE');
    expect(fleeSources(s)).toEqual([s.player.cell]);
  });

  it('FLEE when an ally is hunting', () => {
    const allies = base.ghostHunt.allies.map((a, i) => (i === 0 ? { ...a, mode: 'hunting' as const } : a));
    const s: GameState = {
      ...base,
      hunter: { ...base.hunter, power: 10 },
      ghostHunt: { ticksLeft: 5, allies: allies as GameState['ghostHunt']['allies'] },
    };
    expect(selectHunterMode(s, 1)).toBe('FLEE');
    expect(decideHunter(s, createHunterBrain(1, 1)).mode).toBe('FLEE');
  });

  it('CHASE only with hunter power and the Player within chase distance', () => {
    const s: GameState = { ...base, hunter: { ...base.hunter, power: 10 } };
    expect(selectHunterMode(s, DEFAULT_CONFIG.hunterChaseDistance)).toBe('CHASE');
    expect(selectHunterMode(s, DEFAULT_CONFIG.hunterChaseDistance + 1)).toBe('COLLECT');
    expect(selectHunterMode(s, UNREACHABLE)).toBe('COLLECT');
    expect(selectHunterMode(base, 1)).toBe('COLLECT');
  });
});

describe('hunter property: following the direction', () => {
  it('never walks into a wall; distance to target drops or the target changes', () => {
    const mazes = allFixtureMazes();
    const arb = fc.record({
      m: fc.integer({ min: 0, max: mazes.length - 1 }),
      seed: fc.integer({ min: 1, max: 1_000_000 }),
      hunterPick: fc.nat(),
      playerPick: fc.nat(),
      pellets: fc.array(
        fc.record({
          pick: fc.nat(),
          kind: fc.constantFrom<ItemKindCode>(
            ItemKind.Ordinary,
            ItemKind.Ordinary,
            ItemKind.Power,
            ItemKind.Speed,
            ItemKind.Bomb,
            ItemKind.Wisp,
          ),
        }),
        { minLength: 1, maxLength: 12 },
      ),
    });

    fc.assert(
      fc.property(arb, ({ m, seed, hunterPick, playerPick, pellets }) => {
        const maze = mazes[m]!;
        const floors: Cell[] = [];
        for (let y = 0; y < maze.height; y++) {
          for (let x = 0; x < maze.width; x++) {
            if (maze.tiles[y * maze.width + x] === Tile.Floor) floors.push({ x, y });
          }
        }
        const start = floors[hunterPick % floors.length]!;
        const pCell = floors[playerPick % floors.length]!;
        let s = buildState(maze, {
          over: { hunter: makeCharacter('hunter', start), player: makeCharacter('player', pCell) },
        });
        s = withItems(
          s,
          pellets.map((p) => {
            const c = floors[p.pick % floors.length]!;
            return [c.x, c.y, p.kind] as Placed;
          }),
        );
        const kinds = s.items.kinds;
        const w = maze.width;
        let brain = createHunterBrain(seed, 1);

        for (let step = 0; step < 40; step++) {
          const { x, y } = s.hunter.cell;
          const idx = y * w + x;
          // Collect what we stand on.
          if (kinds[idx] === ItemKind.Ordinary || kinds[idx] === ItemKind.Power || kinds[idx] === ItemKind.Speed) {
            kinds[idx] = ItemKind.None;
          }
          const d = decideHunter(s, brain);
          brain = d.brain;
          if (d.dir === null) break;

          const mask = lookaheadDoorMask(s.derived.doorMask, s.doors, DEFAULT_CONFIG.doorLookaheadTicks);
          const nx = x + dirDx(d.dir);
          const ny = y + dirDy(d.dir);
          if (!isPassable(s.walls.tiles, w, maze.height, maze.doors, mask, nx, ny)) return false;

          const target = d.target!;
          const tIdx = target.y * w + target.x;
          const field = computeDistanceField(maze, s.walls.tiles, mask, 0, [tIdx]);
          const here = field.dist[idx]!;
          const there = field.dist[ny * w + nx]!;
          if (there >= here) return false; // each step must close in on the chosen target

          s = { ...s, hunter: { ...s.hunter, cell: { x: nx, y: ny } } };
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

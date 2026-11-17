import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { activateBomb, clearAllyRoutes } from '../../src/core/bombs';
import type { BombSlice } from '../../src/core/bombs';
import { rebuildDerived } from '../../src/core/doors';
import { createHunterBrain, decideHunter, notifyHunterEvents } from '../../src/core/hunter';
import { DistanceFieldCache, UNREACHABLE } from '../../src/core/pathfinding';
import { ItemKind } from '../../src/core/types';
import type { Cell, GameState, Maze } from '../../src/core/types';
import { buildState, cageMaze, corridorMaze, mazeFromAscii } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;

function sliceOf(maze: Maze, playerCell: Cell, bombs = 1): BombSlice {
  const walls = { tiles: maze.tiles.slice(), version: 0, destroyed: 0 };
  const objectives = [...maze.keys, maze.cage.entrance];
  return {
    bombs,
    walls,
    derived: rebuildDerived(walls, maze.doors, maze, objectives, 0),
    player: { cell: playerCell, next: null, progress: 0 },
    maze,
    keys: maze.keys,
  };
}

/** Left room (keys) and right room (Cage entrance) split by one destructible wall at (5,1). */
function splitMaze(): Maze {
  return mazeFromAscii([
    'HHHHHHHHHHHH',
    'HP...#....GH',
    'H....HHHHHHH',
  ]);
}

describe('activateBomb: derived-data refresh', () => {
  it('recomputes connectivity so a disconnected mask becomes connected', () => {
    const maze = splitMaze();
    const slice = sliceOf(maze, { x: 4, y: 1 });
    expect(slice.derived.connectivity[0]).toBeGreaterThan(1);
    const r = activateBomb(slice, cfg);
    expect(r.destroyed).toContainEqual({ x: 5, y: 1 });
    expect(r.derived).not.toBe(slice.derived);
    expect(r.derived.connectivity[0]).toBe(1);
    expect(r.derived.restoreTicks[0]).toBe(0);
    expect(r.derived.fieldVersion).toBe(r.walls.version);
    // input untouched
    expect(slice.derived.connectivity[0]).toBeGreaterThan(1);
  });

  it('bumps walls.version and the destroyed counter, copy-on-write', () => {
    const slice = sliceOf(splitMaze(), { x: 4, y: 1 });
    const before = slice.walls.tiles.slice();
    const r = activateBomb(slice, cfg);
    expect(r.walls.version).toBe(slice.walls.version + 1);
    expect(r.walls.destroyed).toBe(r.destroyed.length);
    expect(r.walls).not.toBe(slice.walls);
    expect(Array.from(slice.walls.tiles)).toEqual(Array.from(before));
  });

  it('consumes one bomb; at 0 bombs nothing happens', () => {
    const slice = sliceOf(splitMaze(), { x: 4, y: 1 }, 2);
    expect(activateBomb(slice, cfg).bombs).toBe(1);
    const none = activateBomb({ ...slice, bombs: 0 }, cfg);
    expect(none.activated).toBe(false);
    expect(none.bombs).toBe(0);
    expect(none.events).toEqual([]);
    expect(none.walls).toBe(slice.walls);
    expect(none.derived).toBe(slice.derived);
    expect(none.clearHunterRoute).toBe(false);
  });

  it('sets the route-clear flags and clears ally headings without moving them', () => {
    const r = activateBomb(sliceOf(splitMaze(), { x: 4, y: 1 }), cfg);
    expect(r.clearHunterRoute).toBe(true);
    expect(r.clearAllyRoutes).toBe(true);
    const allies = [{ id: 0, dir: 'left' as const, next: { x: 1, y: 1 }, progress: 5 }];
    const cleared = clearAllyRoutes(allies);
    expect(cleared[0]).toEqual({ id: 0, dir: null, next: { x: 1, y: 1 }, progress: 5 });
    expect(allies[0]!.dir).toBe('left');
  });
});

describe('activateBomb: events', () => {
  it('emits BombActivated, BombDetonated, WallsDestroyed in order in one result', () => {
    const r = activateBomb(sliceOf(splitMaze(), { x: 4, y: 1 }), cfg);
    expect(r.events.map((e) => e.t)).toEqual(['BombActivated', 'BombDetonated', 'WallsDestroyed']);
    const [a, d, w] = r.events;
    expect(a).toEqual({ t: 'BombActivated', cell: { x: 4, y: 1 } });
    expect(d).toEqual({ t: 'BombDetonated', cell: { x: 4, y: 1 }, radius: cfg.bombRadius, destroyed: r.destroyed });
    expect(w).toEqual({ t: 'WallsDestroyed', cells: r.destroyed });
  });

  it('an empty explosion consumes the bomb and leaves caches and derived data unchanged', () => {
    const maze = corridorMaze();
    const slice = sliceOf(maze, maze.playerStart, 3);
    const r = activateBomb(slice, cfg);
    expect(r.activated).toBe(true);
    expect(r.bombs).toBe(2);
    expect(r.destroyed).toEqual([]);
    expect(r.events.map((e) => e.t)).toEqual(['BombActivated', 'BombDetonated']);
    expect(r.events[1]).toMatchObject({ destroyed: [] });
    expect(r.walls).toBe(slice.walls);
    expect(r.derived).toBe(slice.derived);
    expect(r.clearHunterRoute).toBe(false);
    expect(r.clearAllyRoutes).toBe(false);
  });
});

describe('activateBomb: caches and Hunter', () => {
  /** 7x4 room with a wall at (3,1); the only pellet is at (4,1), the Hunter at (2,1). */
  function shortcutState(): GameState {
    const maze = mazeFromAscii([
      'HHHHHHH',
      'H.U#..H',
      'H.....H',
      'HHHHHHH',
    ]);
    const s = buildState(maze, { over: { bombs: 1 } });
    const kinds = new Uint8Array(maze.width * maze.height);
    kinds[1 * maze.width + 4] = ItemKind.Ordinary;
    return {
      ...s,
      items: { ...s.items, kinds, keys: [], ordinaryRemaining: 1 },
      hunter: { ...s.hunter, cell: { x: 2, y: 1 } },
      player: { ...s.player, cell: { x: 4, y: 2 } },
    };
  }

  it('a distance field fetched after the explosion is the new shorter one (no stale hit)', () => {
    const state = shortcutState();
    const { maze } = state;
    const cache = new DistanceFieldCache();
    const target = [1 * maze.width + 4];
    const hunterIdx = 1 * maze.width + 2;
    const before = cache.get(maze, state.walls, 0, target);
    expect(before.dist[hunterIdx]).toBe(4);
    expect(cache.get(maze, state.walls, 0, target)).toBe(before);

    const r = activateBomb(
      { bombs: 1, walls: state.walls, derived: rebuildDerived(state.walls, maze.doors, maze, [maze.cage.entrance]), player: state.player, maze, keys: [] },
      cfg,
    );
    expect(r.destroyed).toContainEqual({ x: 3, y: 1 });
    const after = cache.get(maze, r.walls, 0, target);
    expect(after).not.toBe(before);
    expect(after.version).toBe(r.walls.version);
    expect(after.dist[hunterIdx]).toBe(2);
    expect(before.dist[hunterIdx]).toBe(4);
    expect(after.dist[hunterIdx]).not.toBe(UNREACHABLE);
  });

  it("the Hunter's next direction changes when a wall opens a shortcut", () => {
    const state = shortcutState();
    const brain = createHunterBrain(state.runSeed, state.levelNumber);
    const d0 = decideHunter(state, brain, cfg);
    expect(d0.mode).toBe('COLLECT');
    expect(d0.dir).toBe('down');

    const r = activateBomb(
      { bombs: 1, walls: state.walls, derived: rebuildDerived(state.walls, state.maze.doors, state.maze, [state.maze.cage.entrance]), player: state.player, maze: state.maze, keys: [] },
      cfg,
    );
    const cleared = notifyHunterEvents(d0.brain, r.events);
    expect(cleared.target).toBe(-1);
    const next: GameState = { ...state, walls: r.walls, derived: r.derived, bombs: r.bombs };
    const d1 = decideHunter(next, cleared, cfg);
    expect(d1.mode).toBe('COLLECT');
    expect(d1.dir).toBe('right');
  });
});

describe('activateBomb: no staleness property', () => {
  // Generous timeout: ~170 ms in isolation, but the default 5 s tripped once under full-suite
  // parallel load (checkpoint 39). Same 100 runs and assertions, only a bigger time budget.
  it('after any sequence of detonations, derived tables equal a fresh rebuild', () => {
    const maze = cageMaze();
    const objectives = [...maze.keys, maze.cage.entrance];
    const cellArb = fc.record({ x: fc.integer({ min: 1, max: maze.width - 2 }), y: fc.integer({ min: 1, max: maze.height - 2 }) });
    fc.assert(
      fc.property(fc.array(cellArb, { minLength: 1, maxLength: 6 }), (cells) => {
        let slice = sliceOf(maze, cells[0]!, 3);
        for (const c of cells) {
          const r = activateBomb({ ...slice, bombs: 3, player: { cell: c, next: null, progress: 0 } }, cfg);
          slice = { ...slice, walls: r.walls, derived: r.derived };
          const fresh = rebuildDerived(r.walls, maze.doors, maze, objectives, slice.derived.doorMask);
          expect(r.derived.connectivity).toEqual(fresh.connectivity);
          expect(r.derived.restoreTicks).toEqual(fresh.restoreTicks);
          expect(r.derived.fieldVersion).toBe(r.walls.version);
          expect(r.derived.labels.map((l) => Array.from(l))).toEqual(fresh.labels.map((l) => Array.from(l)));
        }
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});

// Property 50: Two competing victory conditions (task 17.4).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_UNITS, DEFAULT_CONFIG } from '../../src/core/config';
import { isPassable } from '../../src/core/grid';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Cell, Dir, GameState, Input } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const DIRS: Array<[Dir, number, number]> = [
  ['up', 0, -1],
  ['right', 1, 0],
  ['down', 0, 1],
  ['left', -1, 0],
];

function withState(run: Run, s: GameState): Run {
  return { ...run, state: s };
}

/** Removes every Ordinary_Pellet except `keep`. */
function onlyPellet(s: GameState, keep: Cell): GameState {
  const kinds = s.items.kinds.slice();
  for (let i = 0; i < kinds.length; i++) if (kinds[i] === ItemKind.Ordinary) kinds[i] = ItemKind.None;
  kinds[keep.y * s.maze.width + keep.x] = ItemKind.Ordinary;
  return { ...s, items: { ...s.items, kinds, ordinaryRemaining: 1 } };
}

/** A passable neighbour of `c` that holds no item, and the direction to it. */
function freeNeighbour(s: GameState, c: Cell): { cell: Cell; dir: Dir } {
  for (const [dir, dx, dy] of DIRS) {
    const n = { x: c.x + dx, y: c.y + dy };
    const ok = isPassable(s.walls.tiles, s.maze.width, s.maze.height, s.maze.doors, s.derived.doorMask, n.x, n.y);
    if (ok && s.items.kinds[n.y * s.maze.width + n.x] === ItemKind.None) return { cell: n, dir };
  }
  for (const [dir, dx, dy] of DIRS) {
    const n = { x: c.x + dx, y: c.y + dy };
    if (isPassable(s.walls.tiles, s.maze.width, s.maze.height, s.maze.doors, s.derived.doorMask, n.x, n.y)) {
      return { cell: n, dir };
    }
  }
  throw new Error('no passable neighbour');
}

/** Player on the Cage entrance carrying the last Key with two Captives already released. */
function readyToRescue(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player, cell: { ...s.maze.cage.entrance }, next: null, progress: 0, dir: null },
    carriedKeys: 1,
    captives: [true, true, false],
    items: { ...s.items, keys: [] },
  };
}

/** Hunter one unit before entering `target` from a neighbour, alive and committed to it. */
function hunterArriving(s: GameState, target: Cell): GameState {
  const from = freeNeighbour(s, target);
  const back: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  return {
    ...s,
    hunter: {
      ...s.hunter,
      cell: from.cell,
      next: { ...target },
      dir: back[from.dir],
      progress: CELL_UNITS - 1,
      respawnIn: 0,
      invulnerable: 0,
      power: 0,
    },
  };
}

describe('Property 50: two competing victory conditions', () => {
  it('Squareman clearing the last Ordinary_Pellet is a Hunter win', () => {
    const run = createRun(31, cfg);
    const target = run.state.maze.ordinary[0]!;
    let s = hunterArriving(onlyPellet(run.state, target), target);
    // Keep the Player far from the Hunter so no collision interferes.
    s = { ...s, player: { ...s.player, invulnerable: 10_000 } };
    const r = step(withState(run, s), IDLE);
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'PelletCollected', kind: 'ordinary', by: 'hunter' }));
    expect(r.run.state.items.ordinaryRemaining).toBe(0);
    expect(r.run.state.phase).toBe('levelEnd');
    expect(r.run.state.outcome).toBe('hunterWin');
  });

  it('releasing the third Captive is a Player win', () => {
    const run = createRun(32, cfg);
    const r = step(withState(run, readyToRescue(run.state)), IDLE);
    expect(r.events).toContainEqual({ t: 'CaptiveReleased', index: 2 });
    expect(r.run.state.captives).toEqual([true, true, true]);
    expect(r.run.state.phase).toBe('levelEnd');
    expect(r.run.state.outcome).toBe('playerWin');
  });

  it('both conditions on the same Tick give a Player win', () => {
    const run = createRun(33, cfg);
    const base = readyToRescue(run.state);
    // The last pellet must not be the Cage entrance itself.
    const target = base.maze.ordinary.find((c) => c.x !== base.maze.cage.entrance.x || c.y !== base.maze.cage.entrance.y)!;
    let s = hunterArriving(onlyPellet(base, target), target);
    s = { ...s, player: { ...s.player, invulnerable: 10_000 } };
    const r = step(withState(run, s), IDLE);
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'PelletCollected', kind: 'ordinary', by: 'hunter' }));
    expect(r.events).toContainEqual({ t: 'CaptiveReleased', index: 2 });
    expect(r.run.state.items.ordinaryRemaining).toBe(0);
    expect(r.run.state.outcome).toBe('playerWin');
    expect(r.events.filter((e) => e.t === 'LevelEnded')).toEqual([{ t: 'LevelEnded', outcome: 'playerWin', level: 1 }]);
  });

  it('Wisps cannot satisfy or block either condition', () => {
    const run = createRun(34, cfg);
    // All Ordinary_Pellets gone but Wisps remain: still a Hunter win.
    const target = run.state.maze.ordinary[0]!;
    let s = hunterArriving(onlyPellet(run.state, target), target);
    s = { ...s, player: { ...s.player, invulnerable: 10_000 } };
    expect(s.items.wispsRemaining).toBeGreaterThan(0);
    const r = step(withState(run, s), IDLE);
    expect(r.run.state.outcome).toBe('hunterWin');
    expect(r.run.state.items.wispsRemaining).toBeGreaterThan(0);

    // Collecting the last Wisp ends nothing.
    const s2 = run.state;
    const wisp = s2.maze.wisps[0]!;
    const kinds = s2.items.kinds.slice();
    for (let i = 0; i < kinds.length; i++) if (kinds[i] === ItemKind.Wisp) kinds[i] = ItemKind.None;
    kinds[wisp.y * s2.maze.width + wisp.x] = ItemKind.Wisp;
    const from = freeNeighbour(s2, wisp);
    const back: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
    const s3: GameState = {
      ...s2,
      items: { ...s2.items, kinds, wispsRemaining: 1 },
      player: { ...s2.player, cell: from.cell, next: { ...wisp }, dir: back[from.dir], progress: CELL_UNITS - 1, invulnerable: 10_000 },
    };
    const r2 = step(withState(run, s3), IDLE);
    expect(r2.events.some((e) => e.t === 'WispCollected')).toBe(true);
    expect(r2.run.state.items.wispsRemaining).toBe(0);
    expect(r2.run.state.phase).toBe('playing');
  });

  it('every level end matches exactly one condition under random play', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 20, maxLength: 200 }), (seed, inputs) => {
        let run = createRun(seed, cfg);
        run = { ...run, state: { ...run.state, lives: 1_000_000 } };
        for (let t = 0; t < 3000; t++) {
          const r = step(run, { ...inputs[t % inputs.length]!, continue: false });
          const s = r.run.state;
          if (s.phase === 'levelEnd') {
            if (s.outcome === 'playerWin') expect(s.captives).toEqual([true, true, true]);
            else {
              expect(s.outcome).toBe('hunterWin');
              expect(s.items.ordinaryRemaining).toBe(0);
              expect(s.captives.every(Boolean)).toBe(false);
            }
            break;
          }
          expect(s.items.ordinaryRemaining).toBeGreaterThan(0);
          expect(s.captives.every(Boolean)).toBe(false);
          run = r.run;
        }
      }),
      { numRuns: 20 },
    );
  }, 120_000);
});

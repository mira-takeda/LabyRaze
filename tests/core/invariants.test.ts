import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import {
  InvariantError,
  assertValidState,
  findInvariantViolations,
  invariantChecksEnabled,
  setInvariantChecks,
} from '../../src/core/invariants';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind, Tile } from '../../src/core/types';
import type { Dir, GameState, Input } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

function scripted(t: number): Input {
  const pressed = t % 13 === 0 ? DIRS[(t / 13) % 4 | 0]! : null;
  return { pressed, bomb: t % 173 === 0, continue: t % 61 === 0 };
}

function fresh(seed = 77): GameState {
  return createRun(seed, cfg).state;
}

function expectViolation(s: GameState, fragment: string): void {
  const problems = findInvariantViolations(s, cfg);
  expect(problems.some((p) => p.includes(fragment)), problems.join('\n')).toBe(true);
  expect(() => assertValidState(s, cfg)).toThrow(InvariantError);
}

afterEach(() => setInvariantChecks(false));

describe('assertValidState', () => {
  it('accepts every freshly created level', () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      expect(findInvariantViolations(fresh(seed), cfg)).toEqual([]);
    }
  });

  it('holds after every Tick of long scripted runs with checks enabled in step', () => {
    setInvariantChecks(true);
    expect(invariantChecksEnabled()).toBe(true);
    for (const seed of [5, 1234]) {
      let run: Run = createRun(seed, cfg);
      run = { ...run, state: { ...run.state, lives: 1_000_000 } };
      for (let t = 0; t < 3000; t++) run = step(run, scripted(t)).run;
      expect(findInvariantViolations(run.state, cfg)).toEqual([]);
    }
  }, 60_000);

  it('is off by default so production pays nothing', () => {
    expect(invariantChecksEnabled()).toBe(false);
  });

  it('fires when both characters hold power', () => {
    const s = fresh();
    expectViolation({ ...s, player: { ...s.player, power: 10 }, hunter: { ...s.hunter, power: 10 } }, 'both characters hold power');
  });

  it('fires when a character stands on a wall', () => {
    const s = fresh();
    const i = s.walls.tiles.findIndex((t) => t === Tile.WallHard);
    const cell = { x: i % s.maze.width, y: Math.floor(i / s.maze.width) };
    expectViolation({ ...s, player: { ...s.player, cell } }, 'player stands on a wall');
  });

  it('fires when a Key disappears', () => {
    const s = fresh();
    expectViolation({ ...s, items: { ...s.items, keys: s.items.keys.slice(1) } }, 'key conservation');
  });

  it('fires when a Cage tile is altered', () => {
    const s = fresh();
    const e = s.maze.cage.entrance;
    const tiles = s.walls.tiles.slice();
    tiles[e.y * s.maze.width + e.x] = Tile.Floor;
    expectViolation({ ...s, walls: { ...s.walls, tiles } }, 'changed from');
  });

  it('fires when an item counter disagrees with the floor', () => {
    const s = fresh();
    expectViolation({ ...s, items: { ...s.items, ordinaryRemaining: s.items.ordinaryRemaining + 1 } }, 'ordinaryRemaining');
  });

  it('fires when an item sits on a wall', () => {
    const s = fresh();
    const kinds = s.items.kinds.slice();
    const i = s.walls.tiles.findIndex((t) => t === Tile.WallHard);
    kinds[i] = ItemKind.Power;
    expectViolation({ ...s, items: { ...s.items, kinds } }, 'on a wall');
  });

  it('fires when derived tables are stale', () => {
    const s = fresh();
    expectViolation({ ...s, derived: { ...s.derived, fieldVersion: s.walls.version + 1 } }, 'fieldVersion');
  });

  it('fires when the Bomb inventory exceeds capacity', () => {
    const s = fresh();
    expectViolation({ ...s, bombs: cfg.bombCapacity + 1 }, 'above capacity');
  });

  it('makes step throw on a corrupted state when enabled', () => {
    setInvariantChecks(true);
    const run = createRun(8, cfg);
    const bad: Run = { ...run, state: { ...run.state, items: { ...run.state.items, keys: [] } } };
    expect(() => step(bad, { pressed: null, bomb: false, continue: false })).toThrow(InvariantError);
  });
});

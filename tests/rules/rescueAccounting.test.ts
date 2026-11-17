import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { applyPlayerEaten, resolveItemsAndRescue } from '../../src/core/rules';
import { scoreFor } from '../../src/core/score';
import { Tile } from '../../src/core/types';
import type { Cell, GameState } from '../../src/core/types';
import { cageState, makeCharacter } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const WEIGHT = scoreFor(cfg.scoreWeights, 'captive');

type Op =
  | { k: 'pickup'; pick: number }
  | { k: 'cage' }
  | { k: 'eaten'; at: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.nat(50).map((pick): Op => ({ k: 'pickup', pick })) },
  { weight: 3, arbitrary: fc.constant<Op>({ k: 'cage' }) },
  { weight: 2, arbitrary: fc.nat(500).map((at): Op => ({ k: 'eaten', at })) },
);

function floorCells(s: GameState): Cell[] {
  const out: Cell[] = [];
  const { width, height } = s.maze;
  const cage = s.maze.cage;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (s.walls.tiles[y * width + x] !== Tile.Floor) continue;
      if (x === cage.entrance.x && y === cage.entrance.y) continue;
      out.push({ x, y });
    }
  }
  return out;
}

const released = (s: GameState): number => s.captives.filter(Boolean).length;
const total = (s: GameState): number => s.carriedKeys + s.items.keys.length + released(s);
const at = (s: GameState, cell: Cell): GameState => ({ ...s, player: makeCharacter('player', cell) });

/** Applies one op through the real rules; returns the next state. */
function step(s: GameState, op: Op, floors: Cell[]): GameState {
  if (op.k === 'pickup') {
    if (s.items.keys.length === 0) return s;
    const key = s.items.keys[op.pick % s.items.keys.length] as Cell;
    return resolveItemsAndRescue(at(s, key), cfg).state;
  }
  if (op.k === 'cage') {
    return resolveItemsAndRescue(at(s, s.maze.cage.entrance), cfg).state;
  }
  const where = floors[op.at % floors.length] as Cell;
  return applyPlayerEaten({ ...at(s, where), lives: 1000 }, cfg).state;
}

describe('Rescue accounting (property)', () => {
  // Feature: kirobit-halloween-maze, Property 16: Rescue accounting
  it('Feature: kirobit-halloween-maze, Property 16: Rescue accounting', () => {
    const floors = floorCells(cageState());
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        let s = cageState();
        let delivered = 0;
        for (const op of ops) {
          if (s.phase !== 'playing') break;
          const before = s;
          const carriedBefore = s.carriedKeys;
          s = step(s, op, floors);

          if (op.k === 'cage') delivered += carriedBefore;
          // released = min(delivered, 3)
          expect(released(s)).toBe(Math.min(delivered, 3));
          // monotone captives
          before.captives.forEach((c, i) => {
            if (c) expect(s.captives[i]).toBe(true);
          });
          // key conservation, carried never negative
          expect(total(s)).toBe(3);
          expect(s.carriedKeys).toBeGreaterThanOrEqual(0);
          // completes exactly at the third release
          expect(s.phase === 'levelEnd').toBe(released(s) === 3);
          expect(s.outcome === 'playerWin').toBe(released(s) === 3);
          // score changes only by the captive weight per release
          expect(s.score - before.score).toBe((released(s) - released(before)) * WEIGHT);
        }
      }),
      { numRuns: 200 },
    );
  }, 60_000); // ~0.2 s alone; exceeded the 5 s default only under full-suite CPU load
});

describe('Rescue accounting (delivery strategies)', () => {
  const collectAll = (s: GameState, n: number): GameState => {
    let cur = s;
    for (let i = 0; i < n; i++) cur = step(cur, { k: 'pickup', pick: 0 }, []);
    return cur;
  };
  const visit = (s: GameState): GameState => step(s, { k: 'cage' }, []);

  it('one key at a time: level completes only after the third release', () => {
    let s = cageState();
    for (let i = 1; i <= 3; i++) {
      s = visit(collectAll(s, 1));
      expect(released(s)).toBe(i);
      expect(s.score).toBe(i * WEIGHT);
      expect(s.phase).toBe(i === 3 ? 'levelEnd' : 'playing');
    }
    expect(s.outcome).toBe('playerWin');
  });

  it('two keys then one key', () => {
    let s = visit(collectAll(cageState(), 2));
    expect(released(s)).toBe(2);
    expect(s.phase).toBe('playing');
    expect(s.outcome).toBeNull();
    s = visit(collectAll(s, 1));
    expect(released(s)).toBe(3);
    expect(s.phase).toBe('levelEnd');
    expect(s.outcome).toBe('playerWin');
    expect(s.score).toBe(3 * WEIGHT);
  });

  it('three keys at once', () => {
    const s = visit(collectAll(cageState(), 3));
    expect(s.captives).toEqual([true, true, true]);
    expect(s.carriedKeys).toBe(0);
    expect(s.phase).toBe('levelEnd');
    expect(s.outcome).toBe('playerWin');
    expect(s.score).toBe(3 * WEIGHT);
  });

  it('dropped keys can be re-collected and delivered', () => {
    const floors = floorCells(cageState());
    let s = collectAll(cageState(), 2);
    s = step(s, { k: 'eaten', at: 7 }, floors);
    expect(s.carriedKeys).toBe(0);
    expect(s.items.keys).toHaveLength(3);
    s = visit(collectAll(s, 3));
    expect(s.outcome).toBe('playerWin');
  });
});

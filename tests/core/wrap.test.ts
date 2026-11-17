// Example tests for wrap pairs (task 8.4): movement placement and pathfinding shortcut.

import { describe, expect, it } from 'vitest';
import { CELL_UNITS } from '../../src/core/config';
import { stepMovement } from '../../src/core/movement';
import type { MoveEnv } from '../../src/core/movement';
import { computeDistanceField } from '../../src/core/pathfinding';
import type { Cell, Character, Dir, Maze } from '../../src/core/types';
import { makeCharacter, mazeFromAscii } from '../helpers/fixtures';

// 9 x 3 tunnel row: the edge cells (0,1) and (8,1) are paired.
const L: Cell = { x: 0, y: 1 };
const R: Cell = { x: 8, y: 1 };

function tunnel(): Maze {
  const m = mazeFromAscii(['HHHHHHHHH', '.P.......', 'HHHHHHHHH']);
  return { ...m, wrapPairs: [[L, R]] };
}

function envOf(m: Maze): MoveEnv {
  return {
    width: m.width,
    height: m.height,
    tiles: m.tiles,
    doors: m.doors,
    doorMask: 0,
    wrapPairs: m.wrapPairs,
  };
}

/** Steps until the character's cell changes or `max` ticks pass; returns the character after the crossing. */
function stepUntilCellChanges(start: Character, env: MoveEnv, unitsPerTick: number, max = 100): Character {
  let c = start;
  for (let i = 0; i < max; i++) {
    const n = stepMovement(c, null, unitsPerTick, env);
    const moved = n.cell.x !== c.cell.x || n.cell.y !== c.cell.y;
    c = n;
    if (moved) return c;
  }
  throw new Error('character never changed cell');
}

describe('wrap pairs: movement', () => {
  it.each([
    { name: 'left edge to right edge', from: { x: 1, y: 1 }, dir: 'left' as Dir, expectCell: R, then: { x: 7, y: 1 } },
    { name: 'right edge to left edge', from: { x: 7, y: 1 }, dir: 'right' as Dir, expectCell: L, then: { x: 1, y: 1 } },
  ])('$name: placed at the paired Cell and keeps moving', ({ from, dir, expectCell, then }) => {
    const m = tunnel();
    const env = envOf(m);
    const units = 250;
    let c = makeCharacter('player', from, { dir });

    // Walk onto the wrap Cell's far side: the first cell change lands on the partner.
    // from -> edge cell is one step, which is itself a wrap boundary, so the partner is the landing Cell.
    c = stepUntilCellChanges(c, env, units);
    expect(c.cell).toEqual(expectCell);
    expect(c.dir).toBe(dir);
    expect(c.next).not.toBeNull();
    expect(c.progress).toBeGreaterThanOrEqual(0);
    expect(c.progress).toBeLessThan(CELL_UNITS);

    // It keeps going the same way and reaches the next Cell after the partner.
    c = stepUntilCellChanges(c, env, units);
    expect(c.cell).toEqual(then);
    expect(c.dir).toBe(dir);
  });

  it('does not teleport when there is no wrap pair', () => {
    const m = { ...tunnel(), wrapPairs: [] };
    const c = stepUntilCellChanges(makeCharacter('player', { x: 1, y: 1 }, { dir: 'left' }), envOf(m), 250);
    expect(c.cell).toEqual(L);
  });
});

describe('wrap pairs: pathfinding', () => {
  const idx = (m: Maze, c: Cell): number => c.y * m.width + c.x;

  it('distance across the wrap is shorter than the distance around', () => {
    const withWrap = tunnel();
    const without = { ...withWrap, wrapPairs: [] };
    const target = idx(withWrap, { x: 7, y: 1 });
    const start = idx(withWrap, { x: 1, y: 1 });

    const dWrap = computeDistanceField(withWrap, withWrap.tiles, 0, 0, [target]).dist[start]!;
    const dAround = computeDistanceField(without, without.tiles, 0, 0, [target]).dist[start]!;

    expect(dAround).toBe(6); // 1 -> 7 along the row
    expect(dWrap).toBe(3); // 1 -> 0, wrap to 8, 8 -> 7
    expect(dWrap).toBeLessThan(dAround);
  });

  it('works in both directions', () => {
    const m = tunnel();
    const a = idx(m, { x: 1, y: 1 });
    const b = idx(m, { x: 7, y: 1 });
    const fromB = computeDistanceField(m, m.tiles, 0, 0, [b]).dist[a]!;
    const fromA = computeDistanceField(m, m.tiles, 0, 0, [a]).dist[b]!;
    expect(fromB).toBe(3);
    expect(fromA).toBe(3);
  });
});

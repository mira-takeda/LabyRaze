import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_UNITS } from '../../src/core/config';
import { isPassable } from '../../src/core/grid';
import { stepMovement } from '../../src/core/movement';
import type { MoveEnv } from '../../src/core/movement';
import type { Cell, Character, Dir, Maze } from '../../src/core/types';
import { allFixtureMazes, makeCharacter, mazeFromAscii } from '../helpers/fixtures';

const UNITS = 125; // 8 Ticks per Cell

function envOf(maze: Maze, doorMask = (1 << maze.doors.length) - 1): MoveEnv {
  return {
    width: maze.width,
    height: maze.height,
    tiles: maze.tiles,
    doors: maze.doors,
    doorMask,
    wrapPairs: maze.wrapPairs,
  };
}

/** Runs `ticks` Ticks; `presses` maps tick index (0-based) to a pressed direction. */
function run(
  c: Character,
  env: MoveEnv,
  ticks: number,
  presses: Record<number, Dir> = {},
  units = UNITS,
): Character {
  let cur = c;
  for (let t = 0; t < ticks; t++) cur = stepMovement(cur, presses[t] ?? null, units, env);
  return cur;
}

const at = (c: Character): Cell => c.cell;

describe('stepMovement', () => {
  const junction = mazeFromAscii(['HHHHHH', 'P....H', 'HH.HHH', 'HH.HHH', 'HHHHHH']);

  it('does not mutate its input', () => {
    const env = envOf(junction);
    const c = makeCharacter('player', { x: 0, y: 1 });
    const snap = JSON.stringify(c);
    stepMovement(c, 'right', UNITS, env);
    expect(JSON.stringify(c)).toBe(snap);
  });

  it('moves one Cell in 8 Ticks at 125 units per Tick', () => {
    const env = envOf(junction);
    const c = run(makeCharacter('player', { x: 0, y: 1 }), env, 8, { 0: 'right' });
    expect(at(c)).toEqual({ x: 1, y: 1 });
    expect(c.progress).toBe(0);
  });

  it('takes a buffered turn at the next junction', () => {
    const env = envOf(junction);
    // Start right, press down early (wall below), the turn happens on reaching (2,1).
    let c = run(makeCharacter('player', { x: 0, y: 1 }), env, 3, { 0: 'right', 2: 'down' });
    expect(c.buffered).toBe('down');
    expect(c.dir).toBe('right');
    c = run(c, env, 13); // 16 Ticks total = two Cells; leftover step goes down
    expect(at(c)).toEqual({ x: 2, y: 1 });
    expect(c.dir).toBe('down');
    expect(c.buffered).toBeNull();
    expect(c.next).toEqual({ x: 2, y: 2 });
  });

  it('replaces the buffer with a newer press', () => {
    const env = envOf(junction);
    let c = run(makeCharacter('player', { x: 0, y: 1 }), env, 3, { 0: 'right', 1: 'down', 2: 'up' });
    expect(c.buffered).toBe('up'); // newest press wins
    c = run(c, env, 13);
    // 'up' at (2,1) is a wall, so the buffer is not taken and the character continues right.
    expect(c.dir).toBe('right');
    expect(c.buffered).toBe('up');
    expect(c.next).toEqual({ x: 3, y: 1 });
  });

  it('reverses immediately mid-step', () => {
    const env = envOf(junction);
    let c = run(makeCharacter('player', { x: 1, y: 1 }), env, 3, { 0: 'right' });
    expect(c.progress).toBe(375);
    c = stepMovement(c, 'left', UNITS, env);
    expect(c.dir).toBe('left');
    expect(at(c)).toEqual({ x: 2, y: 1 });
    expect(c.next).toEqual({ x: 1, y: 1 });
    // progress 375 -> reversed 625, then +125
    expect(c.progress).toBe(CELL_UNITS - 375 + UNITS);
  });

  it('holds at a wall', () => {
    const env = envOf(junction);
    const c = run(makeCharacter('player', { x: 3, y: 1 }), env, 40, { 0: 'right' });
    expect(at(c)).toEqual({ x: 4, y: 1 });
    expect(c.next).toBeNull();
    expect(c.progress).toBe(0);
    expect(c.dir).toBe('right');
  });

  describe('closed door', () => {
    const doorMaze = mazeFromAscii(['HHHHHHH', 'P..D..U', 'HHHHHHH']);

    it('holds before a closed Door and resumes when it opens', () => {
      const closed = envOf(doorMaze, 0);
      const open = envOf(doorMaze, 1);
      let c = run(makeCharacter('player', { x: 1, y: 1 }), closed, 40, { 0: 'right' });
      expect(at(c)).toEqual({ x: 2, y: 1 });
      expect(c.next).toBeNull();
      expect(c.progress).toBe(0);
      c = run(c, open, 8);
      expect(at(c)).toEqual({ x: 3, y: 1 });
      c = run(c, open, 8);
      expect(at(c)).toEqual({ x: 4, y: 1 });
    });
  });

  it('places the character at the paired Cell on entering a wrap Cell', () => {
    const m = mazeFromAscii(['HHHHHHHH', 'P.H..H.H', 'HHHHHHHH']);
    const maze: Maze = {
      ...m,
      wrapPairs: [
        [
          { x: 1, y: 1 },
          { x: 6, y: 1 },
        ],
      ],
    };
    const env = envOf(maze);
    const c = run(makeCharacter('player', { x: 0, y: 1 }), env, 8, { 0: 'right' });
    expect(at(c)).toEqual({ x: 6, y: 1 });
  });

  it('carries leftover units across a boundary and crosses at most one per Tick', () => {
    const env = envOf(junction);
    const units = 499;
    let c = makeCharacter('player', { x: 0, y: 1 });
    c = stepMovement(c, 'right', units, env); // 499
    c = stepMovement(c, null, units, env); // 998
    c = stepMovement(c, null, units, env); // 1497 -> cell 1, leftover 497
    expect(at(c)).toEqual({ x: 1, y: 1 });
    expect(c.progress).toBe(497);
  });
});

describe('stepMovement properties', () => {
  const dirArb = fc.constantFrom<Dir | null>('up', 'down', 'left', 'right', null);

  it('never ends in a wall or closed Door, progress stays in [0, CELL_UNITS)', () => {
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
    const mazes = allFixtureMazes();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: mazes.length - 1 }),
        fc.constantFrom(125, 200, 333, 499),
        fc.array(fc.tuple(dirArb, fc.integer({ min: 0, max: 7 })), { minLength: 1, maxLength: 150 }),
        (mi, units, seq) => {
          const maze = mazes[mi]!;
          let c = makeCharacter('player', maze.playerStart);
          let mask = (1 << maze.doors.length) - 1;
          for (const [press, newMask] of seq) {
            // Door schedule stand-in: never close a Door the character occupies or enters.
            let m = newMask & ((1 << maze.doors.length) - 1);
            for (let i = 0; i < maze.doors.length; i++) {
              const d = maze.doors[i]!.cell;
              const busy = (d.x === c.cell.x && d.y === c.cell.y) || (c.next && d.x === c.next.x && d.y === c.next.y);
              if (busy) m |= 1 << i;
            }
            mask = m;
            const env = envOf(maze, mask);
            c = stepMovement(c, press, units, env);
            if (!(c.progress >= 0 && c.progress < CELL_UNITS)) return false;
            if (!isPassable(maze.tiles, maze.width, maze.height, maze.doors, mask, c.cell.x, c.cell.y)) return false;
            if (c.next && !isPassable(maze.tiles, maze.width, maze.height, maze.doors, mask, c.next.x, c.next.y)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

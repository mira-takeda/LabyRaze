// Helpers for Ghost Hunt tests through `step`.
import { CELL_UNITS } from '../../src/core/config';
import { isPassable } from '../../src/core/grid';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Cell, Dir, GameState } from '../../src/core/types';

const DIRS: Array<[Dir, number, number]> = [
  ['up', 0, -1],
  ['right', 1, 0],
  ['down', 0, 1],
  ['left', -1, 0],
];
const BACK: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** The Player one unit before arriving on `target` from a passable neighbour. */
export function playerArriving(s: GameState, target: Cell): GameState {
  for (const [dir, dx, dy] of DIRS) {
    const n = { x: target.x + dx, y: target.y + dy };
    if (!isPassable(s.walls.tiles, s.maze.width, s.maze.height, s.maze.doors, s.derived.doorMask, n.x, n.y)) continue;
    return {
      ...s,
      player: { ...s.player, cell: n, next: { ...target }, dir: BACK[dir], buffered: null, progress: CELL_UNITS - 1 },
    };
  }
  throw new Error('no passable neighbour');
}

/** Puts a Ghost_Hunt item on `cell` (keeps the floor counter consistent). */
export function placeGhostHunt(s: GameState, cell: Cell): GameState {
  const kinds = s.items.kinds.slice();
  const i = cell.y * s.maze.width + cell.x;
  const had = kinds[i];
  kinds[i] = ItemKind.GhostHunt;
  const delta = had === ItemKind.GhostHunt ? 0 : 1;
  const ordinaryDelta = had === ItemKind.Ordinary ? 1 : 0;
  return {
    ...s,
    items: {
      ...s.items,
      kinds,
      ghostHuntOnFloor: s.items.ghostHuntOnFloor + delta,
      ordinaryRemaining: s.items.ordinaryRemaining - ordinaryDelta,
    },
  };
}

/** A Floor Cell far from the Hunter that holds no Key: used to place items. */
export function freeCell(s: GameState, avoid: Cell[] = []): Cell {
  const bad = new Set([...avoid, ...s.items.keys, s.maze.cage.entrance].map((c) => `${c.x},${c.y}`));
  for (const c of s.maze.ordinary) if (!bad.has(`${c.x},${c.y}`)) return c;
  throw new Error('no free cell');
}

export function withState(run: Run, s: GameState): Run {
  return { ...run, state: s };
}

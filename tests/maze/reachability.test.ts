import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import { Tile } from '../../src/core/types';
import type { Cell, Maze } from '../../src/core/types';

// Independent BFS (does not use validate.ts).
function passable(t: number): boolean {
  return t === Tile.Floor || t === Tile.CageInterior || t === Tile.CageGate || t === Tile.Door;
}

function reach(maze: Maze, from: Cell, closed: ReadonlySet<number>): Set<number> {
  const { width: w, height: h, tiles } = maze;
  const wrap = new Map<number, number[]>();
  for (const [a, b] of maze.wrapPairs) {
    const ia = a.y * w + a.x;
    const ib = b.y * w + b.x;
    wrap.set(ia, [...(wrap.get(ia) ?? []), ib]);
    wrap.set(ib, [...(wrap.get(ib) ?? []), ia]);
  }
  const ok = (i: number) => passable(tiles[i]!) && !closed.has(i);
  const start = from.y * w + from.x;
  const seen = new Set<number>();
  if (!ok(start)) return seen;
  seen.add(start);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % w;
    const y = (i - x) / w;
    const nbrs: number[] = [...(wrap.get(i) ?? [])];
    if (x > 0) nbrs.push(i - 1);
    if (x < w - 1) nbrs.push(i + 1);
    if (y > 0) nbrs.push(i - w);
    if (y < h - 1) nbrs.push(i + w);
    for (const n of nbrs) {
      if (!seen.has(n) && ok(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

const idx = (m: Maze, c: Cell) => c.y * m.width + c.x;

function check(maze: Maze, closedCells: number[]): string | null {
  const closed = new Set(closedCells);
  const p = reach(maze, maze.playerStart, closed);
  const hu = reach(maze, maze.hunterStart, closed);
  const need = (set: Set<number>, cells: Cell[], label: string): string | null => {
    for (const c of cells) if (!set.has(idx(maze, c))) return `${label} (${c.x},${c.y}) unreachable`;
    return null;
  };
  const everything: Array<[Cell[], string]> = [
    [maze.keys, 'key'],
    [[maze.cage.entrance], 'cage entrance'],
    [maze.power, 'power'],
    [maze.speed, 'speed'],
    [maze.bombs, 'bomb'],
    [maze.ghostHunt, 'ghostHunt'],
    [maze.ordinary, 'ordinary'],
    [maze.wisps, 'wisp'],
    [[maze.playerStart, maze.hunterStart], 'start'],
  ];
  for (const [cells, label] of everything) {
    const e = need(p, cells, `player->${label}`) ?? need(hu, cells, `hunter->${label}`);
    if (e) return e;
  }
  return null;
}

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('maze reachability', () => {
  it('Feature: kirobit-halloween-maze, Property 8: Maze connectivity and reachability', () => {
    // **Validates: Requirements 5.9**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), fc.integer({ min: 1, max: 200 }), (seed, level) => {
        const maze = generateMaze(seed, level, DEFAULT_CONFIG);
        const doors = maze.doors.map((d) => idx(maze, d.cell));

        // All passable cells connected with every door open.
        const all = reach(maze, maze.playerStart, new Set());
        let passableCount = 0;
        for (let i = 0; i < maze.tiles.length; i++) if (passable(maze.tiles[i]!)) passableCount++;
        expect(all.size).toBe(passableCount);

        // All doors open, every single closure, every pair closure.
        expect(check(maze, [])).toBeNull();
        for (let a = 0; a < doors.length; a++) {
          expect(check(maze, [doors[a]!])).toBeNull();
          for (let b = a + 1; b < doors.length; b++) {
            expect(check(maze, [doors[a]!, doors[b]!])).toBeNull();
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});

// Property 33: Destruction only improves connectivity and Door safety (task 17.9).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { detonate } from '../../src/core/bombs';
import { rebuildDerived } from '../../src/core/doors';
import { isPassable } from '../../src/core/grid';
import { UNREACHABLE, computeDistanceField } from '../../src/core/pathfinding';
import type { Cell, GameState } from '../../src/core/types';
import { arbBombScenario } from '../helpers/arbitraries';

function exits(s: GameState, tiles: Uint8Array, c: Cell, mask: number): number {
  let n = 0;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    if (isPassable(tiles, s.maze.width, s.maze.height, s.maze.doors, mask, c.x + dx, c.y + dy)) n++;
  }
  return n;
}

describe('Property 33: destruction only improves connectivity', () => {
  it('reachability, component structure, objective connectivity and restore times never get worse', () => {
    fc.assert(
      fc.property(arbBombScenario, ({ maze, state, radius }) => {
        const objectives: Cell[] = [...state.items.keys, maze.cage.entrance];
        const before = rebuildDerived(state.walls, maze.doors, maze, objectives);
        const blast = detonate(state.walls, maze.width, maze.height, state.player, radius);
        const after = rebuildDerived(blast.walls, maze.doors, maze, objectives);
        const masks = 1 << maze.doors.length;
        const w = maze.width;
        const p = state.player.cell.y * w + state.player.cell.x;

        for (let m = 0; m < masks; m++) {
          // Fewer (or equal) objective components and no longer restore time.
          expect(after.connectivity[m]!).toBeLessThanOrEqual(before.connectivity[m]!);
          expect(after.restoreTicks[m]!).toBeLessThanOrEqual(before.restoreTicks[m]!);

          // Connected pairs only grow: every component before maps into a single component after.
          const lb = before.labels[m]!;
          const la = after.labels[m]!;
          const image = new Map<number, number>();
          for (let i = 0; i < lb.length; i++) {
            if (lb[i]! < 0) continue;
            expect(la[i]!).toBeGreaterThanOrEqual(0);
            const prev = image.get(lb[i]!);
            if (prev === undefined) image.set(lb[i]!, la[i]!);
            else expect(la[i]!).toBe(prev);
          }

          // Everything reachable from the Player before is reachable after.
          const fb = computeDistanceField(maze, state.walls.tiles, m, 0, [p]);
          const fa = computeDistanceField(maze, blast.walls.tiles, m, 1, [p]);
          for (let i = 0; i < fb.dist.length; i++) {
            if (fb.dist[i] !== UNREACHABLE) expect(fa.dist[i]).not.toBe(UNREACHABLE);
          }
        }

        // No character that had an exit loses it.
        const all = masks - 1;
        for (const c of [state.player.cell, state.hunter.cell]) {
          expect(exits(state, blast.walls.tiles, c, all)).toBeGreaterThanOrEqual(exits(state, state.walls.tiles, c, all));
        }
      }),
      { numRuns: 120 },
    );
  }, 120_000);
});

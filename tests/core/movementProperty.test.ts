// Property 4: Movement stays on passable Cells (task 17.17).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import { Tile } from '../../src/core/types';
import type { Cell, GameState } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

function solid(s: GameState, c: Cell): boolean {
  const t = s.walls.tiles[c.y * s.maze.width + c.x];
  return t === Tile.Wall || t === Tile.WallHard;
}

describe('Property 4: movement stays on passable Cells', () => {
  it('characters never stand on or move into a wall, and steps are between adjacent Cells', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 20, maxLength: 300 }), (seed, inputs) => {
        let run = createRun(seed, DEFAULT_CONFIG);
        run = { ...run, state: { ...run.state, lives: 1_000_000 } };
        for (let t = 0; t < 1500 && run.state.phase === 'playing'; t++) {
          run = step(run, { ...inputs[t % inputs.length]!, continue: false }).run;
          const s = run.state;
          for (const c of [s.player, s.hunter]) {
            expect(solid(s, c.cell)).toBe(false);
            if (c.next) {
              expect(solid(s, c.next)).toBe(false);
              const d = Math.abs(c.next.x - c.cell.x) + Math.abs(c.next.y - c.cell.y);
              const wrap = s.maze.wrapPairs.some(([a, b]) => (a.x === c.next!.x && a.y === c.next!.y) || (b.x === c.next!.x && b.y === c.next!.y));
              expect(d === 1 || wrap).toBe(true);
            }
            expect(c.progress).toBeGreaterThanOrEqual(0);
            expect(c.progress).toBeLessThan(1000);
          }
        }
      }),
      { numRuns: 30 },
    );
  }, 120_000);
});

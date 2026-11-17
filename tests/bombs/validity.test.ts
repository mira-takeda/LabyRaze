// Property 34: State is valid after every explosion (task 17.10).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { openMask, rebuildDerived } from '../../src/core/doors';
import { findInvariantViolations } from '../../src/core/invariants';
import { UNREACHABLE, computeDistanceField } from '../../src/core/pathfinding';
import { createRun, step } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Cell, GameState } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;

/** Every Key and Ordinary/special item reachable from the Player with all Doors open. */
function allReachable(s: GameState): boolean {
  const w = s.maze.width;
  const all = (1 << s.maze.doors.length) - 1;
  const f = computeDistanceField(s.maze, s.walls.tiles, all, s.walls.version, [s.player.cell.y * w + s.player.cell.x]);
  for (const k of s.items.keys) if (f.dist[k.y * w + k.x] === UNREACHABLE) return false;
  for (let i = 0; i < s.items.kinds.length; i++) {
    if (s.items.kinds[i] !== ItemKind.None && f.dist[i] === UNREACHABLE) return false;
  }
  return true;
}

describe('Property 34: state is valid after every explosion', () => {
  it('random detonation sequences keep the state valid and the tables fresh', () => {
    fc.assert(
      fc.property(
        arbSeed,
        fc.array(arbInput, { minLength: 30, maxLength: 200 }),
        fc.array(fc.integer({ min: 1, max: 600 }), { minLength: 1, maxLength: 6 }),
        (seed, inputs, bombTicks) => {
          let run = createRun(seed, cfg);
          run = { ...run, state: { ...run.state, lives: 1_000_000 } };
          const bombAt = new Set(bombTicks);
          let detonations = 0;
          for (let t = 0; t < 700 && run.state.phase === 'playing'; t++) {
            const pressBomb = bombAt.has(t);
            // Grant a Bomb so the press always detonates.
            if (pressBomb) run = { ...run, state: { ...run.state, bombs: Math.max(1, run.state.bombs) } };
            const keysBefore: Cell[] = run.state.items.keys.map((k) => ({ ...k }));
            const r = step(run, { ...inputs[t % inputs.length]!, bomb: pressBomb, continue: false });
            const s = r.run.state;
            expect(findInvariantViolations(s, cfg), `tick ${s.tick}`).toEqual([]);
            expect(allReachable(s), `reachability at tick ${s.tick}`).toBe(true);
            if (r.events.some((e) => e.t === 'WallsDestroyed')) {
              detonations++;
              const fresh = rebuildDerived(s.walls, s.maze.doors, s.maze, [...keysBefore, s.maze.cage.entrance]);
              expect(s.derived.connectivity).toEqual(fresh.connectivity);
              expect(s.derived.restoreTicks).toEqual(fresh.restoreTicks);
              expect(s.derived.doorMask).toBe(openMask(s.doors));
            }
            run = r.run;
          }
          return detonations >= 0;
        },
      ),
      { numRuns: 30 },
    );
  }, 180_000);
});

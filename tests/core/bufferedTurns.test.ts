// Property 5: Buffered turn semantics through `step` (task 17.18).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { dirDx, dirDy, isPassable } from '../../src/core/grid';
import { createRun, step } from '../../src/core/sim';
import type { Dir, GameState } from '../../src/core/types';
import { arbPressed, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;

function canGo(s: GameState, d: Dir): boolean {
  const c = s.player.cell;
  return isPassable(s.walls.tiles, s.maze.width, s.maze.height, s.maze.doors, s.derived.doorMask, c.x + dirDx(d), c.y + dirDy(d));
}

describe('Property 5: buffered turns', () => {
  it('the buffer holds the latest unfulfilled press and is consumed at the first possible boundary', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbPressed, { minLength: 50, maxLength: 600 }), (seed, presses) => {
        let run = createRun(seed, cfg);
        run = { ...run, state: { ...run.state, lives: 1_000_000, player: { ...run.state.player, invulnerable: 1e9 } } };
        let lastPress: Dir | null = null;
        for (let t = 0; t < presses.length && run.state.phase === 'playing'; t++) {
          const pressed = presses[t]!;
          if (pressed !== null) lastPress = pressed;
          const before = run.state.player;
          const r = step(run, { pressed, bomb: false, continue: false });
          const s = r.run.state;
          const p = s.player;
          // The buffer is empty or holds the most recent press.
          if (p.buffered !== null) expect(p.buffered).toBe(lastPress);
          // At a boundary (a new step just started or the Player is held), a remaining buffer
          // must be impossible from the current Cell; otherwise it would have been taken.
          // (A non-empty buffer rules out a mid-step reverse this Tick, which clears it.)
          const crossed = p.cell.x !== before.cell.x || p.cell.y !== before.cell.y;
          if (p.buffered !== null && (crossed || p.next === null)) {
            expect(canGo(s, p.buffered), `buffer ${p.buffered} possible at tick ${s.tick}`).toBe(false);
          }
          // A taken buffer leaves the buffer empty and the heading equal to it.
          if (before.buffered !== null && p.buffered === null && pressed === null && p.dir !== before.dir) {
            expect(p.dir).toBe(before.buffered);
          }
          run = r.run;
        }
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});

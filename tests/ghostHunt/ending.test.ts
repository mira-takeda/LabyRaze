// Property 40: Ghost Hunt ends cleanly (task 17.14).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_UNITS, DEFAULT_CONFIG } from '../../src/core/config';
import { unitsPerTick } from '../../src/core/progression';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { GameState, Input } from '../../src/core/types';
import { freeCell, placeGhostHunt, playerArriving, withState } from './stepHelpers';

const IDLE: Input = { pressed: null, bomb: false, continue: false };

/** Starts a Ghost Hunt with `released` Captives already rescued (Keys kept consistent). */
function huntWith(seed: number, released: number, ghostHuntTicks: number): Run {
  const cfg = { ...DEFAULT_CONFIG, ghostHuntTicks };
  const run0 = createRun(seed, cfg);
  const captives: [boolean, boolean, boolean] = [released > 0, released > 1, released > 2];
  let s: GameState = { ...run0.state, captives, items: { ...run0.state.items, keys: run0.state.items.keys.slice(released) } };
  const at = freeCell(s);
  s = playerArriving(placeGhostHunt(s, at), at);
  s = { ...s, player: { ...s.player, invulnerable: 1e9 }, lives: 1_000_000 };
  const r = step(withState(run0, s), IDLE);
  expect(r.run.state.ghostHunt.ticksLeft).toBe(ghostHuntTicks);
  return r.run;
}

describe('Property 40: Ghost Hunt ends cleanly', () => {
  it('after expiry every ally is inactive within the bound; rescue state never changes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 30, max: 240 }), (seed, released, dur) => {
        let run = huntWith(seed, released, dur);
        const captives = [...run.state.captives];
        const carried = run.state.carriedKeys;
        let expiredAt = -1;
        const ticksPerCell = Math.ceil(CELL_UNITS / unitsPerTick(1, run.cfg));
        const bound = run.state.maze.width * run.state.maze.height * ticksPerCell + run.cfg.allyLeaveTicks;
        let keys = carried;
        for (let t = 0; t < dur + bound + 5 && run.state.phase === 'playing'; t++) {
          const r = step(run, IDLE);
          if (r.events.some((e) => e.t === 'GhostHuntEnded' && e.reason === 'expired')) expiredAt = t;
          run = r.run;
          // Rescue state is untouched; carried Keys change only through Key pickups (the
          // coasting Player may walk over a Key), never through the Ghost Hunt.
          expect(run.state.captives).toEqual(captives);
          keys += r.events.filter((e) => e.t === 'KeyCollected').length;
          expect(run.state.carriedKeys).toBe(keys);
          if (expiredAt >= 0 && run.state.ghostHunt.allies.every((a) => a.mode === 'inactive')) break;
        }
        if (run.state.phase !== 'playing') return; // the level ended first (covered below)
        expect(expiredAt).toBeGreaterThanOrEqual(0);
        const s = run.state;
        expect(s.ghostHunt.ticksLeft).toBe(0);
        s.ghostHunt.allies.forEach((a, i) => {
          expect(a.mode).toBe('inactive');
          if (!s.captives[i]) {
            // Imprisoned again: back in the Cage. A walked-back ally rests on its interior Cell;
            // one that never spawned is reset to the entrance like every inactive ally at level
            // start (inactive allies are not in the open Maze; the Renderer draws Captives in the Cage).
            const inCage = s.maze.cage.interior.some((c) => c.x === a.cell.x && c.y === a.cell.y);
            const atEntrance = a.cell.x === s.maze.cage.entrance.x && a.cell.y === s.maze.cage.entrance.y;
            expect(inCage || atEntrance, `ally ${i} at ${a.cell.x},${a.cell.y}`).toBe(true);
          }
        });
      }),
      { numRuns: 12 },
    );
  }, 180_000);

  it('a level that ends during the hunt empties the state in the same Tick and the next level starts empty', () => {
    let run = huntWith(81, 2, 480);
    // The Player carries the last Key and steps onto the Cage entrance while allies hunt.
    const s0 = run.state;
    const entrance = s0.maze.cage.entrance;
    let s: GameState = { ...s0, carriedKeys: 1, items: { ...s0.items, keys: [] } };
    s = playerArriving(s, entrance);
    const r = step(withState(run, s), IDLE);
    expect(r.run.state.phase).toBe('levelEnd');
    expect(r.run.state.outcome).toBe('playerWin');
    expect(r.events).toContainEqual({ t: 'GhostHuntEnded', reason: 'levelEnd' });
    expect(r.run.state.ghostHunt.ticksLeft).toBe(0);
    expect(r.run.state.ghostHunt.allies.every((a) => a.mode === 'inactive')).toBe(true);
    run = step(r.run, { ...IDLE, continue: true }).run;
    expect(run.state.levelNumber).toBe(2);
    expect(run.state.ghostHunt.ticksLeft).toBe(0);
    expect(run.state.ghostHunt.allies.every((a) => a.mode === 'inactive')).toBe(true);
  });
});

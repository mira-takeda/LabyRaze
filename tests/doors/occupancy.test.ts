// Property 11: Doors never trap a character (task 17.6).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Cell, Character, GameState, Input } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

const same = (a: Cell | null, b: Cell): boolean => a !== null && a.x === b.x && a.y === b.y;

function onClosedDoor(s: GameState, c: Character): number {
  for (let i = 0; i < s.maze.doors.length; i++) {
    if (s.doors[i]!.open) continue;
    const d = s.maze.doors[i]!.cell;
    if (same(c.cell, d) || (c.progress > 0 && same(c.next, d))) return i;
  }
  return -1;
}

describe('Property 11: Doors never trap a character', () => {
  it('no character occupies a closed Door Cell under random play', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 20, maxLength: 300 }), (seed, inputs) => {
        let run = createRun(seed, cfg);
        run = { ...run, state: { ...run.state, lives: 1_000_000 } };
        for (let t = 0; t < 2500 && run.state.phase === 'playing'; t++) {
          run = step(run, { ...inputs[t % inputs.length]!, continue: false }).run;
          const s = run.state;
          expect(onClosedDoor(s, s.player), `player on closed door at tick ${s.tick}`).toBe(-1);
          if (s.hunter.respawnIn <= 0) expect(onClosedDoor(s, s.hunter), `hunter on closed door at tick ${s.tick}`).toBe(-1);
        }
      }),
      { numRuns: 30 },
    );
  }, 180_000);

  it('a character on the Door Cell at the closing Tick delays the close until the Cell is empty', () => {
    const run0 = createRun(51, cfg);
    expect(run0.state.maze.doors.length).toBeGreaterThan(0);
    // Find the first scheduled close of Door 0 by stepping an untouched copy.
    let probe: Run = { ...run0, state: { ...run0.state, hunter: { ...run0.state.hunter, respawnIn: 1e9 } } };
    let closeTick = -1;
    for (let t = 0; t < 2000; t++) {
      const r = step(probe, IDLE);
      if (r.events.some((e) => e.t === 'DoorChanged' && e.doorIndex === 0 && !e.open)) {
        closeTick = r.run.state.tick;
        break;
      }
      probe = r.run;
    }
    expect(closeTick).toBeGreaterThan(0);

    // Same run, but park the Player on Door 0 for 50 Ticks around the close.
    const door = run0.state.maze.doors[0]!.cell;
    let run: Run = { ...run0, state: { ...run0.state, hunter: { ...run0.state.hunter, respawnIn: 1e9 } } };
    const park = (r: Run): Run => ({
      ...r,
      state: { ...r.state, player: { ...r.state.player, cell: { ...door }, next: null, progress: 0, dir: null, buffered: null } },
    });
    let closedAt = -1;
    for (let t = 0; t < closeTick + 400; t++) {
      const parked = run.state.tick >= closeTick - 5 && run.state.tick < closeTick + 50;
      if (parked) run = park(run);
      const r = step(run, IDLE);
      if (r.events.some((e) => e.t === 'DoorChanged' && e.doorIndex === 0 && !e.open)) {
        closedAt = r.run.state.tick;
        break;
      }
      if (parked) expect(r.run.state.doors[0]!.open).toBe(true);
      // Leave the Door Cell after the parking window.
      run = r.run;
      if (run.state.tick === closeTick + 50) {
        run = { ...run, state: { ...run.state, player: { ...run.state.player, cell: { ...run.state.maze.playerStart } } } };
      }
    }
    // Either the close was postponed past the parking window or skipped entirely (reopen too close).
    if (closedAt >= 0) expect(closedAt).toBeGreaterThan(closeTick + 49);
  }, 60_000);
});

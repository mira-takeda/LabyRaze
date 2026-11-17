// Property 35: Pathfinding refreshes in the same Tick as the explosion (task 17.11).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { rebuildDerived } from '../../src/core/doors';
import { createHunterBrain } from '../../src/core/hunter';
import { initialProgression } from '../../src/core/progression';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { GameState, Input } from '../../src/core/types';
import { arbSeed } from '../helpers/arbitraries';
import { buildState, mazeFromAscii } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const BOMB: Input = { pressed: null, bomb: true, continue: false };

describe('Property 35: pathfinding refresh after explosions', () => {
  it('a destroying blast bumps walls.version and the Hunter decides as if its route were fresh', () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 0, max: 400 }), (seed, warm) => {
        let run = createRun(seed, cfg);
        run = { ...run, state: { ...run.state, lives: 1_000_000 } };
        for (let t = 0; t < warm && run.state.phase === 'playing'; t++) run = step(run, IDLE).run;
        if (run.state.phase !== 'playing') return;
        const armed: Run = { ...run, state: { ...run.state, bombs: 1 } };
        const r = step(armed, BOMB);
        const destroyed = r.events.some((e) => e.t === 'WallsDestroyed');
        if (destroyed) {
          expect(r.run.state.walls.version).toBe(armed.state.walls.version + 1);
          expect(r.run.state.derived.fieldVersion).toBe(r.run.state.walls.version);
          // Same Tick with a cleared committed target gives the identical decision.
          const fresh = step({ ...armed, brain: { ...armed.brain, target: -1 } }, BOMB);
          expect(r.run.brain).toEqual(fresh.run.brain);
          expect(r.run.state.hunter).toEqual(fresh.run.state.hunter);
        } else {
          expect(r.run.state.walls).toBe(armed.state.walls);
          expect(r.run.state.walls.version).toBe(armed.state.walls.version);
        }
      }),
      { numRuns: 40 },
    );
  }, 120_000);

  it('Squareman takes the new shortcut right after the blast', () => {
    // Hunter U at (1,1) behind a destructible wall; the only pellets lie to the right of it.
    const maze = mazeFromAscii([
      'HHHHHHHHH',
      'HU#P....H',
      'H.#HHHH.H',
      'H.......H',
      'HHHHHHHHH',
    ]);
    const small: GameConfig = { ...cfg, bombRadius: 1, mazeSize: { w: 9, h: 5 }, doorCount: 0 };
    const base = buildState(maze, { config: small });
    const kinds = new Uint8Array(base.items.kinds.length);
    for (const x of [4, 5, 6, 7]) kinds[1 * maze.width + x] = ItemKind.Ordinary;
    const objectives = [...base.items.keys, maze.cage.entrance];
    const state: GameState = {
      ...base,
      bombs: 1,
      items: { ...base.items, kinds, ordinaryRemaining: 4 },
      derived: rebuildDerived(base.walls, maze.doors, maze, objectives),
      player: { ...base.player, invulnerable: 10_000 },
    };
    const run: Run = { state, brain: createHunterBrain(1, 1), progression: initialProgression(small), runSeed: 1, cfg: small, celebratedUpTo: 0 };

    const without = step(run, IDLE).run.state.hunter;
    expect(without.dir).toBe('down'); // the long way round

    const r = step(run, BOMB);
    expect(r.events).toContainEqual({ t: 'WallsDestroyed', cells: [{ x: 2, y: 1 }] });
    // The decision on the blast Tick (or the next) already uses the opening.
    const next = step(r.run, IDLE).run.state.hunter;
    expect([r.run.state.hunter.dir, next.dir]).toContain('right');
    expect(next.dir).toBe('right');
  });
});

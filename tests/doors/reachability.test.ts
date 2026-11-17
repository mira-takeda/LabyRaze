// Property 12: Door reachability and confinement bounds (task 17.7).
// Drives the real Door schedule with the real reachability gate (as `step` does) for a
// long horizon; connectivity is read from the exact per-mask component labels.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createReachabilityGate, initDoors, openMask, rebuildDerived, stepDoors } from '../../src/core/doors';
import type { DoorOccupants } from '../../src/core/doors';
import { generateMaze } from '../../src/core/maze/generate';
import type { Cell } from '../../src/core/types';
import { arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const HORIZON = 4000;

describe('Property 12: door reachability and confinement bounds', () => {
  it('no objective stays disconnected from the Player, and no character stays confined, beyond maxDisconnectTicks', () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 1, max: 50 }), fc.nat({ max: 10_000 }), fc.nat({ max: 10_000 }), (seed, level, pp, hp) => {
        const maze = generateMaze(seed, level, cfg);
        if (maze.doors.length === 0) return;
        const walls = { tiles: maze.tiles.slice(), version: 0, destroyed: 0 };
        const objectives: Cell[] = [...maze.keys, maze.cage.entrance];
        const tables = rebuildDerived(walls, maze.doors, maze, objectives);
        const gate = createReachabilityGate(tables, maze.doors, maze, objectives, cfg.maxDisconnectTicks);
        // Park the characters on arbitrary floor Cells (pellet Cells are always floor).
        const floor = maze.ordinary;
        const player = floor[pp % floor.length]!;
        const hunter = floor[hp % floor.length]!;
        const occ: DoorOccupants = { player: { cell: player, next: null }, hunter: { cell: hunter, next: null } };
        const w = maze.width;
        const watched: Cell[] = [...objectives, ...maze.ordinary];
        const apart = new Int32Array(watched.length);
        let confinedP = 0;
        let confinedH = 0;

        let doors = initDoors(maze.doors, 0, cfg);
        for (let t = 1; t <= HORIZON; t++) {
          doors = stepDoors(maze.doors, doors, t, occ, cfg, [gate]).doors;
          const lab = tables.labels[openMask(doors)]!;
          const pl = lab[player.y * w + player.x]!;
          for (let i = 0; i < watched.length; i++) {
            const c = watched[i]!;
            apart[i] = lab[c.y * w + c.x] === pl ? 0 : apart[i]! + 1;
            // expect() only on a violation: millions of passing expects would dominate the run time.
            if (apart[i]! > cfg.maxDisconnectTicks) {
              expect(apart[i]!, `seed ${seed} level ${level} cell ${c.x},${c.y} tick ${t}`).toBeLessThanOrEqual(cfg.maxDisconnectTicks);
            }
          }
          // Confined: the character's component holds no objective (it cannot make progress).
          const inWith = (l: number): boolean => objectives.some((o) => lab[o.y * w + o.x] === l);
          confinedP = inWith(pl) ? 0 : confinedP + 1;
          const hl = lab[hunter.y * w + hunter.x]!;
          confinedH = inWith(hl) ? 0 : confinedH + 1;
          if (confinedP > cfg.maxDisconnectTicks || confinedH > cfg.maxDisconnectTicks) {
            expect({ confinedP, confinedH, tick: t }).toEqual({ confinedP: 0, confinedH: 0, tick: t });
          }
        }
      }),
      { numRuns: 200 },
    );
  }, 300_000);
});

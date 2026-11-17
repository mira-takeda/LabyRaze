// Property 36: Player-only items are never collected by Squareman (task 17.12).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Input } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const PLAYER_ONLY = new Set<number>([ItemKind.Bomb, ItemKind.GhostHunt, ItemKind.Wisp]);

describe('Property 36: Player-only items are never collected by Squareman', () => {
  it('a Bomb, Ghost_Hunt item or Wisp the Hunter walks over stays and changes nothing', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        let run = createRun(seed, cfg);
        // The Player stays parked far away (at its start, invulnerable) so only the Hunter moves.
        run = { ...run, state: { ...run.state, lives: 1_000_000, player: { ...run.state.player, invulnerable: 1e9 } } };
        let entered = 0;
        for (let t = 0; t < 2500 && run.state.phase === 'playing'; t++) {
          const before = run.state;
          const r = step(run, { pressed: null, bomb: false, continue: false });
          const s = r.run.state;
          const h = s.hunter.cell;
          const i = h.y * s.maze.width + h.x;
          const kindBefore = before.items.kinds[i]!;
          const playerHere = s.player.cell.x === h.x && s.player.cell.y === h.y;
          if (PLAYER_ONLY.has(kindBefore) && !playerHere && (before.hunter.cell.x !== h.x || before.hunter.cell.y !== h.y)) {
            entered++;
            expect(s.items.kinds[i]).toBe(kindBefore);
            expect(s.bombs).toBe(before.bombs);
            expect(s.ghostHunt.ticksLeft).toBe(Math.max(0, before.ghostHunt.ticksLeft - (before.ghostHunt.ticksLeft > 0 ? 1 : 0)));
            expect(s.comboCount).toBe(before.comboCount);
          }
          expect(r.events.some((e) => e.t === 'BombCollected' || e.t === 'WispCollected' || e.t === 'GhostHuntStarted')).toBe(false);
          run = r.run;
        }
        return entered >= 0;
      }),
      { numRuns: 20 },
    );
  }, 120_000);

  it('a detonation destroys no pellet and does not move, damage or delay Squareman', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 10, maxLength: 100 }), fc.integer({ min: 1, max: 300 }), (seed, inputs, at) => {
        let run: Run = createRun(seed, cfg);
        run = { ...run, state: { ...run.state, lives: 1_000_000 } };
        for (let t = 0; t < at && run.state.phase === 'playing'; t++) {
          run = step(run, { ...inputs[t % inputs.length]!, bomb: false, continue: false }).run;
        }
        if (run.state.phase !== 'playing') return;
        const armed: Run = { ...run, state: { ...run.state, bombs: 1 } };
        const input: Input = { pressed: null, bomb: false, continue: false };
        const quiet = step(armed, input).run.state;
        const boom = step(armed, { ...input, bomb: true });
        const s = boom.run.state;
        // Pellets: only the Hunter's own pickups of this Tick change them, exactly as without the blast.
        expect(s.items.ordinaryRemaining).toBe(quiet.items.ordinaryRemaining);
        // Hunter is not damaged or delayed by the blast itself.
        expect(s.hunter.respawnIn).toBe(quiet.hunter.respawnIn);
        expect(s.hunter.invulnerable).toBe(quiet.hunter.invulnerable);
        expect(s.hunter.power).toBe(quiet.hunter.power);
        if (!boom.events.some((e) => e.t === 'WallsDestroyed')) {
          // Nothing destroyed: the Hunter moves exactly as without the blast.
          expect(s.hunter).toEqual(quiet.hunter);
        }
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});

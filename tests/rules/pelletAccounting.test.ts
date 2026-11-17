// Property 15: Pellet accounting and Hunter win (task 17.2).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { GameState, Input } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

function countOrdinary(s: GameState): number {
  let n = 0;
  for (const k of s.items.kinds) if (k === ItemKind.Ordinary) n++;
  return n;
}

function immortal(seed: number): Run {
  const r = createRun(seed, cfg);
  return { ...r, state: { ...r.state, lives: 1_000_000 } };
}

describe('Property 15: pellet accounting', () => {
  it('ordinaryRemaining always equals the Ordinary_Pellets on the floor and only the Hunter lowers it', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 20, maxLength: 300 }), (seed, inputs) => {
        let run = createRun(seed, cfg);
        for (let t = 0; t < 1200; t++) {
          const before = run.state;
          const r = step(run, { ...inputs[t % inputs.length]!, continue: false });
          const s = r.run.state;
          expect(s.items.ordinaryRemaining).toBe(countOrdinary(s));
          if (s.levelNumber === before.levelNumber && s.maze === before.maze) {
            const eaten = r.events.filter((e) => e.t === 'PelletCollected' && e.kind === 'ordinary');
            expect(eaten.every((e) => e.t === 'PelletCollected' && e.by === 'hunter')).toBe(true);
            expect(before.items.ordinaryRemaining - s.items.ordinaryRemaining).toBe(eaten.length);
          }
          run = r.run;
          if (s.phase !== 'playing') break;
        }
      }),
      { numRuns: 30 },
    );
  }, 120_000);

  it('the Hunter wins exactly when the last Ordinary_Pellet is cleared (no Rescue that Tick)', () => {
    for (const seed of [1, 2, 3]) {
      let run = immortal(seed);
      let ended = false;
      for (let t = 0; t < 60_000 && !ended; t++) {
        const r = step(run, IDLE);
        const s = r.run.state;
        if (s.phase === 'levelEnd') {
          ended = true;
          expect(s.outcome).toBe('hunterWin');
          expect(s.items.ordinaryRemaining).toBe(0);
          expect(r.events).toContainEqual({ t: 'LevelEnded', outcome: 'hunterWin', level: s.levelNumber });
        } else {
          expect(s.items.ordinaryRemaining).toBeGreaterThan(0);
        }
        run = r.run;
      }
      expect(ended, `seed ${seed} never ended`).toBe(true);
    }
  }, 120_000);
});

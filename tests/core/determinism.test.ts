// Property 1: Simulation determinism (task 17.1).
// Two runs with the same Seed and input sequence (including Bomb presses and Ghost Hunt)
// compare equal after every Tick.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Input } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';
import { makePolicy } from '../../tools/balance/policies';

const cfg = DEFAULT_CONFIG;

function lockstep(seed: number, inputFor: (run: Run, t: number) => Input, ticks: number): void {
  let a = createRun(seed, cfg);
  let b = createRun(seed, cfg);
  for (let t = 0; t < ticks; t++) {
    const ia = inputFor(a, t);
    const ib = inputFor(b, t);
    expect(ib).toEqual(ia);
    const ra = step(a, ia);
    const rb = step(b, ib);
    expect(rb.events).toEqual(ra.events);
    expect(rb.run.state).toEqual(ra.run.state);
    expect(rb.run.brain).toEqual(ra.run.brain);
    expect(rb.run.progression).toEqual(ra.run.progression);
    a = ra.run;
    b = rb.run;
  }
}

describe('Property 1: simulation determinism', () => {
  it('same Seed and random input sequence give equal states after every Tick', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 50, maxLength: 400 }), (seed, inputs) => {
        lockstep(seed, (_r, t) => inputs[t % inputs.length]!, inputs.length * 2);
      }),
      { numRuns: 25 },
    );
  }, 120_000);

  it('stays in lockstep through Bomb detonations and a Ghost Hunt', () => {
    // bombAggressive detonates; ghostHuntOpportunistic starts a Ghost Hunt (see policyBehaviour).
    for (const name of ['bombAggressive', 'ghostHuntOpportunistic'] as const) {
      let sawBomb = false;
      let sawHunt = false;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        // One policy instance per run: policies keep a committed side target.
        const pa = makePolicy(name, { bombRadius: cfg.bombRadius });
        const pb = makePolicy(name, { bombRadius: cfg.bombRadius });
        let a = createRun(seed, cfg);
        let b = createRun(seed, cfg);
        for (let t = 0; t < 2500; t++) {
          const ra = step(a, pa(a.state));
          const rb = step(b, pb(b.state));
          expect(rb.events).toEqual(ra.events);
          expect(rb.run.state).toEqual(ra.run.state);
          for (const e of ra.events) {
            if (e.t === 'BombDetonated') sawBomb = true;
            if (e.t === 'GhostHuntStarted') sawHunt = true;
          }
          a = ra.run;
          b = rb.run;
        }
      }
      if (name === 'bombAggressive') expect(sawBomb).toBe(true);
      else expect(sawHunt).toBe(true);
    }
  }, 600_000);

  it('step never mutates its input run', () => {
    const run = createRun(99, cfg);
    const snapshot = structuredClone(run.state);
    step(run, { pressed: 'left', bomb: true, continue: false });
    expect(run.state).toEqual(snapshot);
  });
});

// Property 42: Spirit_Wisps never change the Ordinary_Pellet accounting (task 17.3).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import { INITIAL_COMBO, collectWisp } from '../../src/core/score';
import { ItemKind } from '../../src/core/types';
import type { GameState } from '../../src/core/types';
import { arbSeed } from '../helpers/arbitraries';
import { makePolicy } from '../../tools/balance/policies';
import { playLevel } from '../../tools/balance/runner';

const cfg = DEFAULT_CONFIG;

function count(s: GameState, kind: number): number {
  let n = 0;
  for (const k of s.items.kinds) if (k === kind) n++;
  return n;
}

describe('Combo cap bonus is score only', () => {
  it('awards the bonus once per climb to the cap, never while staying at it', () => {
    const c = { ...cfg, comboCap: 3, comboCapBonus: 100 };
    const cell = { x: 1, y: 1 };
    let combo = INITIAL_COMBO;
    const bonuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = collectWisp(combo, cell, c);
      bonuses.push(r.event.bonus);
      combo = r.combo;
    }
    expect(bonuses).toEqual([0, 0, 100, 0, 0, 0]);
    // Window lapse then a new climb awards again.
    combo = { comboCount: 1, comboTicksLeft: 0 };
    const again = [0, 1, 2].map(() => {
      const r = collectWisp(combo, cell, c);
      combo = r.combo;
      return r.event.bonus;
    });
    expect(again).toEqual([0, 0, 100]);
  });

  it('bonus 0 awards nothing; cap 1 never awards', () => {
    expect(collectWisp({ comboCount: 4, comboTicksLeft: 5 }, { x: 0, y: 0 }, { ...cfg, comboCapBonus: 0 }).event.bonus).toBe(0);
    expect(collectWisp(INITIAL_COMBO, { x: 0, y: 0 }, { ...cfg, comboCap: 1 }).event.bonus).toBe(0);
  });

});

describe('Property 42: Wisps never change pellet accounting', () => {
  it('Wisp pickups leave ordinaryRemaining untouched and are counted separately', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const p = makePolicy('wispSweep', { bombRadius: cfg.bombRadius });
        let run = createRun(seed, cfg);
        const ordinaryCells = new Set(run.state.maze.ordinary.map((c) => c.y * run.state.maze.width + c.x));
        for (const c of run.state.maze.wisps) {
          expect(ordinaryCells.has(c.y * run.state.maze.width + c.x)).toBe(false);
        }
        for (let t = 0; t < 500 && run.state.phase === 'playing'; t++) {
          const before = run.state;
          const r = step(run, p(before));
          const s = r.run.state;
          const wisps = r.events.filter((e) => e.t === 'WispCollected').length;
          const ordinary = r.events.filter((e) => e.t === 'PelletCollected' && e.kind === 'ordinary').length;
          expect(before.items.ordinaryRemaining - s.items.ordinaryRemaining).toBe(ordinary);
          expect(before.items.wispsRemaining - s.items.wispsRemaining).toBe(wisps);
          expect(s.items.wispsRemaining).toBe(count(s, ItemKind.Wisp));
          // Wisp points and the cap bonus reach the score; they never touch pellets.
          const wispScore = r.events.reduce((a, e) => (e.t === 'WispCollected' ? a + e.points + e.bonus : a), 0);
          expect(s.score - before.score).toBeGreaterThanOrEqual(wispScore);
          run = r.run;
        }
      }),
      { numRuns: 100 },
    );
  }, 600_000);

  it('the Hunter never collects a Wisp and Wisps never end a level', () => {
    for (const seed of [3, 4]) {
      const { result } = playLevel(createRun(seed, cfg), () => ({ pressed: null, bomb: false, continue: false }), {
        maxTicks: 6000,
      });
      expect(result.events.some((e) => e.t === 'WispCollected')).toBe(false);
      expect(result.final.items.wispsRemaining).toBe(result.final.maze.wisps.length);
    }
  }, 60_000);
});

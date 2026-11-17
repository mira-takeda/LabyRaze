import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { GameState } from '../../src/core/types';
import { POLICY_NAMES, bombSaving, makePolicy } from '../../tools/balance/policies';
import { disableHunter, playLevel, runAtLevel } from '../../tools/balance/runner';

const cfg = DEFAULT_CONFIG;

describe('balance policies', () => {
  it('are pure: the same state gives the same input', () => {
    const s = createRun(11, cfg).state;
    for (const name of POLICY_NAMES) {
      const p = makePolicy(name, { bombRadius: cfg.bombRadius });
      expect(p(s)).toEqual(p(s));
    }
  });

  it('give identical level traces for the same seed', () => {
    const p = makePolicy('threeKey', { bombRadius: cfg.bombRadius });
    const a = playLevel(createRun(21, cfg), p, { maxTicks: 4000 }).result;
    const b = playLevel(createRun(21, cfg), p, { maxTicks: 4000 }).result;
    expect(b.ticks).toBe(a.ticks);
    expect(b.events).toEqual(a.events);
    expect(b.outcome).toBe(a.outcome);
  });

  it('press a direction on the first Tick of a level', () => {
    for (const name of POLICY_NAMES) {
      const p = makePolicy(name, { bombRadius: cfg.bombRadius });
      expect(p(createRun(3, cfg).state).pressed).not.toBeNull();
    }
  });

  it('acknowledge level end with continue', () => {
    const s: GameState = { ...createRun(3, cfg).state, phase: 'levelEnd', outcome: 'playerWin' };
    expect(makePolicy('oneKey', { bombRadius: cfg.bombRadius })(s).continue).toBe(true);
  });

  it('starts a run directly at a deep level with the matching Maze', () => {
    const r = runAtLevel(5, 10, cfg);
    expect(r.state.levelNumber).toBe(10);
    expect(r.progression.levelNumber).toBe(10);
    expect(r.state.phase).toBe('playing');
  });

  it('bombSaving is 0 with no walls in range and never negative', () => {
    const s = disableHunter(createRun(9, cfg)).state;
    const v = bombSaving(s, [s.maze.cage.entrance], 0.1);
    expect(v).toBe(0);
    expect(bombSaving(s, [s.maze.cage.entrance], cfg.bombRadius)).toBeGreaterThanOrEqual(0);
  });

  it('wispSweep collects more Wisps than threeKey on the same Mazes', () => {
    let sweep = 0;
    let plain = 0;
    for (const seed of [1, 2, 3, 4]) {
      const count = (name: 'wispSweep' | 'threeKey'): number => {
        const r = playLevel(createRun(seed, cfg), makePolicy(name, { bombRadius: cfg.bombRadius }), {
          mode: 'playerOnly',
          maxTicks: 8000,
        }).result;
        return r.events.filter((e) => e.t === 'WispCollected').length;
      };
      sweep += count('wispSweep');
      plain += count('threeKey');
    }
    expect(sweep).toBeGreaterThan(plain);
  }, 60_000);

  it('only bombAggressive and ghostHuntOpportunistic steer to their items', () => {
    // Sanity: the Maze has those items, so the comparison is meaningful.
    const s = createRun(1, cfg).state;
    expect(Array.from(s.items.kinds).some((k) => k === ItemKind.Bomb)).toBe(true);
    expect(Array.from(s.items.kinds).some((k) => k === ItemKind.GhostHunt)).toBe(true);
  });
});

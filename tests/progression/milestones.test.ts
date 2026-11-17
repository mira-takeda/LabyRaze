import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG, validateConfig } from '../../src/core/config';
import { isCelebrationLevel } from '../../src/core/milestones';
import { step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { GameEvent } from '../../src/core/events';
import type { Input } from '../../src/core/types';
import { endLevel, runAt } from '../helpers/runAt';

const cfg = DEFAULT_CONFIG;
const CONTINUE: Input = { pressed: null, bomb: false, continue: true };
const milestones = (ev: GameEvent[]) => ev.filter((e) => e.t === 'LevelMilestone');

describe('isCelebrationLevel', () => {
  it('matches 100, 150, 200, ...', () => {
    for (const l of [100, 150, 200, 250, 300, 1000]) expect(isCelebrationLevel(l, cfg)).toBe(true);
    for (const l of [1, 50, 99, 101, 125, 149, 151]) expect(isCelebrationLevel(l, cfg)).toBe(false);
  });
  it('validates config', () => {
    expect(validateConfig({ ...cfg, celebrationFirstLevel: 0 }).length).toBeGreaterThan(0);
    expect(validateConfig({ ...cfg, celebrationEvery: 0 }).length).toBeGreaterThan(0);
  });
});

describe('LevelMilestone in step()', () => {
  it('winning into level 100 emits exactly one event', () => {
    const r = step(endLevel(runAt(7, cfg, 99), 'playerWin'), CONTINUE);
    expect(r.run.state.levelNumber).toBe(100);
    expect(milestones(r.events)).toEqual([{ t: 'LevelMilestone', level: 100 }]);
    expect(r.run.celebratedUpTo).toBe(100);
  }, 60_000);

  it('retry of level 100 after a lost life emits none', () => {
    const first = step(endLevel(runAt(7, cfg, 99), 'playerWin'), CONTINUE).run;
    const retry = step(endLevel(first, 'hunterWin'), CONTINUE);
    expect(retry.run.state.levelNumber).toBe(100);
    expect(milestones(retry.events)).toHaveLength(0);
  }, 60_000);

  it('a non-celebration win emits none', () => {
    expect(milestones(step(endLevel(runAt(7, cfg, 98), 'playerWin'), CONTINUE).events)).toHaveLength(0);
  }, 60_000);

  it('does not change other state (huge first level vs default)', () => {
    const a = step(endLevel(runAt(11, cfg, 99), 'playerWin'), CONTINUE).run;
    const bcfg = { ...cfg, celebrationFirstLevel: 1_000_000 };
    const b = step(endLevel(runAt(11, bcfg, 99), 'playerWin'), CONTINUE).run;
    expect(a.celebratedUpTo).toBe(100);
    expect(b.celebratedUpTo).toBe(0);
    expect(a.state.score).toBe(b.state.score);
    expect(a.state.lives).toBe(b.state.lives);
    expect(a.progression).toEqual(b.progression);
    expect(a.state.levelNumber).toBe(b.state.levelNumber);
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.state.maze.tiles).toEqual(b.state.maze.tiles);
    // the run continues normally
    const idle: Input = { pressed: null, bomb: false, continue: false };
    let ra: Run = a;
    for (let i = 0; i < 20; i++) ra = step(ra, idle).run;
    expect(ra.state.phase).not.toBe('gameOver');
  }, 60_000);
});

// Pure model of the rule: an action list of wins ('w') and retries ('r').
function model(start: number, actions: string[], celebratedStart: number): { emitted: number[]; level: number } {
  let level = start;
  let up = celebratedStart;
  const emitted: number[] = [];
  for (const a of actions) {
    if (a === 'w') {
      level += 1;
      if (level > up && isCelebrationLevel(level, cfg)) {
        emitted.push(level);
        up = level;
      }
    }
  }
  return { emitted, level };
}

describe('Property 54 and 55', () => {
  it('Feature: kirobit-halloween-maze, Property 54: Celebration levels trigger exactly once', () => {
    // **Validates: Requirements 34.1, 34.2, 34.3**
    fc.assert(
      fc.property(
        fc.integer({ min: 90, max: 400 }),
        fc.array(fc.constantFrom('w', 'r'), { maxLength: 40 }),
        (start, actions) => {
          const { emitted, level } = model(start, actions, 0);
          expect(new Set(emitted).size).toBe(emitted.length);
          for (const l of emitted) expect(isCelebrationLevel(l, cfg)).toBe(true);
          const expected: number[] = [];
          for (let l = start + 1; l <= level; l++) if (isCelebrationLevel(l, cfg)) expected.push(l);
          expect(emitted).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property 54 (real step): wins and retries emit once per celebration level', () => {
    // **Validates: Requirements 34.1, 34.2, 34.3**
    fc.assert(
      fc.property(
        fc.integer({ min: 96, max: 296 }),
        fc.array(fc.constantFrom('w', 'r'), { minLength: 1, maxLength: 6 }),
        (start0, actions) => {
          const start = [96, 97, 98, 99, 146, 147, 148, 149, 296, 297, 298, 299][start0 % 12]!;
          let run: Run = runAt(5, cfg, start);
          const all: number[] = [];
          for (const a of actions) {
            if (run.state.lives < 2 && a === 'r') continue;
            const r = step(endLevel(run, a === 'w' ? 'playerWin' : 'hunterWin'), CONTINUE);
            for (const e of milestones(r.events)) all.push((e as { level: number }).level);
            run = r.run;
          }
          expect(all).toEqual(model(start, actions, 0).emitted);
          expect(new Set(all).size).toBe(all.length);
          for (const l of all) expect(isCelebrationLevel(l, cfg)).toBe(true);
          expect(run.celebratedUpTo).toBe(all.length ? all[all.length - 1] : 0);
        },
      ),
      { numRuns: 100 },
    );
  }, 600_000);

  it('Feature: kirobit-halloween-maze, Property 55: Celebration non-interference', () => {
    // **Validates: Requirement 34.5**
    fc.assert(
      fc.property(fc.constantFrom(99, 149, 199, 299), fc.integer({ min: 1, max: 9999 }), (lvl, seed) => {
        const off = { ...cfg, celebrationFirstLevel: 10_000_000 };
        const ra = step(endLevel(runAt(seed, cfg, lvl), 'playerWin'), CONTINUE).run;
        const rb = step(endLevel(runAt(seed, off, lvl), 'playerWin'), CONTINUE).run;
        expect(ra.celebratedUpTo).toBe(lvl + 1);
        expect(rb.celebratedUpTo).toBe(0);
        const { derived: _da, ...sa } = ra.state;
        const { derived: _db, ...sb } = rb.state;
        void _da;
        void _db;
        expect(sa).toEqual(sb);
        expect(ra.progression).toEqual(rb.progression);
        expect(ra.state.score).toBe(rb.state.score);
        expect(ra.state.lives).toBe(rb.state.lives);
        expect(ra.state.levelNumber).toBe(rb.state.levelNumber);
        expect(ra.state.maze.tiles).toEqual(rb.state.maze.tiles);
        expect(ra.state.player).toEqual(rb.state.player);
        expect(ra.state.hunter).toEqual(rb.state.hunter);
      }),
      { numRuns: 100 },
    );
  }, 600_000);
});

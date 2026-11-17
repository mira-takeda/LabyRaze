// Score-based extra lives (task 37.1): milestones, awards in step(), Properties 51, 52, 53.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { awardOneUps, oneUpMilestone } from '../../src/core/oneUp';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Dir, GameState, Input } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const CONTINUE: Input = { ...IDLE, continue: true };

/** Independent count of default milestones (10000, 25000, 50000, then every 50000) at or below score. */
function defaultMilestonesAtOrBelow(score: number): number {
  let n = 0;
  if (score >= 10000) n++;
  if (score >= 25000) n++;
  if (score >= 50000) n += 1 + Math.floor((score - 50000) / 50000);
  return n;
}

/** Puts a Wisp under the Player and resets the Combo window, so the next Tick scores exactly cfg.wispPoints. */
function withWispUnderPlayer(run: Run, over: Partial<GameState> = {}): Run {
  const s = run.state;
  const kinds = s.items.kinds.slice();
  kinds[s.player.cell.y * s.maze.width + s.player.cell.x] = ItemKind.Wisp;
  const state: GameState = {
    ...s,
    items: { ...s.items, kinds, wispsRemaining: s.items.wispsRemaining + 1 },
    comboCount: 1,
    comboTicksLeft: 0,
    ...over,
  };
  return { ...run, state };
}

function extraLives(events: readonly GameEvent[]): Extract<GameEvent, { t: 'ExtraLife' }>[] {
  return events.filter((e): e is Extract<GameEvent, { t: 'ExtraLife' }> => e.t === 'ExtraLife');
}

describe('oneUpMilestone / awardOneUps', () => {
  it('default milestones are 10000, 25000, 50000, 100000, 150000 and every further 50000', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6].map((i) => oneUpMilestone(i, cfg));
    expect(seq).toEqual([10000, 25000, 50000, 100000, 150000, 200000, 250000]);
  });

  it('oneUpRepeat 0 ends the series; empty thresholds start the repeat series at oneUpRepeat', () => {
    expect(oneUpMilestone(3, { oneUpThresholds: [10000, 25000, 50000], oneUpRepeat: 0 })).toBe(Infinity);
    expect(oneUpMilestone(0, { oneUpThresholds: [], oneUpRepeat: 0 })).toBe(Infinity);
    expect(oneUpMilestone(0, { oneUpThresholds: [], oneUpRepeat: 7 })).toBe(7);
    expect(oneUpMilestone(2, { oneUpThresholds: [], oneUpRepeat: 7 })).toBe(21);
  });

  it('one event crossing several milestones awards each, and nothing is awarded twice', () => {
    const a = awardOneUps(60000, 0, cfg);
    expect(a).toEqual({ awarded: 3, milestones: [10000, 25000, 50000] });
    expect(awardOneUps(60000, a.awarded, cfg)).toEqual({ awarded: 3, milestones: [] });
    expect(awardOneUps(9999, 0, cfg).milestones).toEqual([]);
    expect(awardOneUps(10000, 0, cfg).milestones).toEqual([10000]);
  });
});

describe('1UP in step()', () => {
  it('a wisp crossing 10000 adds one life to state and progression and emits one ExtraLife', () => {
    const run = withWispUnderPlayer(createRun(1, cfg), { score: 9990 });
    const r = step(run, IDLE);
    expect(r.run.state.score).toBe(9990 + cfg.wispPoints);
    expect(r.run.state.lives).toBe(cfg.livesInitial + 1);
    expect(r.run.progression.lives).toBe(cfg.livesInitial + 1);
    expect(r.run.state.oneUpsAwarded).toBe(1);
    expect(extraLives(r.events)).toEqual([{ t: 'ExtraLife', lives: cfg.livesInitial + 1, milestone: 10000 }]);
    const again = step(r.run, IDLE);
    expect(extraLives(again.events)).toEqual([]);
    expect(again.run.state.lives).toBe(cfg.livesInitial + 1);
  });

  it('one scoring event crossing three milestones awards three lives on that Tick', () => {
    const big: GameConfig = { ...cfg, wispPoints: 60000 };
    const run = withWispUnderPlayer({ ...createRun(2, big), cfg: big });
    const r = step(run, IDLE);
    expect(r.run.state.oneUpsAwarded).toBe(3);
    expect(r.run.state.lives).toBe(big.livesInitial + 3);
    expect(extraLives(r.events).map((e) => [e.lives, e.milestone])).toEqual([
      [big.livesInitial + 1, 10000],
      [big.livesInitial + 2, 25000],
      [big.livesInitial + 3, 50000],
    ]);
  });

  it('losing a life keeps the score and the awarded milestones', () => {
    const run = createRun(3, cfg);
    const hurt: Run = {
      ...run,
      state: {
        ...run.state,
        score: 12000,
        oneUpsAwarded: 1,
        hunter: { ...run.state.hunter, cell: { ...run.state.player.cell }, next: null, progress: 0, respawnIn: 0, invulnerable: 0 },
        player: { ...run.state.player, invulnerable: 0 },
      },
    };
    const r = step(hurt, IDLE);
    expect(extraLives(r.events)).toEqual([]);
    expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(true);
    expect(r.run.state.lives).toBe(cfg.livesInitial - 1);
    expect(r.run.state.score).toBe(12000);
    expect(r.run.state.oneUpsAwarded).toBe(1);
  });

  it('a milestone crossed on the Tick the last life is lost keeps the run alive', () => {
    const run = withWispUnderPlayer(createRun(4, cfg), { score: 9990, lives: 1 });
    const s = run.state;
    const doomed: Run = {
      ...run,
      progression: { ...run.progression, lives: 1 },
      state: {
        ...s,
        hunter: { ...s.hunter, cell: { ...s.player.cell }, next: null, progress: 0, respawnIn: 0, invulnerable: 0 },
        player: { ...s.player, invulnerable: 0 },
      },
    };
    const r = step(doomed, IDLE);
    expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(true);
    expect(r.run.state.phase).toBe('playing');
    expect(r.run.state.lives).toBe(1);
    expect(r.run.progression.gameOver).toBe(false);
    expect(r.events.some((e) => e.t === 'GameOver')).toBe(false);
    expect(extraLives(r.events)).toHaveLength(1);
  });

  it('awarded lives and oneUpsAwarded carry across levels with the score', () => {
    let run = withWispUnderPlayer(createRun(5, cfg), { score: 9990 });
    run = step(run, IDLE).run;
    const s = run.state;
    const forced: Run = {
      ...run,
      state: {
        ...s,
        carriedKeys: 1,
        captives: [true, true, false],
        items: { ...s.items, keys: [] },
        player: { ...s.player, cell: { ...s.maze.cage.entrance }, next: null, progress: 0, dir: null },
      },
    };
    const ended = step(forced, IDLE).run;
    expect(ended.state.phase).toBe('levelEnd');
    const next = step(ended, CONTINUE).run;
    expect(next.state.levelNumber).toBe(2);
    expect(next.state.lives).toBe(cfg.livesInitial + 1);
    expect(next.progression.lives).toBe(cfg.livesInitial + 1);
    expect(next.state.oneUpsAwarded).toBe(1);
    expect(next.state.score).toBe(ended.state.score);
    expect(next.state.score).toBeGreaterThanOrEqual(10000);
  });

  it('a cheat Run (livesInitial 30) gets the same awards', () => {
    const cheat: GameConfig = { ...cfg, livesInitial: 30 };
    const run = withWispUnderPlayer(createRun(6, cheat), { score: 9990 });
    const r = step(run, IDLE);
    expect(r.run.state.lives).toBe(31);
    expect(r.run.state.oneUpsAwarded).toBe(1);
    expect(extraLives(r.events)).toEqual([{ t: 'ExtraLife', lives: 31, milestone: 10000 }]);
  });
});

describe('1UP properties', () => {
  it('Property 51: 1UP award count matches crossed milestones', () => {
    // Feature: kirobit-halloween-maze, Property 51: 1UP award count matches crossed milestones
    // **Validates: Requirements 33.2, 33.3**
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(fc.integer({ min: 0, max: 120_000 }), { minLength: 1, maxLength: 6 }),
        (seed, gains) => {
          let run = createRun(seed, cfg);
          for (const g of gains) {
            const c: GameConfig = { ...cfg, wispPoints: g };
            const before = run.state;
            run = withWispUnderPlayer({ ...run, cfg: c });
            const r = step(run, IDLE);
            run = r.run;
            const s = run.state;
            const crossed = defaultMilestonesAtOrBelow(s.score) - defaultMilestonesAtOrBelow(before.score);
            const events = extraLives(r.events);
            if (s.score !== before.score + g) return false;
            if (s.oneUpsAwarded !== defaultMilestonesAtOrBelow(s.score)) return false;
            if (events.length !== crossed) return false;
            if (s.lives !== before.lives + crossed) return false;
            if (s.phase !== 'playing') return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  }, 120_000);

  const dirArb = fc.constantFrom<Dir | null>('up', 'down', 'left', 'right', null);
  const inputsArb = fc.array(fc.record({ pressed: dirArb, bomb: fc.boolean() }), { minLength: 40, maxLength: 60 });
  const toInput = (i: { pressed: Dir | null; bomb: boolean }): Input => ({ ...i, continue: true });

  it('Property 52: milestones survive life loss and levels', () => {
    // Feature: kirobit-halloween-maze, Property 52: milestones survive life loss and levels
    // **Validates: Requirements 33.4, 33.5, 33.6**
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 120_000 }), inputsArb, (seed, score0, inputs) => {
        let run = createRun(seed, cfg);
        run = { ...run, state: { ...run.state, score: score0 } };
        const seen = new Set<number>();
        for (const i of inputs) {
          for (let k = 0; k < 5; k++) {
            const before = run.state;
            const r = step(run, toInput(i));
            run = r.run;
            if (run.state.oneUpsAwarded < before.oneUpsAwarded) return false;
            if (run.state.score < before.score) return false;
            for (const e of extraLives(r.events)) {
              if (seen.has(e.milestone)) return false;
              seen.add(e.milestone);
            }
            if (run.state.oneUpsAwarded !== seen.size) return false;
            if (run.state.oneUpsAwarded !== defaultMilestonesAtOrBelow(run.state.score)) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  }, 120_000);

  it('Property 53: 1UP non-interference', () => {
    // Feature: kirobit-halloween-maze, Property 53: 1UP non-interference
    // **Validates: Requirement 33.7**
    const off: GameConfig = { ...cfg, oneUpThresholds: [], oneUpRepeat: 0 };
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 60_000 }), inputsArb, (seed, score0, inputs) => {
        const start = (c: GameConfig): Run => {
          const r = createRun(seed, c);
          return { ...r, state: { ...r.state, score: score0 } };
        };
        let a = start(cfg);
        let b = start(off);
        for (const i of inputs) {
          for (let k = 0; k < 5; k++) {
            a = step(a, toInput(i)).run;
            b = step(b, toInput(i)).run;
            if (a.state.lives < 1 || b.state.lives < 1) return true;
            expect({ ...a.state, lives: 0, oneUpsAwarded: 0 }).toEqual({ ...b.state, lives: 0, oneUpsAwarded: 0 });
            if (b.state.oneUpsAwarded !== 0) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  }, 300_000);
});

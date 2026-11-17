// Endless progression integration tests (task 17.16), completing Property 22.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { levelSpeedFactor, unitsPerTick } from '../../src/core/progression';
import { createRun, runMazeSeed, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { GameState, Input } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const CONTINUE: Input = { ...IDLE, continue: true };

/** Forces a Player win this Tick: last Key carried, Player on the Cage entrance. */
function winNow(run: Run): Run {
  const s = run.state;
  const forced: GameState = {
    ...s,
    carriedKeys: 1,
    captives: [true, true, false],
    items: { ...s.items, keys: [] },
    player: { ...s.player, cell: { ...s.maze.cage.entrance }, next: null, progress: 0, dir: null },
  };
  return step({ ...run, state: forced }, IDLE).run;
}

describe('endless progression', () => {
  it('after 80 consecutive Player wins there is no final phase, speed stays capped and the Maze does not grow', () => {
    let run = createRun(111, cfg);
    const w = run.state.maze.width;
    const h = run.state.maze.height;
    const doors = run.state.maze.doors.length;
    let lastFactor = 0;
    for (let level = 1; level <= 80; level++) {
      expect(run.state.levelNumber).toBe(level);
      expect(run.state.phase).toBe('playing');
      expect(run.state.maze.width).toBe(w);
      expect(run.state.maze.height).toBe(h);
      expect(run.state.maze.doors.length).toBeLessThanOrEqual(Math.max(doors, cfg.doorCount));
      const f = levelSpeedFactor(level, cfg);
      expect(f).toBeLessThanOrEqual(cfg.speedCap);
      expect(f).toBeGreaterThanOrEqual(lastFactor);
      lastFactor = f;
      expect(unitsPerTick(level, cfg)).toBeLessThanOrEqual(Math.round(cfg.baseUnitsPerTick * cfg.speedCap));

      run = winNow(run);
      expect(run.state.phase).toBe('levelEnd');
      expect(run.state.outcome).toBe('playerWin');
      const r = step(run, CONTINUE);
      expect(r.events.some((e) => e.t === 'GameOver')).toBe(false);
      const started = r.events.find((e) => e.t === 'LevelStarted');
      expect(started).toMatchObject({ t: 'LevelStarted', level: level + 1 });
      if (started?.t === 'LevelStarted') expect(started.speedFactor).toBeLessThanOrEqual(cfg.speedCap);
      run = r.run;
    }
    expect(lastFactor).toBe(cfg.speedCap);
    expect(['playing', 'levelEnd', 'gameOver']).toContain(run.state.phase);
  }, 120_000);

  it('a Hunter win costs a life and gives a new Maze at the same level', () => {
    let run = createRun(112, cfg);
    run = winNow(run);
    run = step(run, CONTINUE).run; // level 2
    const seedBefore = runMazeSeed(run);
    const lives = run.state.lives;
    const lost: Run = { ...run, state: { ...run.state, phase: 'levelEnd', outcome: 'hunterWin' } };
    const r = step(lost, CONTINUE);
    expect(r.run.state.levelNumber).toBe(2);
    expect(r.run.state.lives).toBe(lives - 1);
    expect(r.run.progression.retryIndex).toBe(run.progression.retryIndex + 1);
    expect(runMazeSeed(r.run)).not.toBe(seedBefore);
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'LevelStarted', level: 2 }));
  });

  it('a Hunter win on the last life ends the run with GameOver', () => {
    const run = createRun(113, cfg);
    const lost: Run = {
      ...run,
      state: { ...run.state, lives: 1, phase: 'levelEnd', outcome: 'hunterWin' },
      progression: { ...run.progression, lives: 1 },
    };
    const r = step(lost, CONTINUE);
    expect(r.run.state.phase).toBe('gameOver');
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'GameOver' }));
  });
});

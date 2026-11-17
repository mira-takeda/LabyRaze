import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG } from '../../src/core/config';
import { advanceLevel, createRun, runUnitsPerTick } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { LevelOutcome } from '../../src/core/progression';

const cfg = DEFAULT_CONFIG;

describe('createRun', () => {
  it('throws ConfigError on an invalid config', () => {
    expect(() => createRun(1, { ...cfg, bombRadius: 0 })).toThrow(ConfigError);
    expect(() => createRun(1, { ...cfg, bombRadius: 0 })).toThrow(/bombRadius/);
  });

  it('is deterministic for the same seed and differs for another seed', () => {
    const a = createRun(42, cfg);
    const b = createRun(42, cfg);
    expect(b.state).toEqual(a.state);
    expect(b.brain).toEqual(a.brain);
    expect(createRun(43, cfg).state.maze.tiles).not.toEqual(a.state.maze.tiles);
  });

  it('builds a valid initial state', () => {
    const { state: s, progression } = createRun(7, cfg);
    const m = s.maze;
    expect(s.walls.tiles).toEqual(m.tiles);
    expect(s.walls.tiles).not.toBe(m.tiles);
    expect(s.walls.version).toBe(0);
    expect(s.derived.fieldVersion).toBe(0);
    expect(s.doors).toHaveLength(m.doors.length);
    expect(s.derived.connectivity).toHaveLength(1 << m.doors.length);
    expect(s.items.ordinaryRemaining).toBe(m.ordinary.length);
    expect(s.items.wispsRemaining).toBe(m.wisps.length);
    expect(s.items.keys).toHaveLength(3);
    let ordinary = 0;
    let wisps = 0;
    for (const k of s.items.kinds) {
      if (k === ItemKind.Ordinary) ordinary++;
      if (k === ItemKind.Wisp) wisps++;
    }
    expect(ordinary).toBe(s.items.ordinaryRemaining);
    expect(wisps).toBe(s.items.wispsRemaining);
    expect(s.ghostHunt.ticksLeft).toBe(0);
    expect(s.ghostHunt.allies.every((a) => a.mode === 'inactive')).toBe(true);
    expect([s.comboCount, s.comboTicksLeft, s.bombs, s.score, s.tick]).toEqual([1, 0, 0, 0, 0]);
    expect(s.lives).toBe(cfg.livesInitial);
    expect(progression.lives).toBe(cfg.livesInitial);
    expect(s.player.cell).toEqual(m.playerStart);
    expect(s.hunter.cell).toEqual(m.hunterStart);
    expect(s.captives).toEqual([false, false, false]);
    expect(s.carriedKeys).toBe(0);
    expect(s.phase).toBe('playing');
    expect(s.outcome).toBeNull();
    expect(s.levelNumber).toBe(1);
  });
});

describe('advanceLevel', () => {
  it('player win: next level, new Maze, faster, lives carry, state reset', () => {
    const r0 = createRun(5, cfg);
    const dirty = {
      ...r0,
      state: { ...r0.state, bombs: 2, carriedKeys: 2, captives: [true, false, false] as [boolean, boolean, boolean], score: 90 },
    };
    const r1 = advanceLevel(dirty, 'playerWin');
    expect(r1.state.levelNumber).toBe(2);
    expect(r1.progression.levelNumber).toBe(2);
    expect(r1.state.maze.tiles).not.toEqual(r0.state.maze.tiles);
    expect(runUnitsPerTick(r1)).toBeGreaterThan(runUnitsPerTick(r0));
    expect(r1.state.lives).toBe(r0.state.lives);
    expect(r1.state.bombs).toBe(0);
    expect(r1.state.captives).toEqual([false, false, false]);
    expect(r1.state.carriedKeys).toBe(0);
    expect(r1.state.score).toBe(90);
    expect(r1.state.phase).toBe('playing');
    expect(r1.state.tick).toBe(0);
  });

  it.each<LevelOutcome>(['hunterWin', 'pelletStarved'])('%s: lose a life, same level, new Maze', (o) => {
    const r0 = createRun(5, cfg);
    const r1 = advanceLevel(r0, o);
    expect(r1.state.lives).toBe(cfg.livesInitial - 1);
    expect(r1.state.levelNumber).toBe(1);
    expect(r1.state.maze.tiles).not.toEqual(r0.state.maze.tiles);
    expect(runUnitsPerTick(r1)).toBe(runUnitsPerTick(r0));
    expect(r1.state.phase).toBe('playing');
  });

  it('game over after the last life and no further progression', () => {
    let r = createRun(9, cfg);
    for (let i = 0; i < cfg.livesInitial; i++) r = advanceLevel(r, 'hunterWin');
    expect(r.state.phase).toBe('gameOver');
    expect(r.state.lives).toBe(0);
    expect(r.progression.gameOver).toBe(true);
    expect(advanceLevel(r, 'playerWin')).toBe(r);
  });

  it('every level gets a new Maze and speed never decreases; there is no victory phase', () => {
    let r = createRun(11, cfg);
    const seen: Uint8Array[] = [r.state.maze.tiles];
    let prevSpeed = runUnitsPerTick(r);
    for (let i = 0; i < 6; i++) {
      r = advanceLevel(r, 'playerWin');
      expect(seen.some((t) => t.length === r.state.maze.tiles.length && t.every((v, j) => v === r.state.maze.tiles[j]))).toBe(false);
      seen.push(r.state.maze.tiles);
      const sp = runUnitsPerTick(r);
      expect(sp).toBeGreaterThanOrEqual(prevSpeed);
      prevSpeed = sp;
      expect(r.state.phase).toBe('playing');
    }
    expect(runUnitsPerTick(r)).toBeGreaterThan(cfg.baseUnitsPerTick);
    expect(r.state.levelNumber).toBe(7);
  });
});

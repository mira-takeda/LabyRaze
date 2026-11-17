import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import {
  applyOutcome,
  currentMazeSeed,
  initialProgression,
  levelSpeedFactor,
  unitsPerTick,
  type LevelOutcome,
} from '../../src/core/progression';

describe('level speed', () => {
  it('increases monotonically and is capped', () => {
    let prev = 0;
    for (let n = 1; n <= 200; n++) {
      const f = levelSpeedFactor(n, cfg);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeLessThanOrEqual(cfg.speedCap);
      prev = f;
    }
    expect(levelSpeedFactor(1, cfg)).toBe(1);
    expect(levelSpeedFactor(200, cfg)).toBe(cfg.speedCap);
  });

  it('is one value for both characters, and unitsPerTick is a matching integer', () => {
    for (const n of [1, 2, 10, 50]) {
      const u = unitsPerTick(n, cfg);
      expect(Number.isInteger(u)).toBe(true);
      expect(u).toBe(Math.round(cfg.baseUnitsPerTick * levelSpeedFactor(n, cfg)));
    }
    expect(unitsPerTick(1, cfg)).toBe(125);
  });
});

describe('outcomes', () => {
  it('a hunter win costs a life at the same level with a new seed', () => {
    const s0 = initialProgression(cfg);
    const s1 = applyOutcome(s0, 'hunterWin', cfg);
    expect(s1.lives).toBe(s0.lives - 1);
    expect(s1.levelNumber).toBe(s0.levelNumber);
    expect(currentMazeSeed(7, s1)).not.toBe(currentMazeSeed(7, s0));
  });

  it('pellet-starved behaves like a hunter win', () => {
    const s1 = applyOutcome(initialProgression(cfg), 'pelletStarved', cfg);
    expect(s1.lives).toBe(cfg.livesInitial - 1);
    expect(s1.levelNumber).toBe(1);
    expect(s1.retryIndex).toBe(1);
  });

  it('a win advances the level, resets the retry index and gives an extra life every 5 levels', () => {
    let s = initialProgression(cfg);
    s = applyOutcome(s, 'hunterWin', cfg);
    for (let i = 1; i <= 10; i++) {
      const before = s.lives;
      s = applyOutcome(s, 'playerWin', cfg);
      expect(s.levelNumber).toBe(i + 1);
      expect(s.retryIndex).toBe(0);
      expect(s.lives).toBe(before + (i % 5 === 0 ? 1 : 0));
    }
  });

  it('is game over when lives reach 0 and stays over', () => {
    let s = initialProgression(cfg);
    for (let i = 0; i < cfg.livesInitial; i++) s = applyOutcome(s, 'hunterWin', cfg);
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(true);
    expect(applyOutcome(s, 'playerWin', cfg)).toEqual(s);
  });
});

describe('progression property', () => {
  it('holds invariants for random outcome sequences', () => {
    const outcome = fc.constantFrom<LevelOutcome>('playerWin', 'hunterWin', 'pelletStarved');
    fc.assert(
      fc.property(fc.integer(), fc.array(outcome, { maxLength: 120 }), (runSeed, outcomes) => {
        const run = () => {
          let s = initialProgression(cfg);
          const seeds: number[] = [currentMazeSeed(runSeed, s)];
          for (const o of outcomes) {
            const prev = s;
            s = applyOutcome(s, o, cfg);
            expect(s.levelNumber).toBeGreaterThanOrEqual(prev.levelNumber);
            expect(s.lives).toBeGreaterThanOrEqual(0);
            const f = levelSpeedFactor(s.levelNumber, cfg);
            expect(f).toBeGreaterThanOrEqual(1);
            expect(f).toBeLessThanOrEqual(cfg.speedCap);
            expect(s.gameOver).toBe(s.lives === 0);
            expect(s).not.toHaveProperty('victory');
            seeds.push(currentMazeSeed(runSeed, s));
          }
          return { s, seeds };
        };
        const a = run();
        const b = run();
        expect(a).toEqual(b);
      }),
    );
  });
});

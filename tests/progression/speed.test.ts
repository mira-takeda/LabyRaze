import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELL_UNITS, DEFAULT_CONFIG as cfg } from '../../src/core/config';
import {
  applyOutcome,
  initialProgression,
  levelSpeedFactor,
  unitsPerTick,
  type LevelOutcome,
  type ProgressionState,
} from '../../src/core/progression';

const EPS = 1e-9;
const outcomes = fc.array(
  fc.constantFrom<LevelOutcome>('playerWin', 'hunterWin', 'pelletStarved'),
  { maxLength: 60 },
);

// Feature: kirobit-halloween-maze, Property 22: Level speed progression
describe('Property 22: Level speed progression', () => {
  // **Validates: Requirements 12.1, 12.2, 12.3, 12.6, 19.8, 19.9**

  it('shares one speed factor, is non-decreasing, steps by speedIncrement until the cap, never exceeds it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 499 }), (n) => {
        // One shared Level_Speed: the same function value serves Player and Squareman.
        const playerSpeed = levelSpeedFactor(n, cfg);
        const hunterSpeed = levelSpeedFactor(n, cfg);
        expect(playerSpeed).toBe(hunterSpeed);

        const next = levelSpeedFactor(n + 1, cfg);
        expect(next).toBeGreaterThanOrEqual(playerSpeed);
        expect(playerSpeed).toBeLessThanOrEqual(cfg.speedCap);
        expect(next).toBeLessThanOrEqual(cfg.speedCap);
        if (playerSpeed + cfg.speedIncrement <= cfg.speedCap) {
          expect(Math.abs(next - playerSpeed - cfg.speedIncrement)).toBeLessThan(EPS);
        } else {
          expect(next).toBe(cfg.speedCap);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('keeps unitsPerTick an integer below CELL_UNITS / 2', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (n) => {
        const u = unitsPerTick(n, cfg);
        expect(Number.isInteger(u)).toBe(true);
        expect(u).toBeLessThan(CELL_UNITS / 2);
      }),
      { numRuns: 200 },
    );
  });

  it('raises speed on every win (unless capped) and keeps level and speed on a loss; never ends', () => {
    fc.assert(
      fc.property(outcomes, (seq) => {
        let s: ProgressionState = { ...initialProgression(cfg), lives: 1_000 };
        for (const o of seq) {
          const before = s;
          s = applyOutcome(before, o, cfg);
          const sp0 = levelSpeedFactor(before.levelNumber, cfg);
          const sp1 = levelSpeedFactor(s.levelNumber, cfg);
          if (o === 'playerWin') {
            expect(s.levelNumber).toBe(before.levelNumber + 1);
            if (sp0 < cfg.speedCap) expect(sp1).toBeGreaterThan(sp0);
            else expect(sp1).toBe(cfg.speedCap);
          } else {
            expect(s.levelNumber).toBe(before.levelNumber);
            expect(sp1).toBe(sp0);
          }
          expect(s.gameOver).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('has no victory or final state, even after 500 consecutive wins', () => {
    let s = initialProgression(cfg);
    for (let i = 0; i < 500; i++) s = applyOutcome(s, 'playerWin', cfg);
    expect(s.levelNumber).toBe(501);
    expect(s.gameOver).toBe(false);
    expect(Object.keys(s).sort()).toEqual(
      ['gameOver', 'levelNumber', 'levelsWon', 'lives', 'retryIndex'],
    );
    expect(levelSpeedFactor(s.levelNumber, cfg)).toBe(cfg.speedCap);
    const again = applyOutcome(s, 'playerWin', cfg);
    expect(again.levelNumber).toBe(502);
    expect(again.gameOver).toBe(false);
  });
});

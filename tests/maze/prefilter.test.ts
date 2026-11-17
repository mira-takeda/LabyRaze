// Validity check 8: analytic race-ratio pre-filter (task 19.7).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import { analyticRaceRatio, checkPrefilter, validateMaze } from '../../src/core/maze/validate';

describe('check 8: analytic race-ratio pre-filter', () => {
  it('the analytic ratio is positive and deterministic for generated Mazes', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = generateMaze(seed, 1, DEFAULT_CONFIG);
      const r = analyticRaceRatio(m);
      expect(r).toBeGreaterThan(0);
      expect(analyticRaceRatio(generateMaze(seed, 1, DEFAULT_CONFIG))).toBe(r);
    }
  });

  it('rejects a Maze outside the band, with the ratio in the reason', () => {
    const m = generateMaze(9, 1, DEFAULT_CONFIG);
    const r = analyticRaceRatio(m);
    expect(checkPrefilter(m, { ...DEFAULT_CONFIG, prefilterBand: { min: r + 1, max: r + 2 } }).ok).toBe(false);
    expect(checkPrefilter(m, { ...DEFAULT_CONFIG, prefilterBand: { min: r - 0.01, max: r + 0.01 } }).ok).toBe(true);
    const rep = validateMaze(m, { ...DEFAULT_CONFIG, prefilterBand: { min: r + 1, max: r + 2 } });
    expect(rep.failed).toBe('8');
    expect(rep.reason).toMatch(/analytic race ratio/);
  });

  it('the configured band accepts generated Mazes and can be skipped for the fallback', () => {
    for (const seed of [11, 12, 13]) {
      const m = generateMaze(seed, 10, DEFAULT_CONFIG);
      expect(checkPrefilter(m, DEFAULT_CONFIG).ok).toBe(true);
      const tight = { ...DEFAULT_CONFIG, prefilterBand: { min: 1e6, max: 2e6 } };
      expect(validateMaze(m, tight, { prefilter: false }).results.find((x) => x.id === '8')!.ok).toBe(true);
    }
  });
});

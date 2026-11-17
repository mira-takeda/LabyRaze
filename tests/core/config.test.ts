import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, validateConfig, type GameConfig } from '../../src/core/config';

const with_ = (patch: Partial<GameConfig>): GameConfig => ({ ...DEFAULT_CONFIG, ...patch });

describe('validateConfig', () => {
  it('accepts DEFAULT_CONFIG', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  const cases: Array<[string, GameConfig]> = [
    ['speedCap < 1', with_({ speedCap: 0.5 })],
    ['speedMultiplier pushes past turnable', with_({ speedMultiplier: 10 })],
    ['maze smaller than 5', with_({ mazeSize: { w: 3, h: 3 } })],
    ['even maze height', with_({ mazeSize: { w: 21, h: 22 } })],
    ['non-integer maze size', with_({ mazeSize: { w: 21.5, h: 21 } })],
    ['whitespace bombKey', with_({ bombKey: '   ' })],
    ['NaN doorWarnTicks', with_({ doorWarnTicks: NaN })],
    ['doorWarnTicks < 30', with_({ doorWarnTicks: 29 })],
    ['doorMinOpenRatio 0', with_({ doorMinOpenRatio: 0 })],
    ['doorMinOpenRatio > 1', with_({ doorMinOpenRatio: 1.1 })],
    ['even maze size', with_({ mazeSize: { w: 20, h: 21 } })],
    ['speedCap not turnable', with_({ speedCap: 5 })],
    ['bombRadius 0', with_({ bombRadius: 0 })],
    ['bombRadius > 6', with_({ bombRadius: 6.5 })],
    ['bombCapacity != 3', with_({ bombCapacity: 4 as 3 })],
    ['wispDensity > 0.9', with_({ wispDensity: 0.95 })],
    ['wispDensity < 0', with_({ wispDensity: -0.1 })],
    ['comboCap < 1', with_({ comboCap: 0 })],
    ['ghostHuntTicks < 1', with_({ ghostHuntTicks: 0 })],
    ['allyFactor <= 0', with_({ allyFactor: 0 })],
    ['empty bombKey', with_({ bombKey: '' })],
    [
      'soundtrackMaxRateShift > 0.08',
      with_({ audio: { ...DEFAULT_CONFIG.audio, soundtrackMaxRateShift: 0.09 } }),
    ],
    [
      'soundtrackDistortionMs < 50',
      with_({ audio: { ...DEFAULT_CONFIG.audio, soundtrackDistortionMs: 49 } }),
    ],
    [
      'soundtrackDistortionMs > 1000',
      with_({ audio: { ...DEFAULT_CONFIG.audio, soundtrackDistortionMs: 1001 } }),
    ],
  ];

  it.each(cases)('reports a problem for %s', (_name, cfg) => {
    expect(validateConfig(cfg).length).toBeGreaterThan(0);
  });

  // One entry per validateConfig rule: the message fragment each rule must report.
  const rules: Array<[string, GameConfig]> = [
    ['doorWarnTicks must be >= 30', with_({ doorWarnTicks: 10 })],
    ['doorMinOpenRatio must be in (0, 1]', with_({ doorMinOpenRatio: 0 })],
    ['mazeSize must be odd', with_({ mazeSize: { w: 4, h: 21 } })],
    ['speedCap too high', with_({ speedCap: 5 })],
    ['bombRadius must be in (0, 6]', with_({ bombRadius: 7 })],
    ['bombCapacity must be 3', with_({ bombCapacity: 2 as 3 })],
    ['wispDensity must be in [0, 0.9]', with_({ wispDensity: 1 })],
    ['comboCap must be >= 1', with_({ comboCap: 0 })],
    ['ghostHuntTicks must be >= 1', with_({ ghostHuntTicks: 0 })],
    ['allyFactor must be > 0', with_({ allyFactor: -1 })],
    [
      'soundtrackMaxRateShift must be <= 0.08',
      with_({ audio: { ...DEFAULT_CONFIG.audio, soundtrackMaxRateShift: 0.5 } }),
    ],
    [
      'soundtrackDistortionMs must be in 50..1000',
      with_({ audio: { ...DEFAULT_CONFIG.audio, soundtrackDistortionMs: 5000 } }),
    ],
    ['bombKey must be non-empty', with_({ bombKey: '' })],
    ['livesResetPolicy must be carryPlusExtraEvery5', with_({ livesResetPolicy: 'bogus' as GameConfig['livesResetPolicy'] })],
    ['hunterWinConsequence must be loseLifeNewMazeSameLevel', with_({ hunterWinConsequence: 'bogus' as GameConfig['hunterWinConsequence'] })],
    ['pelletStarvedPolicy must be loseLifeNewMazeSameLevel', with_({ pelletStarvedPolicy: 'bogus' as GameConfig['pelletStarvedPolicy'] })],
    ['gameOverPolicy must be gameOverThenHighScore', with_({ gameOverPolicy: 'bogus' as GameConfig['gameOverPolicy'] })],
    ['simultaneousWinTieRule must be playerWins', with_({ simultaneousWinTieRule: 'bogus' as GameConfig['simultaneousWinTieRule'] })],
    ['droppedKeyPlacement must be nearestReachable', with_({ droppedKeyPlacement: 'bogus' as GameConfig['droppedKeyPlacement'] })],
    ['doorCount must be an integer in 0..30', with_({ doorCount: 31 })],
    ['doorCount must be an integer in 0..30', with_({ doorCount: -1 })],
    ['doorCount must be an integer in 0..30', with_({ doorCount: 2.5 })],
  ];

  it.each(rules)('rule reports "%s" and only that problem', (fragment, cfg) => {
    const problems = validateConfig(cfg);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(fragment);
  });

  it('reports several problems at once', () => {
    expect(validateConfig(with_({ bombRadius: 0, comboCap: 0, bombKey: '' }))).toHaveLength(3);
  });

  it('does not mutate DEFAULT_CONFIG when validating', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    validateConfig(DEFAULT_CONFIG);
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });

  it('ConfigError carries the problems', () => {
    const problems = validateConfig(with_({ doorWarnTicks: 1 }));
    const err = new ConfigError(problems);
    expect(err.name).toBe('ConfigError');
    expect(err.problems).toEqual(problems);
  });
});

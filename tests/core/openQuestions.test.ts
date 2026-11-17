import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { getByPath, OPEN_QUESTIONS } from '../../src/core/openQuestions';

const ids = (status: string) => OPEN_QUESTIONS.filter((q) => q.status === status).map((q) => q.id);

describe('Open Design Questions registry', () => {
  it('has 20 entries numbered 1 to 20', () => {
    expect(OPEN_QUESTIONS).toHaveLength(20);
    expect(OPEN_QUESTIONS.map((q) => q.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('resolves every config key path in DEFAULT_CONFIG and mirrors its value', () => {
    for (const q of OPEN_QUESTIONS) {
      expect(q.configKeys.length).toBeGreaterThan(0);
      for (const path of q.configKeys) {
        const value = getByPath(DEFAULT_CONFIG, path);
        expect(value, `row ${q.id} key ${path}`).not.toBeUndefined();
        expect(q.defaultValue[path]).toEqual(value);
      }
    }
  });

  it('has the expected statuses', () => {
    expect(ids('needsDecision')).toEqual([1, 2, 3, 4, 5, 6, 7, 15, 16]);
    expect(ids('tuning')).toEqual([8, 9, 10, 12, 14, 17, 18, 19, 20]);
    expect(ids('resolved')).toEqual([11, 13]);
  });

  it.each([
    [14, 'tuning', ['bombRadius']],
    [15, 'needsDecision', ['bombAffectsHunter', 'bombAffectsPellets']],
    [16, 'needsDecision', ['hunterCollectsBombs', 'hunterCollectsGhostHunt']],
    [17, 'tuning', ['ghostHuntTicks', 'ghostHuntPerLevel']],
    [18, 'tuning', ['wispDensity', 'wispPoints', 'comboWindowTicks', 'comboCap']],
    [19, 'tuning', ['audio.soundtrackDistortionMs', 'audio.soundtrackMaxRateShift']],
    [20, 'tuning', ['bombsPerLevel', 'bombKey']],
  ])('row %i has status %s and config keys %j', (id, status, keys) => {
    const q = OPEN_QUESTIONS.find((r) => r.id === id);
    expect(q?.status).toBe(status);
    expect(q?.configKeys).toEqual(keys);
  });

  it('flags approved initial defaults on rows 1-7, 15 and 16 only', () => {
    const flagged = OPEN_QUESTIONS.filter((q) => q.approvedAsInitialDefault).map((q) => q.id);
    expect(flagged).toEqual([1, 2, 3, 4, 5, 6, 7, 15, 16]);
  });
});

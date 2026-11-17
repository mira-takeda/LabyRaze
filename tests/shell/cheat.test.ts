// 30-lives cheat code (task 36.7).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, validateConfig } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { CHEAT_LIVES, CHEAT_SCORE_KEY, CLASSIC_ARCADE_CODE, CheatState, KIROGHOST, SequenceDetector, cheatConfig } from '../../src/shell/cheat';
import { HIGH_SCORE_KEY, HighScoreStore } from '../../src/shell/highScores';

function feedAll(d: SequenceDetector, codes: readonly string[]): boolean[] {
  return codes.map((c) => d.feed(c));
}

function mem(): { s: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, s: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) } };
}

describe('sequence detector', () => {
  it('detects KIROGHOST on the last key only', () => {
    const r = feedAll(new SequenceDetector(), KIROGHOST);
    expect(r.slice(0, -1).every((x) => !x)).toBe(true);
    expect(r[r.length - 1]).toBe(true);
  });

  it('detects the classic sequence', () => {
    const r = feedAll(new SequenceDetector(), CLASSIC_ARCADE_CODE);
    expect(r[r.length - 1]).toBe(true);
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it('resets on a mismatch', () => {
    const d = new SequenceDetector();
    feedAll(d, KIROGHOST.slice(0, 5));
    d.feed('KeyZ');
    expect(feedAll(d, KIROGHOST.slice(5)).some(Boolean)).toBe(false);
    expect(feedAll(d, KIROGHOST).pop()).toBe(true);
  });

  it('restarts when the mismatching key begins the code', () => {
    const d = new SequenceDetector();
    d.feed('KeyK');
    d.feed('KeyK');
    expect(feedAll(d, KIROGHOST.slice(1)).pop()).toBe(true);
  });

  it('ignores key repeat', () => {
    const d = new SequenceDetector();
    let hit = false;
    for (const c of KIROGHOST) {
      hit = d.feed(c) || hit;
      if (!hit) expect(d.feed(c, true)).toBe(false);
    }
    expect(hit).toBe(true);
  });
});

describe('cheat state', () => {
  const type = (s: CheatState, codes: readonly string[]): string[] => codes.map((c) => s.onTitleKey(c, false, 0));

  it('toggles on, then off with a second entry', () => {
    const s = new CheatState();
    expect(type(s, KIROGHOST).pop()).toBe('toggled');
    expect(s.enabled).toBe(true);
    expect(type(s, CLASSIC_ARCADE_CODE).pop()).toBe('toggled');
    expect(s.enabled).toBe(false);
  });

  it('swallows mid-code letters but lets a lone key through', () => {
    const s = new CheatState();
    expect(s.onTitleKey('Enter', false, 0)).toBe('pass');
    expect(s.onTitleKey('KeyK', false, 0)).toBe('pass');
    expect(s.onTitleKey('KeyI', false, 0)).toBe('swallow');
  });

  it('works while arrow keys also drive the menu cursor', () => {
    const s = new CheatState();
    expect(type(s, CLASSIC_ARCADE_CODE).slice(0, 4).every((r) => r === 'pass')).toBe(true);
  });
});

describe('cheat run', () => {
  it('validates and starts with 30 lives; normal runs keep 3', () => {
    const cfg = cheatConfig();
    expect(validateConfig(cfg)).toEqual([]);
    expect(createRun(7, cfg).state.lives).toBe(CHEAT_LIVES);
    expect(createRun(7, DEFAULT_CONFIG).state.lives).toBe(3);
    expect(DEFAULT_CONFIG.livesInitial).toBe(3);
  });

  it('keeps cheat scores out of the normal store', () => {
    const { s, data } = mem();
    const normal = new HighScoreStore(s);
    const cheat = new HighScoreStore(s, CHEAT_SCORE_KEY);
    cheat.submit({ score: 999, level: 5, date: 1, name: 'CHEATER' });
    expect(normal.load()).toEqual([]);
    expect(cheat.load()).toHaveLength(1);
    expect(data.has(HIGH_SCORE_KEY)).toBe(false);
    normal.submit({ score: 10, level: 1, date: 2 });
    expect(normal.load().map((e) => e.score)).toEqual([10]);
    expect(cheat.load().map((e) => e.score)).toEqual([999]);
  });
});

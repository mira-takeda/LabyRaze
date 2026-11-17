// Tolerant high score store (task 28.1) with Properties 26 and 27.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HIGH_SCORE_KEY, HighScoreStore, MAX_SCORES, parseScores, validEntry } from '../../src/shell/highScores';
import { ShellUi, drawUi } from '../../src/shell/screens';
import { mockCtx } from '../helpers/mockCanvas';
import { arbScoreList, arbStorageBlob } from '../helpers/arbitraries';

class Mem {
  map = new Map<string, string>();
  throwGet = false;
  throwSet = false;
  getItem(k: string): string | null {
    if (this.throwGet) throw new Error('denied');
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.throwSet) throw new Error('quota');
    this.map.set(k, v);
  }
}

const entry = (score: number, level = 1) => ({ score, level, date: 1_700_000_000_000, name: 'KIRO' });

describe('high score store', () => {
  it('missing key loads empty; corrupt data loads empty', () => {
    expect(new HighScoreStore(new Mem()).load()).toEqual([]);
    const m = new Mem();
    m.map.set(HIGH_SCORE_KEY, '{"v":1,"scores":[{"score":"x"}]}');
    expect(new HighScoreStore(m).load()).toEqual([]);
    m.map.set(HIGH_SCORE_KEY, 'garbage{');
    expect(new HighScoreStore(m).load()).toEqual([]);
  });

  it('keeps valid scores when one entry is corrupt', () => {
    const m = new Mem();
    m.map.set(HIGH_SCORE_KEY, JSON.stringify({ v: 1, scores: [entry(50), { score: 'x' }, entry(30)] }));
    expect(new HighScoreStore(m).load().map((e) => e.score)).toEqual([50, 30]);
  });

  it('keeps the top 10 sorted descending and persists them', () => {
    const m = new Mem();
    const s = new HighScoreStore(m);
    for (const v of [50, 10, 90, 30, 70, 20, 80, 60, 40, 100, 5, 95]) s.submit(entry(v));
    const list = s.load();
    expect(list.map((e) => e.score)).toEqual([100, 95, 90, 80, 70, 60, 50, 40, 30, 20]);
    expect(JSON.parse(m.map.get(HIGH_SCORE_KEY)!).v).toBe(1);
    expect(s.qualifies(25)).toBe(true);
    expect(s.qualifies(15)).toBe(false);
  });

  it('a throwing storage switches to memory for the session without throwing', () => {
    const m = new Mem();
    m.throwSet = true;
    const s = new HighScoreStore(m);
    expect(() => s.submit(entry(10))).not.toThrow();
    expect(s.inMemory).toBe(true);
    expect(s.load().map((e) => e.score)).toEqual([10]);
    const g = new Mem();
    g.throwGet = true;
    expect(() => new HighScoreStore(g).load()).not.toThrow();
  });

  it('Property 26: submit keeps at most 10 sorted entries containing the new score iff it ranks', () => {
    fc.assert(
      fc.property(arbScoreList, fc.nat({ max: 10_000_000 }), (existing, score) => {
        const m = new Mem();
        const valid = existing.map((e) => ({ ...e, name: e.name.slice(0, 12), level: Math.max(1, e.level) }));
        m.map.set(HIGH_SCORE_KEY, JSON.stringify({ v: 1, scores: valid }));
        const s = new HighScoreStore(m);
        const before = s.load();
        const after = s.submit({ score, level: 1, date: 1 });
        expect(after.length).toBeLessThanOrEqual(MAX_SCORES);
        for (let i = 1; i < after.length; i++) expect(after[i - 1]!.score).toBeGreaterThanOrEqual(after[i]!.score);
        const ranks = before.length < MAX_SCORES || score > before[before.length - 1]!.score;
        expect(after.some((e) => e.score === score && e.date === 1)).toBe(ranks);
        expect(new HighScoreStore(m).load()).toEqual(after);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 27: any stored string loads as a valid sorted list of at most 10 and never throws', () => {
    fc.assert(
      fc.property(arbStorageBlob, (raw) => {
        const list = parseScores(raw);
        expect(list.length).toBeLessThanOrEqual(MAX_SCORES);
        for (let i = 1; i < list.length; i++) expect(list[i - 1]!.score).toBeGreaterThanOrEqual(list[i]!.score);
      }),
      { numRuns: 300 },
    );
  });
});

describe('difficulty field', () => {
  it('stores the difficulty, accepts the new field and loads legacy entries as normal', () => {
    const m = new Mem();
    const s = new HighScoreStore(m);
    s.submit({ ...entry(50), difficulty: 'extreme' });
    s.submit(entry(40));
    expect(s.load().map((e) => [e.score, e.difficulty])).toEqual([[50, 'extreme'], [40, 'normal']]);
    m.map.set(HIGH_SCORE_KEY, JSON.stringify({ v: 1, scores: [{ score: 7, level: 2, date: 5, name: 'OLD' }] }));
    expect(new HighScoreStore(m).load()).toEqual([{ score: 7, level: 2, date: 5, name: 'OLD', difficulty: 'normal' }]);
    expect(validEntry({ score: 1, level: 1, date: 1, difficulty: 'veryHard' })).toBe(true);
    expect(validEntry({ score: 1, level: 1, date: 1, difficulty: 'insane' })).toBe(false);
  });

  it('both tables show the difficulty column', () => {
    const ui = new ShellUi();
    ui.setMode('scores', 0);
    const list = [
      { score: 900, level: 3, date: 1, name: 'ANN', difficulty: 'veryHard' as const },
      { score: 5, level: 1, date: 1, name: 'OLD' },
    ];
    const m = mockCtx();
    drawUi(m.ctx, ui, list, 504, 568, 1000, { cheatScores: list });
    expect(m.texts().join('|')).toContain('VERY HARD');
    expect(m.texts().join('|')).toContain('NORMAL');
    ui.cursor = 1;
    const c = mockCtx();
    drawUi(c.ctx, ui, [], 504, 568, 1000, { cheatScores: list });
    expect(c.texts().join('|')).toContain('CHEAT RUNS');
    expect(c.texts().join('|')).toContain('VERY HARD');
  });
});

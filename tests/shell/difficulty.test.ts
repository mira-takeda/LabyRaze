// Difficulty store, selector navigation and run config (task 40.1).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { cheatConfig } from '../../src/shell/cheat';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_KEY,
  DifficultyStore,
  difficultyConfig,
  parseDifficulty,
} from '../../src/shell/difficulty';
import { ShellUi, drawUi } from '../../src/shell/screens';
import { mockCtx } from '../helpers/mockCanvas';

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

describe('DIFFICULTIES', () => {
  it('lists NORMAL, VERY HARD and EXTREME with the specified permille', () => {
    expect(DIFFICULTIES.map((d) => [d.id, d.label, d.permille])).toEqual([
      ['normal', 'NORMAL', 1000],
      ['veryHard', 'VERY HARD', 1150],
      ['extreme', 'EXTREME', 1250],
    ]);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });
});

describe('DifficultyStore', () => {
  it('defaults to normal, persists the choice and reloads it', () => {
    const m = new Mem();
    expect(new DifficultyStore(m).load()).toBe('normal');
    new DifficultyStore(m).save('extreme');
    expect(JSON.parse(m.map.get(DIFFICULTY_KEY)!)).toEqual({ v: 1, id: 'extreme' });
    expect(new DifficultyStore(m).load()).toBe('extreme');
  });

  it('bad or missing data loads normal', () => {
    for (const raw of [null, '', 'garbage{', '5', 'null', '{"v":2,"id":"extreme"}', '{"v":1,"id":"insane"}', '{"v":1}', '[]']) {
      expect(parseDifficulty(raw)).toBe('normal');
    }
  });

  it('storage errors fall back to memory without throwing', () => {
    const m = new Mem();
    m.throwSet = true;
    const s = new DifficultyStore(m);
    expect(() => s.save('veryHard')).not.toThrow();
    expect(s.load()).toBe('veryHard');
    const g = new Mem();
    g.throwGet = true;
    expect(new DifficultyStore(g).load()).toBe('normal');
    expect(new DifficultyStore(null).load()).toBe('normal');
  });
});

describe('difficulty selector', () => {
  const open = (ui: ShellUi): void => {
    ui.cursor = 0;
    expect(ui.onKey('Enter', '', 1)).toEqual({ a: 'select' });
  };

  it('Start game opens the selector on the remembered difficulty; Enter starts the Run', () => {
    const ui = new ShellUi();
    open(ui);
    expect(ui.mode).toBe('difficulty');
    expect(ui.cursor).toBe(0);
    expect(ui.onKey('Enter', '', 2)).toEqual({ a: 'start' });
    expect(ui.mode).toBe('play');
    expect(ui.difficulty).toBe('normal');
  });

  it('left/right and up/down choose (wrapping), and the choice is used for the Run', () => {
    const ui = new ShellUi();
    open(ui);
    expect(ui.onKey('ArrowRight', '', 2)).toEqual({ a: 'move' });
    expect(ui.difficulty).toBe('veryHard');
    ui.onKey('ArrowDown', '', 3);
    expect(ui.difficulty).toBe('extreme');
    ui.onKey('ArrowRight', '', 4);
    expect(ui.difficulty).toBe('normal');
    ui.onKey('ArrowLeft', '', 5);
    expect(ui.difficulty).toBe('extreme');
    ui.onKey('ArrowUp', '', 6);
    expect(ui.difficulty).toBe('veryHard');
    expect(ui.onKey('Enter', '', 7)).toEqual({ a: 'start' });
    expect(ui.difficulty).toBe('veryHard');
  });

  it('Esc returns to the title without starting; reopening shows the last choice', () => {
    const ui = new ShellUi();
    open(ui);
    ui.onKey('ArrowRight', '', 2);
    expect(ui.onKey('Escape', '', 3)).toEqual({ a: 'select' });
    expect(ui.mode).toBe('title');
    open(ui);
    expect(ui.cursor).toBe(1);
  });

  it('other keys do nothing; title menu indices are unchanged', () => {
    const ui = new ShellUi();
    open(ui);
    expect(ui.onKey('KeyZ', 'z', 2)).toEqual({ a: 'none' });
    expect(ui.mode).toBe('difficulty');
  });

  it('draws the three labels and the speed of the selection', () => {
    const ui = new ShellUi();
    open(ui);
    const m = mockCtx();
    drawUi(m.ctx, ui, [], 504, 568, 1000);
    const text = m.texts().join('|');
    for (const f of ['DIFFICULTY', 'NORMAL', 'VERY HARD', 'EXTREME', 'x1.15', 'x1.25']) expect(text).toContain(f);
  });
});

describe('run config', () => {
  it('sets only hunterSpeedPermille and keeps the cheat lives in every mode', () => {
    for (const d of DIFFICULTIES) {
      const c = difficultyConfig(DEFAULT_CONFIG, d.id);
      expect(c).toEqual({ ...DEFAULT_CONFIG, hunterSpeedPermille: d.permille });
      const cheat = difficultyConfig(cheatConfig(DEFAULT_CONFIG), d.id);
      expect(cheat.livesInitial).toBe(30);
      expect(cheat.hunterSpeedPermille).toBe(d.permille);
    }
  });
});

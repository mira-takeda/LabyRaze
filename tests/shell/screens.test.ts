// Minimal screens (task 22.6).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import { DIFFICULTIES } from '../../src/shell/difficulty';
import { drawScreen, screenFor } from '../../src/shell/screens';
import { mockCtx } from '../helpers/mockCanvas';

describe('screens', () => {
  it('no screen while playing', () => {
    expect(screenFor(createRun(1, DEFAULT_CONFIG).state)).toBeNull();
  });

  it('level outcome screens show the outcome and the Level_Number', () => {
    const s = createRun(1, DEFAULT_CONFIG).state;
    const win = screenFor({ ...s, phase: 'levelEnd', outcome: 'playerWin', levelNumber: 4 })!;
    expect(win.title).toContain('LEVEL 4');
    expect(win.title).toContain('CLEARED');
    const loss = screenFor({ ...s, phase: 'levelEnd', outcome: 'hunterWin', levelNumber: 4 })!;
    expect(loss.title).toContain('SHADOW BITE');
    expect(loss.title).toContain('4');
    expect(win.prompt).toContain('Enter');
  });

  it('game over screen shows the final score', () => {
    const s = createRun(1, DEFAULT_CONFIG).state;
    const g = screenFor({ ...s, phase: 'gameOver', score: 4321 })!;
    expect(g.title).toBe('GAME OVER');
    expect(g.lines.join(' ')).toContain('4321');
  });

  it('continue on the level-end screen advances the run', () => {
    const run = createRun(2, DEFAULT_CONFIG);
    const ended = { ...run, state: { ...run.state, phase: 'levelEnd' as const, outcome: 'playerWin' as const } };
    const stay = step(ended, { pressed: null, bomb: false, continue: false });
    expect(stay.run.state.phase).toBe('levelEnd');
    const go = step(ended, { pressed: null, bomb: false, continue: true });
    expect(go.run.state.phase).toBe('playing');
    expect(go.run.state.levelNumber).toBe(2);
  });

  it('draws title, lines and prompt', () => {
    const m = mockCtx();
    drawScreen(m.ctx, { title: 'T', lines: ['a', 'b'], prompt: 'P' }, 500, 500, 0);
    expect(m.texts()).toEqual(['T', 'a', 'b', 'P']);
  });
});

// Menus, transitions and score screens (task 28.4).
import { ShellUi, TRANSITION_MS, drawUi } from '../../src/shell/screens';

describe('menus', () => {
  it('title menu starts a game, shows scores and help, and opens audio settings', () => {
    const ui = new ShellUi();
    expect(ui.mode).toBe('title');
    expect(ui.onKey('ArrowDown', '', 0)).toEqual({ a: 'move' });
    expect(ui.onKey('Enter', '', 0)).toEqual({ a: 'select' });
    expect(ui.mode).toBe('scores');
    ui.onKey('Enter', '', 10);
    expect(ui.mode).toBe('title');
    ui.cursor = 2;
    expect(ui.onKey('Enter', '', 20)).toEqual({ a: 'openSettings' });
    ui.cursor = 0;
    expect(ui.onKey('Enter', '', 30)).toEqual({ a: 'select' });
    expect(ui.mode).toBe('difficulty');
    expect(ui.onKey('Enter', '', 40)).toEqual({ a: 'start' });
    expect(ui.mode).toBe('play');
  });

  it('Esc pauses and resumes; quitting returns to the title', () => {
    const ui = new ShellUi();
    ui.setMode('play', 0);
    ui.onKey('Escape', '', 1);
    expect(ui.mode).toBe('paused');
    expect(ui.onKey('Escape', '', 2)).toEqual({ a: 'resume' });
    ui.onKey('KeyP', '', 3);
    ui.cursor = 3;
    expect(ui.onKey('Enter', '', 4)).toEqual({ a: 'quit' });
    expect(ui.mode).toBe('title');
  });

  it('name entry accepts letters, digits and backspace, then submits', () => {
    const ui = new ShellUi();
    ui.pendingScore = { score: 1200, level: 3 };
    ui.setMode('nameEntry', 0);
    for (const k of ['a', 'b', '%', '1']) ui.onKey(`Key${k.toUpperCase()}`, k, 1);
    ui.onKey('Backspace', '', 2);
    expect(ui.name).toBe('AB');
    expect(ui.onKey('Enter', '', 3)).toEqual({ a: 'submitName', name: 'AB' });
    expect(ui.mode).toBe('scores');
  });

  it('titles the game LABYRAZE with the Shadow Bite tagline', () => {
    const ui = new ShellUi();
    const m = mockCtx();
    drawUi(m.ctx, ui, [], 504, 568, 1000);
    const text = m.texts().join(' ');
    expect(text).toContain('LABYRAZE');
    expect(text).toContain('Shadow Bite');
    expect(text).not.toContain('KIROBIT');
  });

  it('screens fade in over the transition time and draw the top-10 table', () => {
    const ui = new ShellUi();
    ui.setMode('scores', 1000);
    expect(ui.fade(1000)).toBe(0);
    expect(ui.fade(1000 + TRANSITION_MS)).toBe(1);
    const m = mockCtx();
    drawUi(m.ctx, ui, [{ score: 500, level: 2, date: 1, name: 'ZED' }], 504, 568, 2000);
    expect(m.texts().join(' ')).toContain('HIGH SCORES');
    expect(m.texts().join(' ')).toContain('ZED');
    ui.setMode('play', 0);
    m.reset();
    drawUi(m.ctx, ui, [], 504, 568, 0);
    expect(m.calls).toHaveLength(0);
  });
});

describe('game over difficulty', () => {
  it('shows the difficulty on the game-over screen', () => {
    const s = createRun(1, DEFAULT_CONFIG).state;
    const g = screenFor({ ...s, phase: 'gameOver', score: 5 }, DIFFICULTIES[2])!;
    expect(g.lines).toContain('Difficulty EXTREME');
    const m = mockCtx();
    drawScreen(m.ctx, g, 500, 500, 0);
    expect(m.texts()).toContain('Difficulty EXTREME');
    expect(screenFor({ ...s, phase: 'gameOver' })!.lines.join(' ')).not.toContain('Difficulty');
  });
});

describe('game over pages show the difficulty', () => {
  it('name entry and scores pages draw the difficulty of the run that just ended', () => {
    const ui = new ShellUi();
    ui.pendingScore = { score: 10, level: 1 };
    ui.setMode('nameEntry', 0);
    const m = mockCtx();
    drawUi(m.ctx, ui, [], 504, 568, 1000, { difficulty: DIFFICULTIES[1] });
    const call = m.calls.find((c) => c.op === 'fillText' && c.args[0] === 'Difficulty VERY HARD');
    expect(call?.fillStyle).toBe(DIFFICULTIES[1]!.color);
    ui.setMode('scores', 1);
    const s = mockCtx();
    drawUi(s.ctx, ui, [], 504, 568, 1000, { difficulty: DIFFICULTIES[2] });
    expect(s.texts()).toContain('Last run: EXTREME');
    const none = mockCtx();
    drawUi(none.ctx, ui, [], 504, 568, 1000);
    expect(none.texts().join('|')).not.toContain('Last run');
  });
});

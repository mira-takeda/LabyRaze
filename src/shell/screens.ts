// Minimal screens (task 22.6): level outcome (outcome and Level_Number), game over, continue.
// Pure drawing from GameState; continue handling is the `continue` Input consumed by `step`.

import { DEFAULT_CONFIG } from '../core/config';
import type { GameConfig } from '../core/config';
import type { GameState } from '../core/types';
import type { Ctx2D } from '../render/layout';
import { DIFFICULTIES, difficultyById, difficultyIndex } from './difficulty';
import type { Difficulty, DifficultyId } from './difficulty';

export interface ScreenText {
  title: string;
  lines: string[];
  prompt: string;
}

/** Text of the overlay for the current phase, or null while playing. */
export function screenFor(state: GameState, difficulty?: Difficulty): ScreenText | null {
  if (state.phase === 'levelEnd') {
    const won = state.outcome === 'playerWin';
    return {
      title: won ? `LEVEL ${state.levelNumber} CLEARED` : `SHADOW BITE WINS LEVEL ${state.levelNumber}`,
      lines: won
        ? ['All three Captives are free.', `Score ${state.score}`, `Next: level ${state.levelNumber + 1}`]
        : ['Shadow Bite cleared every pellet.', `Lives left after this: ${Math.max(0, state.lives - 1)}`, `Retry level ${state.levelNumber} in a new maze`],
      prompt: 'Press Enter to continue',
    };
  }
  if (state.phase === 'gameOver') {
    return {
      title: 'GAME OVER',
      lines: [`Final score ${state.score}`, `Reached level ${state.levelNumber}`, ...(difficulty ? [`Difficulty ${difficulty.label}`] : [])],
      prompt: 'Press Enter for a new game',
    };
  }
  return null;
}

export function drawScreen(ctx: Ctx2D, screen: ScreenText, width: number, height: number, timeMs: number, fade = 1): void {
  const f = Math.max(0, Math.min(1, fade));
  ctx.save();
  ctx.globalAlpha = 0.82 * f;
  ctx.fillStyle = '#07030f';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = f;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(screen.title, width / 2, height / 2 - 60);
  ctx.fillStyle = '#f2e9ff';
  ctx.font = '15px monospace';
  screen.lines.forEach((l, i) => ctx.fillText(l, width / 2, height / 2 - 18 + i * 22));
  ctx.globalAlpha = f * (0.55 + 0.45 * Math.abs(Math.sin(timeMs / 500)));
  ctx.fillStyle = '#7fe8ff';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(screen.prompt, width / 2, height / 2 + 70);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Menus, pause, transitions and score screens (task 28.4).
// ---------------------------------------------------------------------------------------------

import type { ScoreEntry } from './highScores';

import { ACTIONS, ACTION_LABELS, KeyBindings, keyLabel } from './keybindings';
import type { Slot } from './keybindings';

export type UiMode = 'title' | 'play' | 'paused' | 'nameEntry' | 'scores' | 'help' | 'controls' | 'difficulty';

export type UiAction =
  | { a: 'none' }
  | { a: 'start' }
  | { a: 'resume' }
  | { a: 'quit' }
  | { a: 'submitName'; name: string }
  | { a: 'openSettings' }
  | { a: 'openWorkshop' }
  | { a: 'move' }
  | { a: 'select' };

export const TITLE_ITEMS = ['Start game', 'High scores', 'Settings', 'Controls', 'How to play', 'Character Workshop'] as const;
export const PAUSE_ITEMS = ['Resume', 'Settings', 'Controls', 'Quit to title'] as const;
/** Controls page rows: one per action, then these two. */
export const CONTROLS_EXTRA = ['Reset to defaults', 'Back'] as const;
export const CONTROLS_ROWS = ACTIONS.length + CONTROLS_EXTRA.length;
export const TRANSITION_MS = 380;
const NAME_CHARS = /^[A-Za-z0-9 ]$/;

export class ShellUi {
  mode: UiMode = 'title';
  cursor = 0;
  name = '';
  /** Time of the last mode change, for fade transitions. */
  changedAt = 0;
  /** Score waiting for a name (game over with a top-10 score). */
  pendingScore: { score: number; level: number } | null = null;
  /** Controls page state: which key slot is selected, whether a key is awaited, last message. */
  slot: Slot = 0;
  rebinding = false;
  message = '';
  /** Difficulty chosen on the selector (the Shell persists it when the Run starts). */
  difficulty: DifficultyId = 'normal';
  private controlsFrom: 'title' | 'paused' = 'title';

  constructor(readonly bindings: KeyBindings = new KeyBindings(null)) {}

  private is(action: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'pause', code: string): boolean {
    if (this.bindings.matches(action, code)) return true;
    // Fixed fallback so a bad remap can never lock the menus.
    switch (action) {
      case 'up': return code === 'ArrowUp';
      case 'down': return code === 'ArrowDown';
      case 'left': return code === 'ArrowLeft';
      case 'right': return code === 'ArrowRight';
      case 'confirm': return code === 'Enter' || code === 'NumpadEnter';
      default: return code === 'Escape';
    }
  }

  private openControls(from: 'title' | 'paused', now: number): UiAction {
    this.controlsFrom = from;
    this.slot = 0;
    this.rebinding = false;
    this.message = '';
    this.setMode('controls', now);
    return { a: 'select' };
  }

  private controlsKey(code: string, now: number): UiAction {
    const row = this.cursor;
    if (this.rebinding) {
      this.rebinding = false;
      if (code === 'Escape') {
        this.message = '';
        return { a: 'select' };
      }
      const action = ACTIONS[row]!;
      const r = this.bindings.set(action, this.slot, code);
      this.message = r.ok ? '' : r.reason === 'reserved' ? `${keyLabel(code)} cannot be used` : r.reason === 'locked' ? 'Every action needs a main key' : '';
      return { a: r.ok ? 'select' : 'move' };
    }
    this.message = '';
    if (this.is('pause', code)) {
      this.setMode(this.controlsFrom, now);
      return { a: 'select' };
    }
    if (this.is('up', code)) {
      this.cursor = (this.cursor + CONTROLS_ROWS - 1) % CONTROLS_ROWS;
      return { a: 'move' };
    }
    if (this.is('down', code)) {
      this.cursor = (this.cursor + 1) % CONTROLS_ROWS;
      return { a: 'move' };
    }
    if (row < ACTIONS.length) {
      if (this.is('left', code) || this.is('right', code)) {
        this.slot = this.slot === 0 ? 1 : 0;
        return { a: 'move' };
      }
      if (code === 'Delete' || code === 'Backspace') {
        if (this.slot === 1) this.bindings.clearSecondary(ACTIONS[row]!);
        return { a: 'select' };
      }
    }
    if (this.is('confirm', code)) {
      if (row < ACTIONS.length) {
        this.rebinding = true;
        return { a: 'select' };
      }
      if (row === ACTIONS.length) {
        this.bindings.reset();
        return { a: 'select' };
      }
      this.setMode(this.controlsFrom, now);
      return { a: 'select' };
    }
    return { a: 'none' };
  }

  /** Difficulty selector: left/up and right/down choose, Enter starts the Run, Esc returns to the title. */
  private difficultyKey(code: string, now: number): UiAction {
    const n = DIFFICULTIES.length;
    const prev = this.is('left', code) || this.is('up', code);
    const next = this.is('right', code) || this.is('down', code);
    if (prev || next) {
      this.cursor = (this.cursor + (prev ? n - 1 : 1)) % n;
      this.difficulty = DIFFICULTIES[this.cursor]!.id;
      return { a: 'move' };
    }
    if (this.is('confirm', code) || code === 'Space') {
      this.difficulty = DIFFICULTIES[this.cursor]!.id;
      this.setMode('play', now);
      return { a: 'start' };
    }
    if (this.is('pause', code)) {
      this.setMode('title', now);
      return { a: 'select' };
    }
    return { a: 'none' };
  }

  setMode(m: UiMode, now: number): void {
    if (this.mode === m) return;
    this.mode = m;
    this.cursor = 0;
    this.changedAt = now;
  }

  /** 0..1 fade-in of the current screen. */
  fade(now: number): number {
    return Math.max(0, Math.min(1, (now - this.changedAt) / TRANSITION_MS));
  }

  private items(): readonly string[] {
    return this.mode === 'title' ? TITLE_ITEMS : this.mode === 'paused' ? PAUSE_ITEMS : [];
  }

  /** Handles a key outside of gameplay input. Returns the action for the Shell. */
  onKey(code: string, key: string, now: number): UiAction {
    if (this.mode === 'play') {
      if (this.bindings.matches('pause', code) || (code === 'Escape' && this.bindings.actionFor(code) === null)) {
        this.setMode('paused', now);
        return { a: 'select' };
      }
      return { a: 'none' };
    }
    if (this.mode === 'nameEntry') {
      if (code === 'Enter' || code === 'NumpadEnter') {
        const n = this.name.trim() || 'SPIRIT';
        this.name = '';
        this.setMode('scores', now);
        return { a: 'submitName', name: n };
      }
      if (code === 'Backspace') {
        this.name = this.name.slice(0, -1);
        return { a: 'move' };
      }
      if (key.length === 1 && NAME_CHARS.test(key) && this.name.length < 12) {
        this.name += key.toUpperCase();
        return { a: 'move' };
      }
      return { a: 'none' };
    }
    if (this.mode === 'scores' || this.mode === 'help') {
      // Scores page: cursor 0 = normal top 10, 1 = CHEAT RUNS table.
      if (this.mode === 'scores' && (this.is('left', code) || this.is('right', code) || this.is('up', code) || this.is('down', code))) {
        this.cursor = this.cursor === 0 ? 1 : 0;
        return { a: 'move' };
      }
      if (this.is('confirm', code) || this.is('pause', code) || code === 'Space') {
        this.setMode('title', now);
        return { a: 'select' };
      }
      return { a: 'none' };
    }
    if (this.mode === 'controls') return this.controlsKey(code, now);
    if (this.mode === 'difficulty') return this.difficultyKey(code, now);
    const items = this.items();
    if (this.is('up', code)) {
      this.cursor = (this.cursor + items.length - 1) % items.length;
      return { a: 'move' };
    }
    if (this.is('down', code)) {
      this.cursor = (this.cursor + 1) % items.length;
      return { a: 'move' };
    }
    if (this.mode === 'paused' && this.is('pause', code)) {
      this.setMode('play', now);
      return { a: 'resume' };
    }
    if (this.is('confirm', code) || code === 'Space') {
      const item = items[this.cursor];
      if (this.mode === 'title') {
        if (item === 'Start game') {
          this.setMode('difficulty', now);
          this.cursor = difficultyIndex(this.difficulty);
          return { a: 'select' };
        }
        if (item === 'High scores') {
          this.setMode('scores', now);
          return { a: 'select' };
        }
        if (item === 'Settings') return { a: 'openSettings' };
        if (item === 'Controls') return this.openControls('title', now);
        if (item === 'How to play') {
          this.setMode('help', now);
          return { a: 'select' };
        }
        if (item === 'Character Workshop') return { a: 'openWorkshop' };
      }
      if (this.mode === 'paused') {
        if (item === 'Resume') {
          this.setMode('play', now);
          return { a: 'resume' };
        }
        if (item === 'Settings') return { a: 'openSettings' };
        if (item === 'Controls') return this.openControls('paused', now);
        if (item === 'Quit to title') {
          this.setMode('title', now);
          return { a: 'quit' };
        }
      }
    }
    return { a: 'none' };
  }
}

function panel(ctx: Ctx2D, width: number, height: number, alpha: number): void {
  ctx.globalAlpha = 0.86 * alpha;
  ctx.fillStyle = '#07030f';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = alpha;
}

function title(ctx: Ctx2D, text: string, x: number, y: number, size = 28, color = '#ffd23f'): void {
  ctx.font = `bold ${size}px monospace`;
  ctx.fillStyle = '#3a1460';
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Draws the menu screens (title, pause, name entry, scores, help). */
export interface UiExtras {
  /** Separate cheat-run table (shown on the second scores page). */
  cheatScores?: readonly ScoreEntry[];
  /** The run that just ended was a cheat run. */
  cheatRun?: boolean;
  /** Difficulty of the run that just ended (shown on the game-over name entry and scores pages). */
  difficulty?: Difficulty;
}

export function drawUi(ctx: Ctx2D, ui: ShellUi, scores: readonly ScoreEntry[], width: number, height: number, now: number, extras: UiExtras = {}): void {
  if (ui.mode === 'play') return;
  const a = ui.fade(now);
  ctx.save();
  panel(ctx, width, height, ui.mode === 'title' ? 1 : a);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = width / 2;
  const list = (items: readonly string[], y0: number): void => {
    items.forEach((it, i) => {
      const sel = i === ui.cursor;
      ctx.font = `${sel ? 'bold ' : ''}17px monospace`;
      ctx.fillStyle = sel ? '#7fe8ff' : '#c9bfe6';
      ctx.fillText(sel ? `> ${it} <` : it, cx, y0 + i * 32);
    });
  };
  if (ui.mode === 'title') {
    const bob = Math.sin(now / 600) * 4;
    title(ctx, 'LABYRAZE', cx, height * 0.24 + bob, 44);
    ctx.font = '15px monospace';
    ctx.fillStyle = '#ff9f43';
    ctx.fillText('HALLOWEEN MAZE', cx, height * 0.24 + 40);
    ctx.fillStyle = '#c9bfe6';
    ctx.font = '12px monospace';
    ctx.fillText('Free the three Captives before Shadow Bite clears the pellets', cx, height * 0.24 + 66);
    list(TITLE_ITEMS, height * 0.52);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#8a7fb0';
    ctx.fillText(`${ui.bindings.label('up')} / ${ui.bindings.label('down')} to choose, ${ui.bindings.label('confirm')} to select`, cx, height - 30);
  } else if (ui.mode === 'difficulty') {
    title(ctx, 'DIFFICULTY', cx, height * 0.18, 30);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#c9bfe6';
    ctx.fillText("Only Shadow Bite's speed changes", cx, height * 0.18 + 36);
    DIFFICULTIES.forEach((d, i) => {
      const sel = i === ui.cursor;
      const y = height * 0.38 + i * 54;
      ctx.font = `${sel ? 'bold ' : ''}20px monospace`;
      ctx.fillStyle = sel ? d.color : '#8a7fb0';
      ctx.fillText(sel ? `> ${d.label} <` : d.label, cx, y);
      ctx.font = '12px monospace';
      ctx.fillStyle = sel ? '#f2e9ff' : '#6f6490';
      ctx.fillText(`Shadow Bite speed x${(d.permille / 1000).toFixed(2)}`, cx, y + 22);
    });
    ctx.font = '11px monospace';
    ctx.fillStyle = '#8a7fb0';
    ctx.fillText(`${ui.bindings.label('left')} / ${ui.bindings.label('right')} to choose, ${ui.bindings.label('confirm')} to start, Esc to go back`, cx, height - 30);
  } else if (ui.mode === 'paused') {
    title(ctx, 'PAUSED', cx, height * 0.32, 32);
    list(PAUSE_ITEMS, height * 0.5);
  } else if (ui.mode === 'controls') {
    title(ctx, 'CONTROLS', cx, height * 0.12, 28);
    ctx.font = '14px monospace';
    const rows = [...ACTIONS.map((act) => ACTION_LABELS[act]), ...CONTROLS_EXTRA];
    rows.forEach((name, i) => {
      const sel = i === ui.cursor;
      ctx.font = `${sel ? 'bold ' : ''}15px monospace`;
      ctx.fillStyle = sel ? '#7fe8ff' : '#c9bfe6';
      let text = name;
      const act = ACTIONS[i];
      if (act !== undefined) {
        const [p, s] = ui.bindings.get(act);
        const slots = [keyLabel(p), keyLabel(s)].map((l, k) => (sel && k === ui.slot ? (ui.rebinding ? '[Press a key...]' : `[${l}]`) : l));
        text = `${name.padEnd(11)} ${slots[0]}  ${slots[1]}`;
      }
      ctx.fillText(sel && act === undefined ? `> ${text} <` : text, cx, height * 0.22 + i * 28);
    });
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ff9f43';
    if (ui.message) ctx.fillText(ui.message, cx, height - 62);
    ctx.fillStyle = '#8a7fb0';
    ctx.fillText('Up/Down choose, Left/Right main or second key', cx, height - 46);
    ctx.fillText(`${ui.bindings.label('confirm')} to rebind, Esc cancels, Del clears second key`, cx, height - 30);
  } else if (ui.mode === 'nameEntry') {
    title(ctx, 'NEW HIGH SCORE', cx, height * 0.28, 28);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#f2e9ff';
    ctx.fillText(`${ui.pendingScore?.score ?? 0} points, level ${ui.pendingScore?.level ?? 1}`, cx, height * 0.4);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#7fe8ff';
    const caret = Math.floor(now / 400) % 2 === 0 ? '_' : ' ';
    ctx.fillText(`${ui.name}${caret}`, cx, height * 0.52);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#8a7fb0';
    ctx.fillText('Type your name, Enter to save', cx, height * 0.62);
    if (extras.difficulty) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = extras.difficulty.color;
      ctx.fillText(`Difficulty ${extras.difficulty.label}`, cx, height * 0.46);
    }
    if (extras.cheatRun) {
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ff5ad1';
      ctx.fillText('CHEAT RUN - score not ranked', cx, height * 0.7);
    }
  } else if (ui.mode === 'scores') {
    const cheatPage = ui.cursor === 1;
    const table = cheatPage ? (extras.cheatScores ?? []) : scores;
    title(ctx, cheatPage ? 'CHEAT RUNS' : 'HIGH SCORES', cx, height * 0.14, 28, cheatPage ? '#ff5ad1' : '#ffd23f');
    ctx.font = '14px monospace';
    if (table.length === 0) {
      ctx.fillStyle = '#c9bfe6';
      ctx.fillText(cheatPage ? 'No cheat runs yet.' : 'No scores yet. Go free some ghosts!', cx, height * 0.4);
    }
    table.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#ffd23f' : '#f2e9ff';
      const name = (s.name ?? 'SPIRIT').padEnd(12, ' ');
      ctx.fillText(`${String(i + 1).padStart(2, ' ')}. ${name} ${String(s.score).padStart(8, ' ')}  L${String(s.level).padEnd(3, ' ')} ${difficultyById(s.difficulty).label}`, cx, height * 0.25 + i * 26);
    });
    ctx.font = '12px monospace';
    ctx.fillStyle = '#8a7fb0';
    if (extras.cheatRun) {
      ctx.fillStyle = '#ff5ad1';
      ctx.fillText('CHEAT RUN - score not ranked', cx, height - 62);
      ctx.fillStyle = '#8a7fb0';
    }
    if (extras.difficulty) {
      ctx.fillStyle = extras.difficulty.color;
      ctx.fillText(`Last run: ${extras.difficulty.label}`, cx, height - 78);
      ctx.fillStyle = '#8a7fb0';
    }
    if ((extras.cheatScores?.length ?? 0) > 0) ctx.fillText('Left/Right: switch normal and CHEAT RUNS tables', cx, height - 46);
    ctx.fillText('Enter to return', cx, height - 30);
  } else if (ui.mode === 'help') {
    title(ctx, 'HOW TO PLAY', cx, height * 0.12, 26);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#f2e9ff';
    ctx.textAlign = 'left';
    helpLines(ui.bindings).forEach((l, i) => {
      ctx.font = l.head ? 'bold 12px monospace' : '12px monospace';
      ctx.fillStyle = l.color ?? '#f2e9ff';
      ctx.fillText(l.text, 18, height * 0.18 + i * 19);
    });
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = '#8a7fb0';
    ctx.fillText('Enter to return', cx, height - 30);
  }
  ctx.restore();
}

export interface HelpLine {
  text: string;
  color?: string;
  head?: boolean;
}

/** How to Play text, with the live key bindings and the real config values. */
export function helpLines(bindings: KeyBindings, cfg: GameConfig = DEFAULT_CONFIG): HelpLine[] {
  const s = (ticks: number): string => `${Math.round((ticks / cfg.tickRate) * 10) / 10} s`;
  const w = cfg.scoreWeights;
  const move = (['up', 'down', 'left', 'right'] as const).map((a) => bindings.label(a)).join(' ');
  return [
    { text: `Move ${move}  Bomb ${bindings.label('bomb')}  Pause ${bindings.label('pause')}`, color: '#8a7fb0' },
    { text: 'Fullscreen: F or Settings. Reduced motion: Settings.', color: '#8a7fb0' },
    { text: 'Character Workshop (title menu): draw your own look.', color: '#8a7fb0' },
    { text: 'YOU WIN THE LEVEL', head: true, color: '#7fe8ff' },
    { text: `  Pick up Keys and bring them to the Cage. Each Key frees` },
    { text: `  one Captive ghost (+${w.captive}). Free all 3 to win (+${w.level}).` },
    { text: 'SHADOW BITE WINS THE LEVEL', head: true, color: '#ffd23f' },
    { text: '  if he eats every amber pellet first. If he catches you,' },
    { text: '  you lose a life and drop the Keys you carry.' },
    { text: 'SPIRIT WISPS (cool glowing orbs, yours only)', head: true, color: '#9ff0ff' },
    { text: `  +${cfg.wispPoints} x Combo each. Chain Wisps within ${s(cfg.comboWindowTicks)} to raise` },
    { text: `  the Combo up to x${cfg.comboCap}; reaching x${cfg.comboCap} adds a +${cfg.comboCapBonus} bonus.` },
    { text: '  Getting caught resets the Combo. Wisps are never pellets.' },
    { text: 'POWERS AND ITEMS', head: true, color: '#ff9ee6' },
    { text: `  Power pellet: ${s(cfg.powerTicks)} to eat Shadow Bite (+${w.hunterEaten}).` },
    { text: '  If Shadow Bite takes one, he can eat you and yours ends.' },
    { text: `  Speed pellet: move faster for ${s(cfg.speedDurationTicks)}.` },
    { text: `  Bomb: carry up to ${cfg.bombCapacity}, blast nearby walls (not Shadow Bite).` },
    { text: `  Ghost Hunt: the 3 ghosts chase Shadow Bite for ${s(cfg.ghostHuntTicks)}.` },
    { text: '  Doors open and close on their own; watch the warning glow.' },
  ];
}

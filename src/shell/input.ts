// Keyboard input capture (task 22.3). Arrow keys and WASD map to directions; presses go into an
// ordered queue drained once per Tick, so quick sequences across Ticks are not lost. Space (the
// configured bomb key) yields `bomb: true` for exactly one Tick per press. Enter (or Space outside
// play) yields `continue` for level-end and game-over acknowledgement.

import type { Dir, Input } from '../core/types';
import { KeyBindings } from './keybindings';

const DIR_ACTIONS = [['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right']] as const;

/** At most this many direction presses wait for future Ticks (older ones are dropped). */
export const MAX_QUEUED_PRESSES = 4;

export interface KeyLike {
  code: string;
  repeat?: boolean;
  preventDefault?: () => void;
}

/** Optional diagnostics only; observers cannot change the queue or its FIFO policy. */
export interface InputObserver {
  queued(timeMs: number, ahead: number): void;
  consumed(): void;
  discarded(reason: 'overflow' | 'clear'): void;
}

export class InputCapture {
  observer?: InputObserver;
  private readonly dirs: Dir[] = [];
  private bombs = 0;
  private cont = false;
  /** When false (level end, game over, menus) Space acknowledges instead of bombing. */
  playing = true;
  /** Ticks at which a press was enqueued, for the latency harness (frame time of the press). */
  readonly pressTimes: number[] = [];

  readonly bindings: KeyBindings;

  /** `bindings` are the live remappable keys; without them the defaults apply, with `bombKey` for bomb. */
  constructor(bombKey = 'Space', bindings?: KeyBindings) {
    this.bindings = bindings ?? new KeyBindings(null);
    if (!bindings && bombKey !== 'Space') this.bindings.set('bomb', 0, bombKey);
  }

  private direction(code: string): Dir | undefined {
    for (const [action, dir] of DIR_ACTIONS) if (this.bindings.matches(action, code)) return dir;
    return undefined;
  }

  onKeyDown(e: KeyLike, timeMs = 0): boolean {
    const d = this.direction(e.code);
    if (d !== undefined) {
      e.preventDefault?.();
      if (e.repeat) return true;
      if (this.dirs.length === MAX_QUEUED_PRESSES) this.observer?.discarded('overflow');
      this.observer?.queued(timeMs, Math.min(this.dirs.length, MAX_QUEUED_PRESSES - 1));
      this.dirs.push(d);
      this.pressTimes.push(timeMs);
      if (this.dirs.length > MAX_QUEUED_PRESSES) {
        this.dirs.shift();
        this.pressTimes.shift();
      }
      return true;
    }
    if (this.bindings.matches('bomb', e.code)) {
      e.preventDefault?.();
      if (e.repeat) return true;
      if (this.playing) this.bombs++;
      else this.cont = true;
      return true;
    }
    const owner = this.bindings.actionFor(e.code);
    if (owner === 'confirm' || (owner === null && (e.code === 'Enter' || e.code === 'NumpadEnter'))) {
      e.preventDefault?.();
      this.cont = true;
      return true;
    }
    return false;
  }

  /** The Input for one Tick. Consumes at most one direction and one bomb press. */
  nextInput(): Input {
    const pressed = this.dirs.shift() ?? null;
    if (pressed !== null) {
      this.pressTimes.shift();
      this.observer?.consumed();
    }
    const bomb = this.bombs > 0;
    if (bomb) this.bombs--;
    const c = this.cont;
    this.cont = false;
    return { pressed, bomb, continue: c };
  }

  /** Drops everything pending (used when a screen is dismissed). */
  clear(): void {
    for (let i = 0; i < this.dirs.length; i++) this.observer?.discarded('clear');
    this.dirs.length = 0;
    this.pressTimes.length = 0;
    this.bombs = 0;
    this.cont = false;
  }

  get pendingDirections(): number {
    return this.dirs.length;
  }

  attach(target: Pick<Window, 'addEventListener' | 'removeEventListener'>, now: () => number): () => void {
    const handler = (e: KeyboardEvent): void => {
      this.onKeyDown(e, now());
    };
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }
}

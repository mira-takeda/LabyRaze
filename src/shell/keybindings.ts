// Remappable controls (task 36.6). Seven actions, each with a primary key and an optional
// secondary key, stored under `kirobit.keys.v1`. Loading is strict and tolerant: anything wrong
// yields the defaults and never throws. Every action always keeps a primary key, so the player
// cannot lock themselves out. The menus also keep arrows, Enter and Escape as a fixed fallback.

import type { StorageLike } from './highScores';

export const KEYBINDINGS_KEY = 'kirobit.keys.v1';

export const ACTIONS = ['up', 'down', 'left', 'right', 'bomb', 'pause', 'confirm'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  bomb: 'Bomb',
  pause: 'Pause',
  confirm: 'Confirm',
};

/** primary (never null) and secondary (may be null). */
export type Slot = 0 | 1;
export type Pair = [string, string | null];
export type BindingMap = Record<Action, Pair>;

export const DEFAULT_BINDINGS: Readonly<Record<Action, readonly [string, string | null]>> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  bomb: ['Space', null],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
};

export function defaultMap(): BindingMap {
  const m = {} as BindingMap;
  for (const a of ACTIONS) m[a] = [DEFAULT_BINDINGS[a][0], DEFAULT_BINDINGS[a][1]];
  return m;
}

/** Keys that the browser or OS needs, or that make no sense as a game key. */
export function isReserved(code: string): boolean {
  return (
    code === '' ||
    code === 'Tab' ||
    code === 'ContextMenu' ||
    code === 'CapsLock' ||
    code === 'Unidentified' ||
    /^F\d{1,2}$/.test(code) ||
    /^(Meta|OS|Control|Alt|Shift)/.test(code)
  );
}

export type BindResult = { ok: true } | { ok: false; reason: 'reserved' | 'cancel' | 'locked' };

/** Human-readable label for a KeyboardEvent.code. */
export function keyLabel(code: string | null): string {
  if (code === null) return '-';
  const fixed: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Enter: 'Enter',
    NumpadEnter: 'Num Enter',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  const f = fixed[code];
  if (f !== undefined) return f;
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!;
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1]!;
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  return code;
}

/** Strict parser. Returns null for anything that is not a complete, conflict-free map. */
export function parseBindings(raw: string | null): BindingMap | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as { v?: unknown; keys?: unknown };
  if (o.v !== 1 || o.keys === null || typeof o.keys !== 'object' || Array.isArray(o.keys)) return null;
  const keys = o.keys as Record<string, unknown>;
  const out = {} as BindingMap;
  const seen = new Set<string>();
  for (const a of ACTIONS) {
    const p = keys[a];
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [k0, k1] = p as unknown[];
    if (typeof k0 !== 'string' || isReserved(k0) || seen.has(k0)) return null;
    seen.add(k0);
    if (k1 !== null) {
      if (typeof k1 !== 'string' || isReserved(k1) || seen.has(k1)) return null;
      seen.add(k1);
    }
    out[a] = [k0, k1];
  }
  return out;
}

export class KeyBindings {
  private map: BindingMap;

  constructor(private storage: StorageLike | null = null) {
    this.map = this.load();
  }

  private load(): BindingMap {
    if (this.storage === null) return defaultMap();
    try {
      return parseBindings(this.storage.getItem(KEYBINDINGS_KEY)) ?? defaultMap();
    } catch {
      return defaultMap();
    }
  }

  private save(): void {
    if (this.storage === null) return;
    try {
      this.storage.setItem(KEYBINDINGS_KEY, JSON.stringify({ v: 1, keys: this.map }));
    } catch {
      this.storage = null; // keep the bindings in memory for this session
    }
  }

  get(action: Action): Readonly<Pair> {
    return [this.map[action][0], this.map[action][1]];
  }

  matches(action: Action, code: string): boolean {
    const p = this.map[action];
    return p[0] === code || p[1] === code;
  }

  actionFor(code: string): Action | null {
    for (const a of ACTIONS) if (this.matches(a, code)) return a;
    return null;
  }

  /** "Up / W" style label of an action's keys. */
  label(action: Action): string {
    const [p, s] = this.map[action];
    return s === null ? keyLabel(p) : `${keyLabel(p)} / ${keyLabel(s)}`;
  }

  /**
   * Binds `code` to a slot. A key already used elsewhere is swapped: the other binding receives
   * this slot's previous key. If that would leave any action without a primary key, nothing changes.
   */
  set(action: Action, slot: Slot, code: string): BindResult {
    if (isReserved(code)) return { ok: false, reason: 'reserved' };
    if (code === 'Escape') return { ok: false, reason: 'cancel' };
    const current = this.map[action][slot];
    if (current === code) return { ok: true };
    let owner: { a: Action; i: Slot } | null = null;
    for (const a of ACTIONS) {
      for (const i of [0, 1] as const) if (this.map[a][i] === code) owner = { a, i };
    }
    if (owner !== null) {
      if (current === null && owner.i === 0) return { ok: false, reason: 'locked' };
      if (owner.i === 0) this.map[owner.a][0] = current as string;
      else this.map[owner.a][1] = current;
    }
    this.map[action][slot] = code;
    this.save();
    return { ok: true };
  }

  /** Clears a secondary binding. The primary can only be replaced, never removed. */
  clearSecondary(action: Action): void {
    if (this.map[action][1] === null) return;
    this.map[action][1] = null;
    this.save();
  }

  reset(): void {
    this.map = defaultMap();
    this.save();
  }
}

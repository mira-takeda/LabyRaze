// Volume and mute persistence (task 29.2). Key `kirobit.audio.v1`, JSON
// { v: 1, master, music, sfx, muted: { master, music, sfx } }. Strict, tolerant loading: bad
// fields fall back to defaults; missing, corrupt or throwing storage never throws. Saves are
// debounced 250 ms and can be flushed (on pagehide).

import type { StorageLike } from './audioPort';
import { AUDIO_DEFAULTS, BUS_NAMES, clamp01 } from './buses';
import type { BusName } from './buses';

export const AUDIO_KEY = 'kirobit.audio.v1';
export const SAVE_DEBOUNCE_MS = 250;

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: Record<BusName, boolean>;
}

export function defaultSettings(defaults: Readonly<Record<BusName, number>> = AUDIO_DEFAULTS): AudioSettings {
  return { master: defaults.master, music: defaults.music, sfx: defaults.sfx, muted: { master: false, music: false, sfx: false } };
}

/** Parses a stored string; never throws. */
export function parseSettings(raw: string | null, defaults: Readonly<Record<BusName, number>> = AUDIO_DEFAULTS): AudioSettings {
  const out = defaultSettings(defaults);
  if (raw === null) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return out;
  const o = data as Record<string, unknown>;
  for (const b of BUS_NAMES) {
    const v = o[b];
    if (typeof v === 'number' && Number.isFinite(v)) out[b] = clamp01(v);
  }
  const m = o.muted;
  if (m !== null && typeof m === 'object' && !Array.isArray(m)) {
    for (const b of BUS_NAMES) {
      const x = (m as Record<string, unknown>)[b];
      if (typeof x === 'boolean') out.muted[b] = x;
    }
  }
  return out;
}

export function serializeSettings(s: AudioSettings): string {
  return JSON.stringify({ v: 1, master: clamp01(s.master), music: clamp01(s.music), sfx: clamp01(s.sfx), muted: { ...s.muted } });
}

export class AudioStore {
  private memory: string | null = null;
  private pending: AudioSettings | null = null;
  private timer: unknown = null;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly timers: { set: (cb: () => void, ms: number) => unknown; clear: (h: unknown) => void } | null = null,
    private readonly defaults: Readonly<Record<BusName, number>> = AUDIO_DEFAULTS,
  ) {}

  load(): AudioSettings {
    let raw: string | null = this.memory;
    try {
      if (this.storage) raw = this.storage.getItem(AUDIO_KEY) ?? this.memory;
    } catch {
      raw = this.memory;
    }
    return parseSettings(raw, this.defaults);
  }

  /** Writes immediately (falls back to memory if storage throws). */
  saveNow(s: AudioSettings): void {
    const text = serializeSettings(s);
    this.memory = text;
    try {
      this.storage?.setItem(AUDIO_KEY, text);
    } catch {
      // in-memory fallback already holds the value
    }
  }

  /** Debounced save. */
  save(s: AudioSettings): void {
    this.pending = { ...s, muted: { ...s.muted } };
    this.memory = serializeSettings(this.pending);
    if (!this.timers) {
      this.flush();
      return;
    }
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.timer !== null && this.timers) this.timers.clear(this.timer);
    this.timer = null;
    if (this.pending) {
      this.saveNow(this.pending);
      this.pending = null;
    }
  }
}

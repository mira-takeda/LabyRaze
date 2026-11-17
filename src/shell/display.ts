// Display settings (second playtest): fullscreen scaling and reduced motion. Shell only.

import type { StorageLike } from './highScores';

export const DISPLAY_KEY = 'kirobit.display.v1';
/** Integer scales from this size up are always used (every art pixel the same size). */
export const MIN_INTEGER_SCALE = 2;

/** Level-start hold on a LevelMilestone (display setting, not part of the deterministic core). */
export const celebrationHoldMs = 3000;

/** Keys that confirm (and so skip the celebration hold) when not rebound to another action. */
export function isConfirmCode(code: string): boolean {
  return code === 'Enter' || code === 'NumpadEnter';
}

export interface DisplaySettings {
  reducedMotion: boolean;
}

/**
 * CSS scale for a w x h canvas in an aw x ah area. The aspect ratio is always kept (no stretch).
 * From 2x up the largest integer scale is used, so every art pixel has the same size (letterboxed).
 * Below 2x (e.g. 1080p, where 1x would fill half the screen) the exact fit is used with
 * nearest-neighbour sampling (image-rendering: pixelated).
 */
export function pickScale(aw: number, ah: number, w: number, h: number): number {
  const k = Math.min(aw / w, ah / h);
  if (!(k > 0) || !Number.isFinite(k)) return 1;
  const n = Math.floor(k);
  return n >= MIN_INTEGER_SCALE ? n : k;
}

/** Stored settings, or the OS reduced-motion preference when nothing is stored. */
export function loadDisplay(store: StorageLike | null, prefersReduced: boolean): DisplaySettings {
  try {
    const raw = store?.getItem(DISPLAY_KEY) ?? null;
    if (raw !== null) {
      const v = JSON.parse(raw) as { reducedMotion?: unknown };
      if (typeof v.reducedMotion === 'boolean') return { reducedMotion: v.reducedMotion };
    }
  } catch {
    // Corrupt or blocked storage: fall back to the OS preference.
  }
  return { reducedMotion: prefersReduced };
}

export function saveDisplay(store: StorageLike | null, s: DisplaySettings): void {
  try {
    store?.setItem(DISPLAY_KEY, JSON.stringify({ reducedMotion: s.reducedMotion }));
  } catch {
    // Storage full or blocked: the setting still applies for this session.
  }
}

/** Renderer motion settings for the reduced-motion flag: no camera shake, softer flashes. */
export function motionFor(s: DisplaySettings): { shake: boolean; flash: number } {
  return s.reducedMotion ? { shake: false, flash: 0.4 } : { shake: true, flash: 1 };
}

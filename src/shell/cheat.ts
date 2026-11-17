// 30-lives cheat code (task 36.7). A pure typed-sequence detector plus a small Shell-side state
// holder. The Simulation never sees the flag: a cheat run is just createRun with livesInitial 30.
// Cheat scores go to a separate store and are never ranked in the normal top 10.

import { DEFAULT_CONFIG } from '../core/config';
import type { GameConfig } from '../core/config';
import { HUD_H } from '../render/layout';
import type { Ctx2D } from '../render/layout';

export const CHEAT_LIVES = 30;
export const CHEAT_SCORE_KEY = 'kirobit.highscores.cheat.v1';

export const KIROGHOST: readonly string[] = ['KeyK', 'KeyI', 'KeyR', 'KeyO', 'KeyG', 'KeyH', 'KeyO', 'KeyS', 'KeyT'];
/** The classic Up-Up-Down-Down-Left-Right-Left-Right-B-A arcade code. */
export const CLASSIC_ARCADE_CODE: readonly string[] = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA',
];

/** Config for a cheat run: identical rules, 30 starting lives. */
export function cheatConfig(base: GameConfig = DEFAULT_CONFIG): GameConfig {
  return { ...base, livesInitial: CHEAT_LIVES };
}

/** Detects any of several code sequences in a stream of KeyboardEvent.code values. */
export class SequenceDetector {
  private progress: number[];

  constructor(private readonly sequences: ReadonlyArray<readonly string[]> = [KIROGHOST, CLASSIC_ARCADE_CODE]) {
    this.progress = sequences.map(() => 0);
  }

  /** Longest partial match currently held. */
  get longest(): number {
    return Math.max(0, ...this.progress);
  }

  reset(): void {
    this.progress = this.sequences.map(() => 0);
  }

  /** Feeds one key. Auto-repeat events are ignored. Returns true when a full code was typed. */
  feed(code: string, repeat = false): boolean {
    if (repeat) return false;
    let matched = false;
    this.sequences.forEach((seq, i) => {
      let p = this.progress[i]!;
      if (seq[p] === code) p++;
      else p = seq[0] === code ? 1 : 0;
      if (p === seq.length) {
        matched = true;
        p = 0;
      }
      this.progress[i] = p;
    });
    if (matched) this.reset();
    return matched;
  }
}

export type CheatKeyResult = 'toggled' | 'swallow' | 'pass';

/** Shell-side cheat state: the armed flag plus the title-screen detector. */
export class CheatState {
  enabled = false;
  /** Time of the last toggle, for the banner animation. */
  toggledAt = -Infinity;
  private readonly detector = new SequenceDetector();

  /**
   * Feeds a title-screen key before the menu sees it. A completed code toggles the cheat. Keys in
   * the middle of a partial code are swallowed so remapped menu keys cannot fire mid-code.
   */
  onTitleKey(code: string, repeat: boolean, now: number): CheatKeyResult {
    if (this.detector.feed(code, repeat)) {
      this.enabled = !this.enabled;
      this.toggledAt = now;
      return 'toggled';
    }
    return this.detector.longest >= 2 && !code.startsWith('Arrow') ? 'swallow' : 'pass';
  }
}

/** Banner text for the title screen, or null when the cheat is off. */
export const CHEAT_BANNER = `${CHEAT_LIVES} LIVES CHEAT ON`;
export const CHEAT_RUN_NOTE = 'CHEAT RUN - score not ranked';

/** Big pulsing title banner. */
export function drawCheatBanner(ctx: Ctx2D, width: number, height: number, now: number): void {
  const pulse = 0.65 + 0.35 * Math.abs(Math.sin(now / 260));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = pulse;
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#3a1460';
  ctx.fillText(CHEAT_BANNER, width / 2 + 2, height * 0.9 + 2);
  ctx.fillStyle = '#ff5ad1';
  ctx.fillText(CHEAT_BANNER, width / 2, height * 0.9);
  ctx.restore();
}

/** Small HUD badge shown during a cheat run. */
export function drawCheatBadge(ctx: Ctx2D, width: number): void {
  ctx.save();
  // Row 3, in the free gap between the lives and the Wisp counter (never over the Wisp or Combo text).
  void width;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff5ad1';
  ctx.fillText('CHEAT RUN', 180, HUD_H - 17);
  ctx.restore();
}

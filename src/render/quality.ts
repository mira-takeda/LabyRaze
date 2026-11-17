// Quality tier controller (task 27.1). Rolling 120-frame window of Frame_Time; steps the tier
// down when p95 > 16.7 ms for 2 consecutive seconds, and up after 10 s of good frames. Tiers only
// change visual settings; the Simulation is never touched.

import type { QualityTier } from '../core/config';

export interface TierSettings {
  glow: boolean;
  glowScale: number; // offscreen glow resolution factor
  particleDensity: number;
  trailEvery: number; // emit trails every N frames (0 = off)
  shake: boolean;
}

export const TIER_SETTINGS: Readonly<Record<QualityTier, TierSettings>> = {
  high: { glow: true, glowScale: 0.5, particleDensity: 1, trailEvery: 2, shake: true },
  medium: { glow: true, glowScale: 0.25, particleDensity: 0.6, trailEvery: 4, shake: true },
  // Shake costs one translate per frame, so it stays on at every tier (second playtest: the low
  // tier made it invisible on modest hardware). Reduced motion in Settings turns it off.
  low: { glow: false, glowScale: 0, particleDensity: 0.3, trailEvery: 0, shake: true },
};

export const WINDOW_FRAMES = 120;
export const BUDGET_MS = 16.7;
export const DOWNGRADE_AFTER_MS = 2000;
export const RECOVER_AFTER_MS = 10_000;

export class QualityController {
  private readonly samples = new Float64Array(WINDOW_FRAMES);
  private n = 0;
  private head = 0;
  private badSince: number | null = null;
  private goodSince: number | null = null;
  private idx: number;
  changes = 0;

  constructor(
    private readonly tiers: readonly QualityTier[] = ['high', 'medium', 'low'],
    start: QualityTier = 'high',
  ) {
    this.idx = Math.max(0, tiers.indexOf(start));
  }

  get tier(): QualityTier {
    return this.tiers[this.idx]!;
  }

  get settings(): TierSettings {
    return TIER_SETTINGS[this.tier];
  }

  p95(): number {
    if (this.n === 0) return 0;
    const xs = Array.from(this.samples.subarray(0, this.n)).sort((a, b) => a - b);
    return xs[Math.floor(0.95 * (xs.length - 1))]!;
  }

  /** Records one frame's Frame_Time (ms) at time `now` (ms). Returns the active tier. */
  record(frameMs: number, now: number): QualityTier {
    this.samples[this.head] = frameMs;
    this.head = (this.head + 1) % WINDOW_FRAMES;
    this.n = Math.min(WINDOW_FRAMES, this.n + 1);
    if (this.n < 30) return this.tier;
    const bad = this.p95() > BUDGET_MS;
    if (bad) {
      this.goodSince = null;
      this.badSince ??= now;
      if (now - this.badSince >= DOWNGRADE_AFTER_MS && this.idx < this.tiers.length - 1) {
        this.idx++;
        this.changes++;
        this.reset(now);
      }
    } else {
      this.badSince = null;
      this.goodSince ??= now;
      if (now - this.goodSince >= RECOVER_AFTER_MS && this.idx > 0) {
        this.idx--;
        this.changes++;
        this.reset(now);
      }
    }
    return this.tier;
  }

  private reset(now: number): void {
    this.n = 0;
    this.head = 0;
    this.badSince = null;
    this.goodSince = now;
  }
}

// Level milestone celebration (task 37.3): "CONGRATULATIONS!" with a wave, "LEVEL N" below,
// firework and confetti bursts from the shared particle pool and a soft golden flash. Render-only:
// it reads the LevelMilestone event and never writes to the Simulation. Visual randomness comes
// from the pool's VisualRng. The camera is never shaken; reduced motion flattens the wave, thins
// the bursts and weakens the flash.

import type { GameEvent } from '../core/events';
import type { Ctx2D } from './layout';
import { HUD_H } from './layout';
import { ParticleKind, hex } from './particles';
import type { ParticlePool } from './particles';

/** Default celebration length (matches the Shell hold, `celebrationHoldMs`). */
export const CELEBRATION_MS = 3000;
export const FIREWORK_EVERY_MS = 320;
export const CONFETTI_EVERY_MS = 90;
export const GOLD_FLASH_MS = 450;
const FADE_MS = 350;

const FIREWORK_COLOURS = ['#ffd95a', '#ff6fb5', '#3fd6c6', '#ff9f43', '#c29bff', '#ffffff'].map(hex);
const CONFETTI_COLOURS = ['#ffd95a', '#ff6fb5', '#5dff7a', '#7fe8ff', '#c29bff'].map(hex);

export class CelebrationLayer {
  private start = -Infinity;
  private end = -Infinity;
  private levelNumber = 0;
  private nextFirework = 0;
  private nextConfetti = 0;
  /** Flash strength multiplier (reduced motion lowers it). */
  flashScale = 1;
  /** False under reduced motion: no letter wave, fewer bursts. */
  motionEnabled = true;

  constructor(
    private readonly pool: ParticlePool,
    public durationMs = CELEBRATION_MS,
  ) {}

  /** Level shown by the running celebration (0 when none). */
  get level(): number {
    return this.levelNumber;
  }

  isActive(now: number): boolean {
    return now >= this.start && now < this.end;
  }

  handle(events: ReadonlyArray<GameEvent>, now: number): void {
    for (const e of events) {
      if (e.t !== 'LevelMilestone') continue;
      this.start = now;
      this.end = now + this.durationMs;
      this.levelNumber = e.level;
      this.nextFirework = now;
      this.nextConfetti = now;
    }
  }

  /** Ends the celebration early (the Shell calls this when the confirm key skips the hold). */
  finish(now: number): void {
    if (this.isActive(now)) this.end = now;
  }

  clear(): void {
    this.start = -Infinity;
    this.end = -Infinity;
    this.levelNumber = 0;
  }

  private firework(cx: number, cy: number): void {
    const p = this.pool;
    const base = FIREWORK_COLOURS[Math.floor(p.rng.range(0, FIREWORK_COLOURS.length))]!;
    const alt = FIREWORK_COLOURS[Math.floor(p.rng.range(0, FIREWORK_COLOURS.length))]!;
    for (let i = 0, n = p.count(this.motionEnabled ? 26 : 12); i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + p.rng.range(-0.1, 0.1);
      const v = p.rng.range(70, 130);
      p.spawn(cx, cy, Math.cos(a) * v, Math.sin(a) * v, p.rng.range(0.7, 1.2), 3, ParticleKind.Spark, i % 2 ? base : alt, 70);
    }
  }

  private confetti(width: number): void {
    const p = this.pool;
    for (let i = 0, n = p.count(this.motionEnabled ? 4 : 1); i < n; i++) {
      p.spawn(
        p.rng.range(0, width),
        HUD_H - 4,
        p.rng.range(-25, 25),
        p.rng.range(20, 70),
        p.rng.range(1.2, 2.2),
        3,
        ParticleKind.Pixel,
        CONFETTI_COLOURS[Math.floor(p.rng.range(0, CONFETTI_COLOURS.length))]!,
        90,
      );
    }
  }

  /** Spawns due bursts and draws the text and golden flash. height is the full canvas height. */
  draw(ctx: Ctx2D, now: number, width: number, height: number): void {
    if (!this.isActive(now)) return;
    while (now >= this.nextFirework) {
      const p = this.pool;
      this.firework(p.rng.range(width * 0.15, width * 0.85), p.rng.range(HUD_H + (height - HUD_H) * 0.08, HUD_H + (height - HUD_H) * 0.55));
      this.nextFirework += FIREWORK_EVERY_MS * (this.motionEnabled ? 1 : 2);
    }
    while (now >= this.nextConfetti) {
      this.confetti(width);
      this.nextConfetti += CONFETTI_EVERY_MS;
    }
    const age = now - this.start;
    const fadeOut = Math.min(1, (this.end - now) / FADE_MS);
    const fadeIn = Math.min(1, age / 200);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

    ctx.save();
    // Soft golden flash at the start.
    if (age < GOLD_FLASH_MS) {
      ctx.globalAlpha = 0.35 * this.flashScale * (1 - age / GOLD_FLASH_MS);
      ctx.fillStyle = '#ffd95a';
      ctx.fillRect(0, 0, width, height);
    }
    // Dim band behind the text for contrast.
    const cx = width / 2;
    const cy = HUD_H + (height - HUD_H) * 0.38;
    ctx.globalAlpha = 0.45 * alpha;
    ctx.fillStyle = '#0b0614';
    ctx.fillRect(0, Math.round(cy - 34), width, 112);

    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = 'CONGRATULATIONS!';
    const size = 26;
    const step = size * 0.62;
    ctx.font = `bold ${size}px monospace`;
    const x0 = cx - ((title.length - 1) * step) / 2;
    for (let i = 0; i < title.length; i++) {
      const wave = this.motionEnabled ? Math.sin(age / 180 + i * 0.55) * 6 : 0;
      const pop = this.motionEnabled && age < 400 ? Math.max(0, 1 - age / 400) * -14 : 0;
      const x = Math.round(x0 + i * step);
      const y = Math.round(cy + wave + pop);
      ctx.fillStyle = '#0b0614';
      ctx.fillText(title[i]!, x + 2, y + 2);
      ctx.fillStyle = i % 2 === 0 ? '#ffd95a' : '#fff4c2';
      ctx.fillText(title[i]!, x, y);
    }
    const lvl = `LEVEL ${this.levelNumber}`;
    const lvlPulse = this.motionEnabled ? 1 + Math.sin(age / 220) * 0.06 : 1;
    ctx.font = `bold ${Math.round(40 * lvlPulse)}px monospace`;
    ctx.fillStyle = '#0b0614';
    ctx.fillText(lvl, Math.round(cx + 2), Math.round(cy + 52));
    ctx.fillStyle = '#5dff7a';
    ctx.fillText(lvl, Math.round(cx), Math.round(cy + 50));
    ctx.restore();
  }
}

// Pixel explosion and screen shake (task 25.5). Driven by BombDetonated events with render-side
// timers only (no Simulation PRNG). At most 3 concurrent flashes. Shake decays and can be disabled
// by `screenShake` in config or the low quality tier.

import type { GameEvent } from '../core/events';
import { TILE, cellToPx } from './layout';
import type { Ctx2D } from './layout';

export const MAX_FLASHES = 3;
export const FLASH_MS = 420;
export const SHAKE_MS = 360;

interface Flash {
  x: number;
  y: number;
  radius: number; // px
  start: number;
}

export class ExplosionLayer {
  private readonly flashes: Flash[] = [];
  private shakeStart = -Infinity;
  private shakeStrength = 0;
  /** New explosions this frame (for the lighting layer). */
  readonly pending: Array<{ x: number; y: number; radiusCells: number }> = [];

  constructor(public shakeEnabled = true) {}

  get activeFlashes(): number {
    return this.flashes.length;
  }

  handle(events: ReadonlyArray<GameEvent>, now: number): void {
    for (const e of events) {
      if (e.t !== 'BombDetonated') continue;
      const p = cellToPx(e.cell.x, e.cell.y);
      const f = { x: p.x + TILE / 2, y: p.y + TILE / 2, radius: e.radius * TILE, start: now };
      this.flashes.push(f);
      if (this.flashes.length > MAX_FLASHES) this.flashes.shift();
      this.pending.push({ x: f.x, y: f.y, radiusCells: e.radius });
      this.shakeStart = now;
      this.shakeStrength = Math.min(10, 3 + e.destroyed.length * 0.6);
    }
  }

  /** Render-side shake offset (pixels). Zero when disabled. */
  shake(now: number): { x: number; y: number } {
    if (!this.shakeEnabled) return { x: 0, y: 0 };
    const t = (now - this.shakeStart) / SHAKE_MS;
    if (t < 0 || t >= 1) return { x: 0, y: 0 };
    const amp = this.shakeStrength * (1 - t) * (1 - t);
    return { x: Math.round(Math.sin(now / 17) * amp), y: Math.round(Math.cos(now / 23) * amp) };
  }

  draw(ctx: Ctx2D, now: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      const t = (now - f.start) / FLASH_MS;
      if (t >= 1) {
        this.flashes.splice(i, 1);
        continue;
      }
      ctx.save();
      // Pixel flash: a bright square core that shrinks.
      const core = Math.round(f.radius * 0.8 * (1 - t));
      ctx.globalAlpha = Math.max(0, 1 - t * 1.6);
      ctx.fillStyle = '#fff4c2';
      const step = 4;
      for (let dy = -core; dy <= core; dy += step) {
        for (let dx = -core; dx <= core; dx += step) {
          if (dx * dx + dy * dy > core * core) continue;
          ctx.fillRect(Math.round(f.x + dx), Math.round(f.y + dy), step, step);
        }
      }
      // Shockwave ring of pixels.
      const r = f.radius * (0.3 + 1.2 * t);
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = '#ff9f2f';
      const n = 28;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        ctx.fillRect(Math.round(f.x + Math.cos(a) * r - 2), Math.round(f.y + Math.sin(a) * r - 2), 4, 4);
      }
      ctx.restore();
    }
  }
}

// Power, speed and role-reversal visual effects (task 25.3). Pure render-side helpers.
//  - Power blink for the whole Power_Duration (faster in the last 2 s).
//  - Invulnerability blink: faster and dimmer, so it looks different from the power blink.
//  - Role-reversal flash: a short white flash on RoleReversed.
//  - Speed: faster animation frames and trail emission requests.

import type { GameEvent } from '../core/events';
import type { Character, Who } from '../core/types';
import type { Ctx2D } from './layout';

export const POWER_BLINK_MS = 160;
export const INVULN_BLINK_MS = 90;
export const POWER_WARN_TICKS = 120;
export const ROLE_FLASH_MS = 260;

/** Opacity of a character for the frame at `timeMs`. */
export function characterAlpha(c: Pick<Character, 'power' | 'invulnerable'>, timeMs: number): number {
  let alpha = 1;
  if (c.power > 0) {
    const period = c.power < POWER_WARN_TICKS ? POWER_BLINK_MS / 2 : POWER_BLINK_MS;
    alpha = Math.floor(timeMs / period) % 2 === 0 ? 1 : 0.55;
  }
  if (c.invulnerable > 0) alpha = Math.floor(timeMs / INVULN_BLINK_MS) % 2 === 0 ? 1 : 0.2;
  return alpha;
}

export const INVULN_TINT = '#5ff3ff';

/** Cyan tint and ring drawn over a blinking invulnerable character (distinct from the power blink). */
export function drawInvulnAura(ctx: Ctx2D, px: number, py: number, size: number, timeMs: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 80);
  ctx.save();
  ctx.fillStyle = INVULN_TINT;
  ctx.globalAlpha = 0.18 + 0.14 * pulse;
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.strokeStyle = INVULN_TINT;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
  ctx.restore();
}

/** Animation time multiplier: Speed_State plays frames 1.8x faster. */
export function animTime(c: Pick<Character, 'speed'>, timeMs: number): number {
  return c.speed > 0 ? timeMs * 1.8 : timeMs;
}

/** Tracks role-reversal flashes started by events. */
export class RoleFlash {
  private readonly started = new Map<Who, number>();

  handle(events: ReadonlyArray<GameEvent>, now: number): void {
    for (const e of events) if (e.t === 'RoleReversed') this.started.set(e.to, now);
  }

  /** 0..1 flash strength for a character. */
  strength(who: Who, now: number): number {
    const s = this.started.get(who);
    if (s === undefined) return 0;
    const t = (now - s) / ROLE_FLASH_MS;
    return t >= 0 && t < 1 ? 1 - t : 0;
  }

  draw(ctx: Ctx2D, who: Who, px: number, py: number, size: number, now: number): void {
    const k = this.strength(who, now);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.8 * k;
    ctx.fillStyle = '#ffffff';
    const grow = Math.round(size * 0.5 * (1 - k));
    ctx.fillRect(px - grow, py - grow, size + 2 * grow, size + 2 * grow);
    ctx.restore();
  }
}

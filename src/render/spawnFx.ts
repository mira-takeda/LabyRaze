// Spawn locator and death sequencing (second playtest). Render-side only: reads events and the
// drawn state and never writes to the Simulation.
//
// Sequence after the Player is eaten: impact (hit-stop, shake, explosion and disintegration from
// FeedbackLayer) for DEATH_MS, then a large glowing circle contracts onto the respawn Cell for
// LOCATOR_MS. The same locator plays at every level start. While `holding(now)` is true the Shell
// does not run Ticks, so both characters stand still: the hunter gains nothing, the Player can find
// the character, and the respawn invulnerability only starts counting when play resumes.

import type { GameEvent } from '../core/events';
import type { Cell, GameState } from '../core/types';
import { TILE, cellToPx } from './layout';
import type { Ctx2D } from './layout';

export const DEATH_MS = 850;
export const LOCATOR_MS = 750;
export const LEVEL_LOCATOR_MS = 900;
/** Locator start radius in Tiles. */
export const LOCATOR_START_TILES = 9;
/** Fraction of the locator after which the respawned Player sprite reappears. */
export const REVEAL_AT = 0.55;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export class SpawnFx {
  private start = -Infinity;
  private dur = LOCATOR_MS;
  private deathAt = -Infinity;
  private cell: Cell | null = null;
  private pendingRespawn = false;
  private maze: unknown = null;
  private celebrationPending = false;
  private celebrationEnd = -Infinity;
  /** Length of the level-start hold on a LevelMilestone (Shell display setting `celebrationHoldMs`). */
  celebrationMs = 3000;

  /** True while the extended milestone hold runs. */
  celebrating(now: number): boolean {
    return now < this.celebrationEnd;
  }

  /** Ends the milestone hold early (confirm key); the Simulation resumes on the next frame. */
  skipCelebration(now: number): boolean {
    if (!this.celebrating(now)) return false;
    this.celebrationEnd = -Infinity;
    this.start = -Infinity;
    return true;
  }

  /** Feeds the events of a Tick batch. */
  handle(events: ReadonlyArray<GameEvent>, now: number): void {
    for (const e of events) {
      if (e.t === 'PlayerEaten') {
        this.deathAt = now;
        this.pendingRespawn = true;
        this.cell = null;
        this.start = -Infinity;
      }
      if (e.t === 'LevelMilestone') this.celebrationPending = true;
      if (e.t === 'GameOver') {
        this.pendingRespawn = false;
        this.start = -Infinity;
      }
    }
  }

  /** Call once per frame with the state being drawn: detects level starts and the respawn Cell. */
  sync(state: GameState, now: number): void {
    if (state.maze !== this.maze) {
      this.maze = state.maze;
      this.deathAt = -Infinity;
      this.pendingRespawn = false;
      if (this.celebrationPending) {
        // Milestone level: hold for celebrationMs; the locator plays during the last part of it.
        this.celebrationPending = false;
        const hold = Math.max(this.celebrationMs, LEVEL_LOCATOR_MS);
        this.celebrationEnd = now + hold;
        this.begin(state.player.cell, now + hold - LEVEL_LOCATOR_MS, LEVEL_LOCATOR_MS);
      } else {
        this.celebrationEnd = -Infinity;
        this.begin(state.player.cell, now, LEVEL_LOCATOR_MS);
      }
      return;
    }
    if (this.pendingRespawn) {
      this.pendingRespawn = false;
      if (state.phase === 'playing') this.begin(state.player.cell, this.deathAt + DEATH_MS, LOCATOR_MS);
    }
  }

  private begin(cell: Cell, at: number, dur: number): void {
    this.cell = { x: cell.x, y: cell.y };
    this.start = at;
    this.dur = dur;
  }

  /** True while the death animation or the locator runs; the Shell holds the Simulation. */
  holding(now: number): boolean {
    if (this.pendingRespawn) return true;
    return now < this.start + this.dur;
  }

  /** The respawned Player stays hidden until the locator has nearly closed on it. */
  hidePlayer(now: number): boolean {
    if (this.pendingRespawn) return true;
    if (this.start === -Infinity) return false;
    return now < this.start + this.dur * REVEAL_AT;
  }

  /** 0..1 progress of the locator, or null when it is not running. */
  progress(now: number): number | null {
    if (this.start === -Infinity || this.cell === null) return null;
    const t = (now - this.start) / this.dur;
    return t >= 0 && t < 1 ? t : null;
  }

  draw(ctx: Ctx2D, now: number): void {
    const t = this.progress(now);
    if (t === null || this.cell === null) return;
    const p = cellToPx(this.cell.x, this.cell.y);
    const cx = p.x + TILE / 2;
    const cy = p.y + TILE / 2;
    const k = easeOutCubic(t);
    const r = Math.max(TILE * 0.6, TILE * LOCATOR_START_TILES * (1 - k));
    const fade = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    ctx.save();
    // Dim the board slightly so the circle reads as a spotlight.
    ctx.globalAlpha = 0.28 * fade;
    ctx.fillStyle = '#05020a';
    ctx.beginPath();
    ctx.rect(-TILE, -TILE, ctx.canvas.width + 2 * TILE, ctx.canvas.height + 2 * TILE);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    // Soft outer glow rings, then the bright core ring.
    const rings: Array<[number, number, string]> = [
      [10, 0.12, '#5ff3ff'],
      [6, 0.22, '#9ff8ff'],
      [3, 0.85, '#ffffff'],
    ];
    for (const [lw, a, col] of rings) {
      ctx.globalAlpha = a * fade;
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Four inward chevrons pointing at the Player.
    ctx.globalAlpha = 0.9 * fade;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + t * 1.2;
      const x = Math.round(cx + Math.cos(a) * (r + 8));
      const y = Math.round(cy + Math.sin(a) * (r + 8));
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Closing flash on the Player.
    if (t > 0.75) {
      ctx.globalAlpha = (1 - t) * 3;
      ctx.fillStyle = '#bff9ff';
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * (0.7 + (t - 0.75) * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear(): void {
    this.start = -Infinity;
    this.deathAt = -Infinity;
    this.pendingRespawn = false;
    this.cell = null;
    this.maze = null;
    this.celebrationPending = false;
    this.celebrationEnd = -Infinity;
  }
}

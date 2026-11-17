// Biome presentation effects (task 36.5): the level-start banner ("LEVEL 6 - RED BRICK KEEP")
// that fades out, and ambient particles (dust, embers, fireflies, sparks, snow, neon dust) drawn
// from the shared pool. Render-only: reads GameState and events, never writes to the Simulation.
// Randomness comes from the pool's VisualRng. Ambient spawning stops when the pool is more than
// half full, so event effects always keep headroom under the particle cap.

import type { GameEvent } from '../core/events';
import type { GameState } from '../core/types';
import { bannerText, biomeFor } from './biomes';
import type { BiomeDef } from './biomes';
import { HUD_H, TILE } from './layout';
import type { Ctx2D } from './layout';
import { ParticleKind } from './particles';
import type { ParticlePool } from './particles';

export const BANNER_HOLD_MS = 1500;
export const BANNER_FADE_MS = 1300;
export const BANNER_TOTAL_MS = BANNER_HOLD_MS + BANNER_FADE_MS;
/** Ambient particles never use more than this share of the pool. */
export const AMBIENT_POOL_SHARE = 0.5;

/** Banner opacity `elapsedMs` after the level started: 1 while held, then a linear fade to 0. */
export function bannerAlpha(elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  if (elapsedMs <= BANNER_HOLD_MS) return 1;
  return Math.max(0, 1 - (elapsedMs - BANNER_HOLD_MS) / BANNER_FADE_MS);
}

export class BiomeFx {
  private level = 0;
  private bannerStart = -1;
  private bannerLevel = 0;
  private acc = 0;
  /** Particles spawned by the last `update` (tests read it). */
  lastSpawned = 0;

  /** Starts the banner on LevelStarted. */
  handle(events: ReadonlyArray<GameEvent>, nowMs: number): void {
    for (const e of events) if (e.t === 'LevelStarted') this.startBanner(e.level, nowMs);
  }

  private startBanner(level: number, nowMs: number): void {
    this.level = level;
    this.bannerLevel = level;
    this.bannerStart = nowMs;
  }

  /** Banner text currently shown (empty once faded). */
  bannerTextAt(nowMs: number): string {
    return this.bannerStart >= 0 && bannerAlpha(nowMs - this.bannerStart) > 0 ? bannerText(this.bannerLevel) : '';
  }

  /** Spawns ambient particles for the current biome. `dt` in seconds. */
  update(state: GameState, nowMs: number, dt: number, pool: ParticlePool): void {
    if (state.levelNumber !== this.level) this.startBanner(state.levelNumber, nowMs);
    this.lastSpawned = 0;
    if (dt <= 0) return;
    const def = biomeFor(state.levelNumber);
    this.acc += def.particles.perSecond * pool.density * dt;
    const w = state.maze.width * TILE;
    const h = state.maze.height * TILE;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (pool.active >= pool.capacity * AMBIENT_POOL_SHARE) {
        continue;
      }
      if (this.spawn(def, pool, w, h)) this.lastSpawned++;
    }
  }

  private spawn(def: BiomeDef, pool: ParticlePool, w: number, h: number): boolean {
    const r = pool.rng;
    const colors = def.particles.colors;
    const color = colors[Math.floor(r.next() * colors.length)]!;
    const x = r.range(0, w);
    const y = HUD_H + r.range(0, h);
    switch (def.particles.flavour) {
      case 'snow':
        return pool.spawn(x, HUD_H, r.range(-10, 10), r.range(22, 40), r.range(2.5, 4.5), 2, ParticleKind.Pixel, color);
      case 'embers':
        return pool.spawn(x, y, r.range(-6, 6), r.range(-26, -12), r.range(1, 2), 2, ParticleKind.Spark, color);
      case 'fireflies':
        return pool.spawn(x, y, r.range(-8, 8), r.range(-8, 8), r.range(2, 3.5), 2, ParticleKind.Spark, color);
      case 'sparks':
        return pool.spawn(x, y, r.range(-30, 30), r.range(-40, -10), r.range(0.4, 0.8), 2, ParticleKind.Spark, color, 120);
      case 'neon':
        return pool.spawn(x, y, r.range(-14, 14), r.range(-14, 14), r.range(1.5, 3), 2, ParticleKind.Spark, color);
      default:
        return pool.spawn(x, y, r.range(-4, 4), r.range(-10, -3), r.range(2, 3.5), 2, ParticleKind.Trail, color);
    }
  }

  /** Draws the fading banner over the maze. */
  drawBanner(ctx: Ctx2D, nowMs: number, width: number, height: number): void {
    if (this.bannerStart < 0) return;
    const a = bannerAlpha(nowMs - this.bannerStart);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = '#05030c';
    const y = Math.round(HUD_H + (height - HUD_H) * 0.4);
    ctx.fillRect(0, y - 8, width, 40);
    ctx.globalAlpha = a;
    ctx.fillStyle = biomeFor(this.bannerLevel).ambient.color;
    ctx.fillRect(0, y - 8, width, 2);
    ctx.fillRect(0, y + 30, width, 2);
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(bannerText(this.bannerLevel), Math.round(width / 2), y + 12);
    ctx.restore();
  }
}

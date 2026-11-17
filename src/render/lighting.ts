// Lighting and glow (task 25.1): pre-rendered radial gradient sprites blitted additively into a
// reduced-resolution glow layer, composited once per frame with 'lighter'. Bounded light count.
// Explosion lights are short-lived and decay over ~18 frames. Skipped at the low tier.

import type { GameState } from '../core/types';
import { ItemKind } from '../core/types';
import { HUD_H, TILE } from './layout';
import type { Ctx2D, SurfaceFactory } from './layout';
import { ALLY_COLOURS } from './placeholders';

export const MAX_LIGHTS = 96;
export const EXPLOSION_LIGHT_FRAMES = 18;

interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  a: number;
}

interface FlashLight {
  x: number;
  y: number;
  r: number;
  framesLeft: number;
}

export class Lighting {
  private surface: { canvas: CanvasImageSource; ctx: Ctx2D } | null = null;
  private scale = 0;
  private w = 0;
  private h = 0;
  private readonly gradients = new Map<string, { canvas: CanvasImageSource; size: number }>();
  private readonly flashes: FlashLight[] = [];
  lastLightCount = 0;
  /** Biome ambient tint laid over the maze (null = none). Set by the Renderer each frame. */
  ambient: { color: string; alpha: number } | null = null;
  /** Colour of Spirit_Wisp lights (always a cool hue). */
  wispColor = '#7fe8ff';

  constructor(private readonly factory: SurfaceFactory) {}

  /** Pre-rendered radial gradient sprite for a colour (cached). */
  private gradient(color: string): { canvas: CanvasImageSource; size: number } {
    const hit = this.gradients.get(color);
    if (hit) return hit;
    const size = 64;
    const s = this.factory(size, size);
    const g = s.ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color.length === 7 ? `${color}66` : color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, size, size);
    const e = { canvas: s.canvas, size };
    this.gradients.set(color, e);
    return e;
  }

  /** An explosion light at canvas pixel (x, y), radius in Cells. */
  explosion(x: number, y: number, radiusCells: number): void {
    this.flashes.push({ x, y, r: radiusCells * TILE * 1.6, framesLeft: EXPLOSION_LIGHT_FRAMES });
    if (this.flashes.length > 3) this.flashes.shift();
  }

  private ensure(w: number, h: number, scale: number): { canvas: CanvasImageSource; ctx: Ctx2D } {
    if (!this.surface || this.w !== w || this.h !== h || this.scale !== scale) {
      this.surface = this.factory(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
      this.w = w;
      this.h = h;
      this.scale = scale;
    }
    return this.surface;
  }

  collect(s: GameState, timeMs: number): Light[] {
    const lights: Light[] = [];
    const add = (cx: number, cy: number, r: number, color: string, a: number): void => {
      if (lights.length < MAX_LIGHTS) lights.push({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 + HUD_H, r, color, a });
    };
    add(s.player.cell.x, s.player.cell.y, TILE * 3.2, '#d8ccff', 0.8);
    if (s.hunter.respawnIn <= 0) add(s.hunter.cell.x, s.hunter.cell.y, TILE * 2.6, s.player.power > 0 ? '#4a6cff' : '#ffd400', 0.6);
    s.ghostHunt.allies.forEach((a, i) => {
      if (a.mode !== 'inactive' && a.spawnIn === 0) add(a.cell.x, a.cell.y, TILE * 2, ALLY_COLOURS[i] ?? '#ffffff', 0.55);
    });
    const w = s.maze.width;
    const kinds = s.items.kinds;
    const flicker = 0.85 + 0.15 * Math.sin(timeMs / 220);
    for (let i = 0; i < kinds.length && lights.length < MAX_LIGHTS; i++) {
      const k = kinds[i];
      if (k === ItemKind.Wisp) add(i % w, Math.floor(i / w), TILE * 1.1, this.wispColor, 0.35 * flicker);
      else if (k === ItemKind.Power) add(i % w, Math.floor(i / w), TILE * 1.6, '#ff5ad1', 0.5 * flicker);
      else if (k === ItemKind.GhostHunt) add(i % w, Math.floor(i / w), TILE * 1.6, '#c8ff5a', 0.5 * flicker);
      else if (k === ItemKind.Bomb) add(i % w, Math.floor(i / w), TILE * 1.0, '#ff7a2f', 0.3 * flicker);
    }
    for (const key of s.items.keys) add(key.x, key.y, TILE * 1.6, '#ffe066', 0.55 * flicker);
    s.maze.doors.forEach((d, i) => {
      const st = s.doors[i];
      if (st) add(d.cell.x, d.cell.y, TILE * 1.3, st.open ? '#3fd67a' : '#d6463f', st.warning > 0 ? 0.7 : 0.35);
    });
    return lights;
  }

  /** Draws the glow layer onto `ctx`. `scale` is the glow resolution (0 disables). */
  draw(ctx: Ctx2D, s: GameState, timeMs: number, width: number, height: number, scale: number): void {
    // Explosion flashes decay even when glow is off, so the frame count stays render-side.
    for (let i = this.flashes.length - 1; i >= 0; i--) if (--this.flashes[i]!.framesLeft <= 0) this.flashes.splice(i, 1);
    if (this.ambient) {
      // Biome ambient tint: one low-alpha fill over the maze area (kept even at the low tier).
      ctx.save();
      ctx.globalAlpha = this.ambient.alpha;
      ctx.fillStyle = this.ambient.color;
      ctx.fillRect(0, HUD_H, width, Math.max(0, height - HUD_H));
      ctx.restore();
    }
    if (scale <= 0) {
      this.lastLightCount = 0;
      return;
    }
    const surf = this.ensure(width, height, scale);
    const g = surf.ctx;
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, width * scale, height * scale);
    g.globalCompositeOperation = 'lighter';
    const lights = this.collect(s, timeMs);
    for (const f of this.flashes) {
      lights.push({ x: f.x, y: f.y, r: f.r * (0.6 + 0.4 * (f.framesLeft / EXPLOSION_LIGHT_FRAMES)), color: '#ffb35a', a: f.framesLeft / EXPLOSION_LIGHT_FRAMES });
    }
    this.lastLightCount = lights.length;
    for (const l of lights) {
      const grad = this.gradient(l.color);
      g.globalAlpha = Math.max(0, Math.min(1, l.a));
      const d = l.r * 2 * scale;
      g.drawImage(grad.canvas, Math.round((l.x - l.r) * scale), Math.round((l.y - l.r) * scale), Math.round(d), Math.round(d));
    }
    g.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(surf.canvas, 0, 0, width, height);
    ctx.restore();
  }
}

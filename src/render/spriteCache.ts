// Sprite atlas cache (task 24.5): every palette sprite is rasterized once into an atlas surface,
// including tinted and flipped variants. Drawing is a single drawImage with smoothing disabled
// and integer pixel coordinates.

import type { SpriteDef } from './sprites/format';
import { flipX } from './sprites/format';
import type { Ctx2D, SurfaceFactory } from './layout';

export interface AtlasEntry {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 1;

export class SpriteAtlas {
  readonly canvas: CanvasImageSource;
  private readonly ctx: Ctx2D;
  private readonly entries = new Map<string, AtlasEntry>();
  private readonly width: number;
  private cx = PAD;
  private cy = PAD;
  private rowH = 0;
  /** Pixels rasterized (init cost; tests assert it happens once). */
  rasterized = 0;

  constructor(factory: SurfaceFactory, width = 512, height = 512) {
    const s = factory(width, height);
    this.canvas = s.canvas;
    this.ctx = s.ctx;
    this.width = width;
    this.ctx.imageSmoothingEnabled = false;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): AtlasEntry | undefined {
    return this.entries.get(name);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Rasterizes `def` under `name` once. Returns the atlas entry. */
  add(name: string, def: SpriteDef): AtlasEntry {
    const existing = this.entries.get(name);
    if (existing) return existing;
    if (this.cx + def.w + PAD > this.width) {
      this.cx = PAD;
      this.cy += this.rowH + PAD;
      this.rowH = 0;
    }
    const e: AtlasEntry = { x: this.cx, y: this.cy, w: def.w, h: def.h };
    // Run-length fill per row keeps the init cost small.
    for (let y = 0; y < def.h; y++) {
      const row = def.rows[y]!;
      let x = 0;
      while (x < def.w) {
        const ch = row[x]!;
        let run = 1;
        while (x + run < def.w && row[x + run] === ch) run++;
        if (ch !== '.') {
          this.ctx.fillStyle = def.palette[ch]!;
          this.ctx.fillRect(e.x + x, e.y + y, run, 1);
          this.rasterized += run;
        }
        x += run;
      }
    }
    this.cx += def.w + PAD;
    this.rowH = Math.max(this.rowH, def.h);
    this.entries.set(name, e);
    return e;
  }

  /** Adds `def` and its mirrored variant as `name` and `name:flip`. */
  addWithFlip(name: string, def: SpriteDef): void {
    this.add(name, def);
    this.add(`${name}:flip`, flipX(def));
  }

  /** Draws a sprite at integer (px, py) scaled by an integer `scale`. */
  draw(ctx: Ctx2D, name: string, px: number, py: number, scale = 2, alpha = 1): boolean {
    const e = this.entries.get(name);
    if (!e) return false;
    const prev = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prev * alpha;
    ctx.drawImage(this.canvas, e.x, e.y, e.w, e.h, Math.round(px), Math.round(py), e.w * scale, e.h * scale);
    if (alpha !== 1) ctx.globalAlpha = prev;
    return true;
  }
}

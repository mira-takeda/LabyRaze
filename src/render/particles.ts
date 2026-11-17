// Particle pool and emitters (task 26.1). Struct-of-arrays allocated once (capacity
// `particleCap`); spawning takes a free slot or drops the particle when full; no per-frame
// allocation. Randomness comes from a render-only PRNG, never the Simulation PRNG.

import type { Ctx2D } from './layout';

export const ParticleKind = {
  Spark: 0, // round glowing dot
  Pixel: 1, // square pixel (debris, explosions)
  Trail: 2, // fading afterimage dot
} as const;

/** Effect budgets from the design. */
export const EXPLOSION_PARTICLE_MAX = 60;
export const ALLY_TRAIL_MAX = 12;
export const WISP_SPARKS = 4;

/** Small xorshift PRNG for visuals only. */
export class VisualRng {
  private s: number;
  constructor(seed = 0x2545f491) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

export class ParticlePool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array; // remaining seconds; <= 0 means free
  readonly maxLife: Float32Array;
  readonly size: Float32Array;
  readonly kind: Uint8Array;
  readonly color: Uint32Array; // 0xRRGGBB
  readonly gravity: Float32Array;
  private readonly free: Int32Array;
  private freeTop: number;
  active = 0;
  dropped = 0;
  /** Multiplier applied by the quality tier (1, 0.6, 0.3). */
  density = 1;
  readonly rng = new VisualRng();

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const n = this.capacity;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.color = new Uint32Array(n);
    this.gravity = new Float32Array(n);
    this.free = new Int32Array(n);
    for (let i = 0; i < n; i++) this.free[i] = n - 1 - i;
    this.freeTop = n;
  }

  /** Spawns one particle; returns false (and counts a drop) when the pool is full. */
  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, kind: number, color: number, gravity = 0): boolean {
    if (this.freeTop === 0) {
      this.dropped++;
      return false;
    }
    const i = this.free[--this.freeTop]!;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.kind[i] = kind;
    this.color[i] = color;
    this.gravity[i] = gravity;
    this.active++;
    return true;
  }

  /** Scaled spawn count for the active quality density. */
  count(n: number): number {
    return Math.max(0, Math.round(n * this.density));
  }

  update(dt: number): void {
    const n = this.capacity;
    for (let i = 0; i < n; i++) {
      if (this.life[i]! <= 0) continue;
      const l = this.life[i]! - dt;
      if (l <= 0) {
        this.life[i] = 0;
        this.free[this.freeTop++] = i;
        this.active--;
        continue;
      }
      this.life[i] = l;
      this.vy[i] = this.vy[i]! + this.gravity[i]! * dt;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + this.vy[i]! * dt;
    }
  }

  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < this.capacity; i++) this.free[i] = this.capacity - 1 - i;
    this.freeTop = this.capacity;
    this.active = 0;
  }

  /** Colour strings cached per 0xRRGGBB value (no string building per particle per frame). */
  private readonly styles = new Map<number, string>();

  private style(c: number): string {
    let s = this.styles.get(c);
    if (s === undefined) {
      s = `rgb(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255})`;
      this.styles.set(c, s);
    }
    return s;
  }

  draw(ctx: Ctx2D): void {
    const n = this.capacity;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const l = this.life[i]!;
      if (l <= 0) continue;
      const t = l / this.maxLife[i]!;
      const c = this.color[i]!;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = this.style(c);
      const s = Math.max(1, Math.round(this.size[i]! * (this.kind[i] === ParticleKind.Trail ? t : 1)));
      ctx.fillRect(Math.round(this.x[i]! - s / 2), Math.round(this.y[i]! - s / 2), s, s);
    }
    ctx.restore();
  }
}

export function hex(c: string): number {
  return parseInt(c.replace('#', ''), 16) >>> 0;
}

/** Emitters. Positions are canvas pixels (Cell centres). */
export class Emitters {
  constructor(readonly pool: ParticlePool) {}

  private burst(x: number, y: number, n: number, speed: number, life: number, size: number, kind: number, colors: readonly number[], gravity = 0): void {
    const p = this.pool;
    const k = p.count(n);
    for (let i = 0; i < k; i++) {
      const a = p.rng.range(0, Math.PI * 2);
      const v = p.rng.range(speed * 0.35, speed);
      p.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, p.rng.range(life * 0.6, life), size, kind, colors[i % colors.length]!, gravity);
    }
  }

  pelletBurst(x: number, y: number): void {
    this.burst(x, y, 4, 40, 0.3, 2, ParticleKind.Pixel, [hex('#ffb347'), hex('#ffe0a8')]);
  }
  powerBurst(x: number, y: number): void {
    this.burst(x, y, 16, 90, 0.6, 3, ParticleKind.Spark, [hex('#ff5ad1'), hex('#ffd6f4')]);
  }
  speedTrail(x: number, y: number, color: number): void {
    this.burst(x, y, 1, 6, 0.35, 4, ParticleKind.Trail, [color]);
  }
  keyEffect(x: number, y: number): void {
    this.burst(x, y, 14, 70, 0.7, 3, ParticleKind.Spark, [hex('#ffe066'), hex('#ffffff')]);
  }
  rescueEffect(x: number, y: number, color: number): void {
    this.burst(x, y, 24, 110, 0.9, 3, ParticleKind.Spark, [color, hex('#ffffff')], -40);
  }
  roleReversal(x: number, y: number): void {
    this.burst(x, y, 20, 120, 0.5, 2, ParticleKind.Spark, [hex('#ffffff'), hex('#a8b8ff')]);
  }
  wispSparkles(x: number, y: number): void {
    this.burst(x, y, WISP_SPARKS, 50, 0.5, 2, ParticleKind.Spark, [hex('#7fe8ff'), hex('#c29bff')], -30);
  }
  /** Small cyan sparkle ring while the Player is invulnerable. */
  invulnSparkles(x: number, y: number): void {
    this.burst(x, y, 4, 36, 0.45, 2, ParticleKind.Spark, [hex('#5ff3ff'), hex('#ffffff')]);
  }
  /** Pixel explosion when a character is eaten. */
  eatenExplosion(x: number, y: number, color: number): void {
    this.burst(x, y, 28, 130, 0.8, 3, ParticleKind.Pixel, [color, hex('#ffffff')], 120);
  }
  /** Player death (second playtest): a fast spark shockwave plus a slow glowing ember cloud. */
  playerDeath(x: number, y: number): void {
    this.burst(x, y, 24, 230, 0.6, 2, ParticleKind.Spark, [hex('#ffffff'), hex('#9ff8ff'), hex('#c9bfe6')]);
    this.burst(x, y, 14, 55, 1.3, 6, ParticleKind.Trail, [hex('#5ff3ff'), hex('#c29bff'), hex('#ffffff')], -20);
  }
  /** Bomb debris: shared budget of EXPLOSION_PARTICLE_MAX across the destroyed Cells. */
  bombDebris(cells: ReadonlyArray<{ x: number; y: number }>): void {
    if (cells.length === 0) return;
    const per = Math.max(1, Math.floor(EXPLOSION_PARTICLE_MAX / cells.length));
    let left = EXPLOSION_PARTICLE_MAX;
    for (const c of cells) {
      const n = Math.min(per, left);
      left -= n;
      this.burst(c.x, c.y, n, 120, 0.9, 3, ParticleKind.Pixel, [hex('#6a52a0'), hex('#4c3876'), hex('#ff9f2f')], 160);
      if (left <= 0) break;
    }
  }
  allyTrail(x: number, y: number, color: number): void {
    this.burst(x, y, 1, 4, 0.45, 5, ParticleKind.Trail, [color]);
  }
}

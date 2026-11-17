// Stronger death, pickup and explosion feedback (task 36.2). Render-only: reads events and the
// drawn state, never writes to the Simulation. Randomness comes from the VisualRng of the pool.
// Pieces: pixel disintegration (sprite pixels become particles), white impact flash, strong short
// shake, render-only hit-stop, expanding rings and a small fixed-size floating text pool.

import type { GameEvent } from '../core/events';
import type { GameState } from '../core/types';
import { HUD_H, TILE, cellToPx } from './layout';
import type { Ctx2D } from './layout';
import { ALLY_COLOURS } from './placeholders';
import { ParticleKind, hex } from './particles';
import type { ParticlePool } from './particles';
import { ALLY_PALETTES, PLAYER_PALETTE, ghostRows } from './sprites/ghost';
import { squaremanSprite } from './sprites/squareman';

export const MAX_TEXTS = 16;
export const MAX_RINGS = 12;
export const TEXT_MS = 1100;
export const RING_MS = 520;
export const FLASH_MS = 170;
export const MAX_COMBO_MS = 1100;
/** 1UP message: lifetime, spacing between queued messages and queue size (render-only). */
export const ONEUP_MS = 1200;
export const ONEUP_GAP_MS = ONEUP_MS; // sequential: one message visible at a time
export const MAX_ONEUP = 8;
/** HUD lives pulse duration. */
export const LIVES_PULSE_MS = 900;
/** Where the 1UP message sits: just under the HUD lives counter. */
export const ONEUP_X = 70;
export const ONEUP_Y = HUD_H + 22;
/** Full-strength shake lasts this long (1 / TRAUMA_DECAY_PER_S). */
export const SHAKE_MS = 800;
/** Shake trauma decay per second: a full-strength impact fades out in 0.8 s. */
export const TRAUMA_DECAY_PER_S = 1000 / SHAKE_MS;
export const PLAYER_HIT_STOP_MS = 150;
export const HUNTER_HIT_STOP_MS = 60;
/** While hit-stopped, particle time runs at this fraction. */
export const HIT_STOP_TIME_SCALE = 0.1;
export const PLAYER_SHAKE_PX = 18;
export const MAX_SHAKE_PX = 18;

const SPRITE_PX = TILE / 12; // 2 px per sprite pixel

function sprStyle(palette: Readonly<Record<string, string>>, ch: string): number | null {
  const c = palette[ch];
  return c === undefined ? null : hex(c);
}

export class FeedbackLayer {
  // Floating text pool (fixed arrays, never grows).
  private readonly tx = new Float32Array(MAX_TEXTS);
  private readonly ty = new Float32Array(MAX_TEXTS);
  private readonly tStart = new Float64Array(MAX_TEXTS).fill(-Infinity);
  private readonly tText: string[] = new Array<string>(MAX_TEXTS).fill('');
  private readonly tColor: string[] = new Array<string>(MAX_TEXTS).fill('#fff');
  private readonly tSize = new Float32Array(MAX_TEXTS).fill(13);
  private tNext = 0;
  // Ring pool.
  private readonly rx = new Float32Array(MAX_RINGS);
  private readonly ry = new Float32Array(MAX_RINGS);
  private readonly rMax = new Float32Array(MAX_RINGS);
  private readonly rStart = new Float64Array(MAX_RINGS).fill(-Infinity);
  private readonly rColor: string[] = new Array<string>(MAX_RINGS).fill('#fff');
  private rNext = 0;

  // Big "MAX COMBO" flash (Combo cap milestone).
  private maxStart = -Infinity;
  private maxX = 0;
  private maxY = 0;
  private maxBonus = 0;
  // 1UP message queue (fixed ring; never grows).
  private readonly oStart = new Float64Array(MAX_ONEUP).fill(-Infinity);
  private readonly oBurst = new Uint8Array(MAX_ONEUP);
  private oNext = 0;
  private oLastStart = -Infinity;
  private pulseStart = -Infinity;
  private pulseEnd = -Infinity;
  private pulseLives = 1;
  private flashStart = -Infinity;
  private flashStrength = 0;
  private traumaVal = 0;
  private traumaAt = -Infinity;
  /** Flash strength multiplier (reduced motion lowers it). */
  flashScale = 1;
  /** Custom Workshop picture of the Player (cosmetic), used for the death disintegration. */
  playerSkin: { rows: readonly string[]; palette: Readonly<Record<string, string>> } | null = null;
  private hitStopUntil = -Infinity;
  private heldAlpha = 0;
  private holding = false;

  constructor(
    private readonly pool: ParticlePool,
    public shakeEnabled = true,
  ) {}

  get activeTexts(): number {
    let n = 0;
    for (let i = 0; i < MAX_TEXTS; i++) if (this.tStart[i]! > -Infinity) n++;
    return n;
  }

  get activeRings(): number {
    let n = 0;
    for (let i = 0; i < MAX_RINGS; i++) if (this.rStart[i]! > -Infinity) n++;
    return n;
  }

  /** Number of 1UP messages shown or still queued. */
  get activeOneUps(): number {
    let n = 0;
    for (let i = 0; i < MAX_ONEUP; i++) if (this.oStart[i]! > -Infinity) n++;
    return n;
  }

  /** Start times of the 1UP messages that are shown or queued (ascending). */
  oneUpStarts(): number[] {
    const out: number[] = [];
    for (let i = 0; i < MAX_ONEUP; i++) if (this.oStart[i]! > -Infinity) out.push(this.oStart[i]!);
    return out.sort((a, b) => a - b);
  }

  /** 0..1 strength of the HUD lives-icon pulse (0 when idle). */
  livesPulse(now: number): number {
    if (now < this.pulseStart || now >= this.pulseEnd) return 0;
    const u = (now - this.pulseStart) / (this.pulseEnd - this.pulseStart);
    const fade = Math.min(1, (1 - u) / 0.25);
    const t = (now - this.pulseStart) / LIVES_PULSE_MS;
    return fade * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 4)));
  }

  /** Green and gold sparks around the 1UP message. */
  private oneUpBurst(): void {
    const p = this.pool;
    const cols = [hex('#5dff7a'), hex('#ffd95a'), hex('#b8ffc4')];
    for (let i = 0, n = p.count(22); i < n; i++) {
      const a = p.rng.range(0, Math.PI * 2);
      const v = p.rng.range(40, 130);
      p.spawn(ONEUP_X, ONEUP_Y, Math.cos(a) * v, Math.sin(a) * v - 30, p.rng.range(0.6, 1.1), 3, i % 3 === 0 ? ParticleKind.Pixel : ParticleKind.Spark, cols[i % cols.length]!, 60);
    }
  }

  hitStopActive(now: number): boolean {
    return now < this.hitStopUntil;
  }

  /** Render-side hit-stop: returns the interpolation alpha to draw with and a time scale. */
  applyHitStop(now: number, alpha: number): { alpha: number; timeScale: number } {
    if (!this.hitStopActive(now)) {
      this.holding = false;
      return { alpha, timeScale: 1 };
    }
    if (!this.holding) {
      this.holding = true;
      this.heldAlpha = alpha;
    }
    return { alpha: this.heldAlpha, timeScale: HIT_STOP_TIME_SCALE };
  }

  /** Camera shake offset in pixels (zero when disabled): trauma squared times smooth noise. */
  shake(now: number): { x: number; y: number } {
    if (!this.shakeEnabled) return { x: 0, y: 0 };
    const tr = this.trauma(now);
    if (tr <= 0) return { x: 0, y: 0 };
    const amp = MAX_SHAKE_PX * tr * tr;
    const nx = Math.sin(now * 0.058 + 1.3) * 0.6 + Math.sin(now * 0.091) * 0.4;
    const ny = Math.cos(now * 0.067) * 0.6 + Math.sin(now * 0.083 + 0.7) * 0.4;
    return { x: Math.round(nx * amp), y: Math.round(ny * amp) };
  }
  /** Current trauma in [0, 1]; it decays linearly at TRAUMA_DECAY_PER_S. */
  private trauma(now: number): number {
    if (now <= this.traumaAt) return this.traumaVal;
    return Math.max(0, this.traumaVal - ((now - this.traumaAt) * TRAUMA_DECAY_PER_S) / 1000);
  }
  /** Adds an impact whose peak offset alone would be `px` pixels; impacts stack up to the cap. */
  private addShake(now: number, px: number): void {
    const add = Math.sqrt(Math.min(1, Math.max(0, px) / MAX_SHAKE_PX));
    this.traumaVal = Math.min(1, this.trauma(now) + add);
    this.traumaAt = now;
  }
  private addText(x: number, y: number, text: string, color: string, now: number, size = 13): void {
    const i = this.tNext;
    this.tNext = (i + 1) % MAX_TEXTS;
    this.tx[i] = x;
    this.ty[i] = y;
    this.tStart[i] = now;
    this.tText[i] = text;
    this.tColor[i] = color;
    this.tSize[i] = size;
  }

  private addRing(x: number, y: number, maxR: number, color: string, now: number): void {
    const i = this.rNext;
    this.rNext = (i + 1) % MAX_RINGS;
    this.rx[i] = x;
    this.ry[i] = y;
    this.rMax[i] = maxR;
    this.rStart[i] = now;
    this.rColor[i] = color;
  }

  /** Breaks a sprite into one particle per pixel (density-thinned), scattering with gravity. */
  private disintegrate(
    rows: readonly string[],
    palette: Readonly<Record<string, string>>,
    cx: number,
    cy: number,
    pixel = SPRITE_PX,
    stride = 1,
    size = SPRITE_PX,
  ): void {
    const p = this.pool;
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const ox = cx - (w * pixel) / 2;
    const oy = cy - (h * pixel) / 2;
    for (let y = 0; y < h; y += stride) {
      const row = rows[y]!;
      for (let x = stride > 1 && (y / stride) % 2 === 1 ? 1 : 0; x < w; x += stride) {
        const col = sprStyle(palette, row[x]!);
        if (col === null) continue;
        if (p.rng.next() > p.density) continue;
        const px = ox + (x + 0.5) * pixel;
        const py = oy + (y + 0.5) * pixel;
        const dx = px - cx;
        const dy = py - cy;
        const len = Math.max(1, Math.hypot(dx, dy));
        const v = p.rng.range(50, 130);
        p.spawn(
          px,
          py,
          (dx / len) * v + p.rng.range(-25, 25),
          (dy / len) * v - p.rng.range(20, 80),
          p.rng.range(0.7, 1.2),
          size,
          ParticleKind.Pixel,
          col,
          260,
        );
      }
    }
  }

  private cellCentre(x: number, y: number): { x: number; y: number } {
    const p = cellToPx(x, y);
    return { x: p.x + TILE / 2, y: p.y + TILE / 2 };
  }

  handle(events: ReadonlyArray<GameEvent>, now: number, state: GameState | null): void {
    for (const e of events) {
      switch (e.t) {
        case 'PlayerEaten': {
          const c = this.cellCentre(e.cell.x, e.cell.y);
          // The 18x24 protagonist sprite is drawn 1:1; every second pixel becomes a 2 px particle.
          const pic = this.playerSkin ?? { rows: ghostRows(0, 'none'), palette: PLAYER_PALETTE };
          this.disintegrate(pic.rows, pic.palette, c.x, c.y, 1, 2, 2);
          this.addRing(c.x, c.y, TILE * 2.2, '#ffffff', now);
          this.addRing(c.x, c.y, TILE * 3.8, '#9ff8ff', now);
          this.flashStart = now;
          this.flashStrength = 0.7;
          this.addShake(now, PLAYER_SHAKE_PX);
          this.hitStopUntil = Math.max(this.hitStopUntil, now + PLAYER_HIT_STOP_MS);
          break;
        }
        case 'HunterEaten': {
          const c = this.cellCentre(e.cell.x, e.cell.y);
          const sq = squaremanSprite('normal', 0);
          // The 24x24 antagonist sprite is drawn 1:1; every second pixel becomes a 2 px particle.
          this.disintegrate(sq.rows, sq.palette, c.x, c.y, 1, 2, 2);
          this.addRing(c.x, c.y, TILE * 2, '#ff9f43', now);
          this.addText(c.x, c.y - TILE / 2, 'BANISHED!', '#ffe14a', now);
          this.flashStart = now;
          this.flashStrength = 0.3;
          this.addShake(now, 10);
          this.hitStopUntil = Math.max(this.hitStopUntil, now + HUNTER_HIT_STOP_MS);
          break;
        }
        case 'KeyCollected': {
          const c = this.cellCentre(e.cell.x, e.cell.y);
          this.addRing(c.x, c.y, TILE * 1.4, '#ffe066', now);
          this.addRing(c.x, c.y, TILE * 2.4, '#fff4c2', now);
          this.addText(c.x, c.y - TILE / 2, 'KEY!', '#ffe066', now);
          this.addShake(now, 6);
          break;
        }
        case 'WispCollected': {
          const c = this.cellCentre(e.cell.x, e.cell.y);
          this.addRing(c.x, c.y, TILE * 1.1, '#7fe8ff', now);
          // Bigger text for higher Combos makes the chain payoff obvious.
          this.addText(c.x, c.y - TILE / 2, `+${e.points} x${e.combo}`, '#9ff0ff', now, 12 + Math.min(10, e.combo * 2));
          if (e.bonus > 0) {
            const m = state ? this.cellCentre(Math.floor(state.maze.width / 2), Math.floor(state.maze.height / 2)) : c;
            this.maxStart = now;
            this.maxX = m.x;
            this.maxY = m.y;
            this.maxBonus = e.bonus;
            this.addRing(c.x, c.y, TILE * 2.4, '#ffd95a', now);
            this.addText(c.x, c.y - TILE, `+${e.bonus} BONUS`, '#ffd95a', now);
            this.flashStart = now;
            this.flashStrength = 0.15;
          }
          break;
        }
        case 'PelletCollected': {
          if (e.kind === 'ordinary') break;
          const c = this.cellCentre(e.cell.x, e.cell.y);
          const power = e.kind === 'power';
          this.addRing(c.x, c.y, TILE * (power ? 2 : 1.6), power ? '#ff5ad1' : '#5ff3ff', now);
          if (e.by === 'player') {
            this.addText(c.x, c.y - TILE / 2, power ? 'POWER!' : 'SPEED!', power ? '#ff9ee6' : '#8ff8ff', now);
            this.addRing(c.x, c.y, TILE * (power ? 3.2 : 2.4), '#ffffff', now);
            if (power) {
              this.flashStart = now;
              this.flashStrength = 0.2;
              this.addShake(now, 8);
            }
          }
          break;
        }
        case 'BombCollected': {
          const c = this.cellCentre(e.cell.x, e.cell.y);
          this.addRing(c.x, c.y, TILE * 1.4, '#ff9f2f', now);
          this.addText(c.x, c.y - TILE / 2, 'BOMB', '#ffb35a', now);
          const p = this.pool;
          for (let i = 0, n = p.count(8); i < n; i++) {
            const a = p.rng.range(0, Math.PI * 2);
            p.spawn(c.x, c.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.45, 2, ParticleKind.Spark, hex(i % 2 ? '#ff9f2f' : '#ffe0a8'));
          }
          break;
        }
        case 'CaptiveReleased': {
          if (!state) break;
          const c = this.cellCentre(state.maze.cage.entrance.x, state.maze.cage.entrance.y);
          const col = ALLY_COLOURS[e.index] ?? '#ffffff';
          this.addRing(c.x, c.y, TILE * 2.6, col, now);
          this.addRing(c.x, c.y, TILE * 1.6, '#ffffff', now);
          this.addText(c.x, c.y - TILE / 2, '+500', col, now);
          this.addText(c.x, c.y - TILE * 1.3, 'FREED!', '#ffffff', now);
          this.addRing(c.x, c.y, TILE * 4, col, now);
          this.flashStart = now;
          this.flashStrength = 0.25;
          this.addShake(now, 10);
          const pal = ALLY_PALETTES[e.index];
          if (pal) this.disintegrateBurst(pal, c.x, c.y);
          break;
        }
        case 'GhostHuntStarted': {
          if (!state) break;
          const c = this.cellCentre(state.player.cell.x, state.player.cell.y);
          this.addText(c.x, c.y - TILE, 'GHOST HUNT!', '#ffb3e0', now);
          ALLY_COLOURS.forEach((col, i) => this.addRing(c.x, c.y, TILE * (2 + i), col, now));
          this.flashStart = now;
          this.flashStrength = 0.2;
          this.addShake(now, 8);
          break;
        }
        case 'BombDetonated': {
          const c = this.cellCentre(e.cell.x, e.cell.y);
          const r = e.radius * TILE;
          this.addRing(c.x, c.y, r * 1.3, '#fff4c2', now);
          this.addRing(c.x, c.y, r * 0.8, '#ff9f2f', now);
          this.flashStart = now;
          this.flashStrength = 0.35;
          this.addShake(now, Math.min(MAX_SHAKE_PX, 8 + e.destroyed.length));
          break;
        }
        case 'ExtraLife': {
          // One message per award; several awards in one Tick are spaced ONEUP_GAP_MS apart.
          const start = Math.max(now, this.oLastStart + ONEUP_GAP_MS);
          this.oLastStart = start;
          // Reuse the slot of the oldest finished message, otherwise overwrite the oldest one.
          let slot = this.oNext;
          for (let i = 0; i < MAX_ONEUP; i++) {
            if (this.oStart[i]! + ONEUP_MS <= now) {
              slot = i;
              break;
            }
          }
          this.oNext = (slot + 1) % MAX_ONEUP;
          this.oStart[slot] = start;
          this.oBurst[slot] = 1;
          // The pulse starts with the first message of a batch and lasts until the last one ends.
          if (start > this.pulseEnd) this.pulseStart = start;
          this.pulseEnd = start + ONEUP_MS;
          this.pulseLives = e.lives;
          if (start <= now) this.releaseBursts(now);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Spawns the particle burst of every 1UP message whose start time has come. */
  private releaseBursts(now: number): void {
    for (let i = 0; i < MAX_ONEUP; i++) {
      if (this.oBurst[i] === 1 && this.oStart[i]! <= now) {
        this.oBurst[i] = 0;
        this.oneUpBurst();
      }
    }
  }

  /** Small colour confetti for rescues. */
  private disintegrateBurst(palette: Readonly<Record<string, string>>, cx: number, cy: number): void {
    const p = this.pool;
    const cols = [hex(palette['W'] ?? '#ffffff'), hex(palette['H'] ?? '#ffffff')];
    for (let i = 0, n = p.count(10); i < n; i++) {
      const a = p.rng.range(0, Math.PI * 2);
      const v = p.rng.range(40, 120);
      p.spawn(cx, cy, Math.cos(a) * v, Math.sin(a) * v - 40, p.rng.range(0.6, 1), 3, ParticleKind.Pixel, cols[i % 2]!, 200);
    }
  }

  /** Draws rings and floating texts (inside the shaken world transform). */
  draw(ctx: Ctx2D, now: number): void {
    ctx.save();
    for (let i = 0; i < MAX_RINGS; i++) {
      const s = this.rStart[i]!;
      if (s === -Infinity) continue;
      const t = (now - s) / RING_MS;
      if (t >= 1) {
        this.rStart[i] = -Infinity;
        continue;
      }
      if (t < 0) continue;
      const r = this.rMax[i]! * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = this.rColor[i]!;
      const n = Math.max(12, Math.round(r / 2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        ctx.fillRect(Math.round(this.rx[i]! + Math.cos(a) * r - 1), Math.round(this.ry[i]! + Math.sin(a) * r - 1), 3, 3);
      }
    }
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < MAX_TEXTS; i++) {
      const s = this.tStart[i]!;
      if (s === -Infinity) continue;
      const t = (now - s) / TEXT_MS;
      if (t >= 1) {
        this.tStart[i] = -Infinity;
        continue;
      }
      if (t < 0) continue;
      const x = Math.round(this.tx[i]!);
      const y = Math.round(this.ty[i]! - t * 26);
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      ctx.font = `bold ${this.tSize[i]}px monospace`;
      ctx.fillStyle = '#0b0614';
      ctx.fillText(this.tText[i]!, x + 1, y + 1);
      ctx.fillStyle = this.tColor[i]!;
      ctx.fillText(this.tText[i]!, x, y);
    }
    this.releaseBursts(now);
    this.drawOneUps(ctx, now);
    const mt = (now - this.maxStart) / MAX_COMBO_MS;
    if (mt >= 0 && mt < 1) {
      const pop = mt < 0.15 ? 1 + (1 - mt / 0.15) * 0.5 : 1;
      ctx.globalAlpha = mt > 0.6 ? 1 - (mt - 0.6) / 0.4 : 1;
      ctx.font = `bold ${Math.round(28 * pop)}px monospace`;
      const y = Math.round(this.maxY - mt * 18);
      ctx.fillStyle = '#0b0614';
      ctx.fillText('MAX COMBO', Math.round(this.maxX) + 2, y + 2);
      ctx.fillStyle = '#ffd95a';
      ctx.fillText('MAX COMBO', Math.round(this.maxX), y);
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#fff4c2';
      ctx.fillText(`+${this.maxBonus}`, Math.round(this.maxX), y + 22);
    }
    ctx.restore();
  }

  /** Large animated "1UP!" messages: scale pop, then a gentle bob (no bob under reduced motion). */
  private drawOneUps(ctx: Ctx2D, now: number): void {
    const calm = this.flashScale < 1;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < MAX_ONEUP; i++) {
      const s = this.oStart[i]!;
      if (s === -Infinity) continue;
      const t = (now - s) / ONEUP_MS;
      if (t >= 1) {
        this.oStart[i] = -Infinity;
        this.oBurst[i] = 0;
        continue;
      }
      if (t < 0) continue;
      const pop = t < 0.2 ? 0.4 + 1.0 * (t / 0.2) : t < 0.3 ? 1.4 - 0.4 * ((t - 0.2) / 0.1) : 1;
      const bob = calm ? 0 : Math.sin(t * Math.PI * 4) * 4;
      const x = ONEUP_X;
      const y = Math.round(ONEUP_Y + bob);
      ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.font = `bold ${Math.max(8, Math.round(30 * pop))}px monospace`;
      ctx.fillStyle = '#0b0614';
      ctx.fillText('1UP!', x + 2, y + 2);
      ctx.fillStyle = '#ffd95a';
      ctx.fillText('1UP!', x + 1, y + 1);
      ctx.fillStyle = '#5dff7a';
      ctx.fillText('1UP!', x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** Green pulse behind the HUD lives icons; draw after the HUD. */
  drawHudPulse(ctx: Ctx2D, now: number): void {
    const p = this.livesPulse(now);
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.55 * p * Math.min(1, this.flashScale + 0.3);
    ctx.fillStyle = '#5dff7a';
    const w = 14 * Math.min(this.pulseLives, 4) + (this.pulseLives > 4 ? 26 : 0) + 46;
    ctx.fillRect(4, 37, w, 16);
    ctx.globalAlpha = 0.9 * p;
    ctx.strokeStyle = '#ffd95a';
    ctx.strokeRect(4, 37, w, 16);
    ctx.restore();
  }

  /** Full-canvas white impact flash (call inside the world transform, after lighting). */
  drawFlash(ctx: Ctx2D, now: number, width: number, height: number): void {
    const t = (now - this.flashStart) / FLASH_MS;
    if (t < 0 || t >= 1) return;
    ctx.save();
    ctx.globalAlpha = this.flashStrength * this.flashScale * (1 - t);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-MAX_SHAKE_PX, -MAX_SHAKE_PX, width + 2 * MAX_SHAKE_PX, height + 2 * MAX_SHAKE_PX);
    ctx.restore();
  }

  clear(): void {
    this.tStart.fill(-Infinity);
    this.rStart.fill(-Infinity);
    this.flashStart = -Infinity;
    this.maxStart = -Infinity;
    this.oStart.fill(-Infinity);
    this.oBurst.fill(0);
    this.oLastStart = -Infinity;
    this.pulseStart = -Infinity;
    this.pulseEnd = -Infinity;
    this.traumaVal = 0;
    this.traumaAt = -Infinity;
    this.hitStopUntil = -Infinity;
    this.holding = false;
  }
}

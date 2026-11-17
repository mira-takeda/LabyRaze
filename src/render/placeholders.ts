// Phase 1 placeholder drawing (task 22.1): flat shapes behind the DrawAdapter interface.
// Phase 2 (task 24.6) swaps the adapter for sprites; the Renderer only talks to DrawAdapter.

import type { Ctx2D } from './layout';
import type { SkinDef, SkinKind } from './skins';

export type CharacterKind = 'player' | 'hunter' | 'captive' | 'ally';
export type ItemDrawKind = 'ordinary' | 'power' | 'speed' | 'wisp' | 'bomb' | 'ghostHunt' | 'key';

export interface CharacterDrawOptions {
  /** Captive / ally index 0..2 (colour). */
  index?: number;
  /** Facing direction for eyes. */
  dir?: 'up' | 'down' | 'left' | 'right' | null;
  /** 0..1 opacity (fades, blinks). */
  alpha?: number;
  /** Render time in ms, for animation frames (render-side only). */
  timeMs?: number;
  /** Hunter frightened (Player holds power): different face/colour, same silhouette. */
  frightened?: boolean;
  /** Character holds power. */
  empowered?: boolean;
  /** Character is in Speed_State. */
  speedy?: boolean;
  /** Hunter just respawned (grace window). */
  graced?: boolean;
}

export interface DrawAdapter {
  drawCharacter(ctx: Ctx2D, kind: CharacterKind, px: number, py: number, size: number, opts?: CharacterDrawOptions): void;
  drawItem(ctx: Ctx2D, kind: ItemDrawKind, px: number, py: number, size: number, timeMs: number): void;
  drawDoor(ctx: Ctx2D, px: number, py: number, size: number, open: boolean, warning: number, timeMs: number): void;
  drawCageInterior(ctx: Ctx2D, px: number, py: number, size: number): void;
  drawCageGate(ctx: Ctx2D, px: number, py: number, size: number): void;
  /** `ctxInfo` (optional): Cell position and which neighbours are open floor, for autotiling. */
  drawWall(ctx: Ctx2D, px: number, py: number, size: number, hard: boolean, info?: TileInfo): void;
  drawFloor(ctx: Ctx2D, px: number, py: number, size: number, rubble: boolean, info?: TileInfo): void;
  /** Selects the biome theme (index from `biomeIndex(level)`) for later world-tile draws. */
  setBiome?(index: number): void;
  /** Character Workshop skin (cosmetic only), or null for the original design. */
  setSkin?(kind: SkinKind, skin: SkinDef | null): void;
}

/** Neighbourhood of a static Cell (autotile edges, shadows, decoration). */
export interface TileInfo {
  x: number;
  y: number;
  /** Neighbour above / below is not a wall. */
  openUp: boolean;
  openDown: boolean;
  /** Neighbour above is a wall (floor gets a cast shadow). */
  wallUp: boolean;
  /** Neighbours left / up are walls (corner cobweb). */
  wallLeft: boolean;
  /** Snow-biome ice Cell (light-blue glossy floor). */
  ice?: boolean;
}

/** Captive / ally colours (visual identity steering). */
export const ALLY_COLOURS: readonly string[] = ['#ff6fb5', '#3fd6c6', '#ff9f43'];
export const PALETTE = {
  floor: '#140c22',
  rubble: '#2a1d3a',
  wall: '#3b2a5c',
  wallHard: '#241838',
  cage: '#1d2a3a',
  gate: '#7a8cff',
  doorOpen: '#3fd67a',
  doorClosed: '#d6463f',
  doorWarn: '#ffd23f',
  player: '#f6f2ff',
  eyes: '#0b0614',
  hunter: '#2a1f3d',
  hunterEyes: '#ff9f43',
  hunterFrightened: '#4a6cff',
  ordinary: '#ffb347', // warm amber square
  wisp: '#7fe8ff', // cool cyan orb
  wispCore: '#c29bff', // violet core
  power: '#ff5ad1',
  speed: '#5affb0',
  bomb: '#9aa0b4',
  bombFuse: '#ff7a2f',
  ghostHunt: '#c8ff5a',
  key: '#ffe066',
} as const;

function ghostShape(ctx: Ctx2D, x: number, y: number, s: number, body: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = body;
  // Spirit bean: soft dome, slightly taller than wide, smooth rounded bottom (no sharp hem).
  const r = s * 0.34;
  const cx = x + s / 2;
  const top = y + s * 0.08;
  const bottom = y + s * 0.92;
  const k = s * 0.14;
  ctx.beginPath();
  ctx.arc(cx, top + r, r, Math.PI, 0);
  ctx.lineTo(cx + r, bottom - k);
  ctx.quadraticCurveTo(cx + r, bottom, cx + r - k, bottom);
  ctx.lineTo(cx - r + k, bottom);
  ctx.quadraticCurveTo(cx - r, bottom, cx - r, bottom - k);
  ctx.closePath();
  // Small side arm nubs.
  ctx.moveTo(cx - r, y + s * 0.55);
  ctx.arc(cx - r, y + s * 0.55, s * 0.06, 0, Math.PI * 2);
  ctx.moveTo(cx + r, y + s * 0.55);
  ctx.arc(cx + r, y + s * 0.55, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function eyes(ctx: Ctx2D, x: number, y: number, s: number, dir: CharacterDrawOptions['dir']): void {
  const dx = dir === 'left' ? -s * 0.06 : dir === 'right' ? s * 0.06 : 0;
  const dy = dir === 'up' ? -s * 0.05 : dir === 'down' ? s * 0.05 : 0;
  ctx.fillStyle = PALETTE.eyes;
  for (const ex of [0.38, 0.62]) {
    ctx.beginPath();
    ctx.ellipse(x + s * ex + dx, y + s * 0.42 + dy, s * 0.06, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const placeholderAdapter: DrawAdapter = {
  drawCharacter(ctx, kind, px, py, size, opts = {}) {
    const alpha = opts.alpha ?? 1;
    ctx.save();
    if (kind === 'hunter') {
      // Hunter: always a square silhouette, ember eyes on a shadow body.
      const m = Math.round(size * 0.12);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = opts.frightened ? PALETTE.hunterFrightened : PALETTE.hunter;
      ctx.fillRect(px + m, py + m, size - 2 * m, size - 2 * m);
      ctx.fillStyle = opts.frightened ? PALETTE.eyes : PALETTE.hunterEyes;
      ctx.fillRect(px + size * 0.32, py + size * 0.36, size * 0.1, size * 0.1);
      ctx.fillRect(px + size * 0.58, py + size * 0.36, size * 0.1, size * 0.1);
    } else {
      const body = kind === 'player' ? PALETTE.player : (ALLY_COLOURS[(opts.index ?? 0) % 3] ?? PALETTE.player);
      ghostShape(ctx, px, py, size, body, alpha);
      ctx.globalAlpha = alpha;
      eyes(ctx, px, py, size, opts.dir ?? null);
    }
    ctx.restore();
  },

  drawItem(ctx, kind, px, py, size, timeMs) {
    const cx = px + size / 2;
    const cy = py + size / 2;
    ctx.save();
    switch (kind) {
      case 'ordinary': {
        const s = Math.max(2, Math.round(size * 0.18));
        ctx.fillStyle = PALETTE.ordinary;
        ctx.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s);
        break;
      }
      case 'wisp': {
        const bob = Math.sin(timeMs / 400 + px * 0.05) * size * 0.06;
        ctx.fillStyle = PALETTE.wisp;
        ctx.beginPath();
        ctx.arc(cx, cy + bob, size * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.wispCore;
        ctx.beginPath();
        ctx.arc(cx, cy + bob, size * 0.07, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'power': {
        ctx.fillStyle = PALETTE.power;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'speed': {
        ctx.fillStyle = PALETTE.speed;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size * 0.3);
        ctx.lineTo(cx + size * 0.22, cy);
        ctx.lineTo(cx, cy + size * 0.3);
        ctx.lineTo(cx - size * 0.22, cy);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'bomb': {
        ctx.fillStyle = PALETTE.bomb;
        ctx.beginPath();
        ctx.arc(cx, cy + size * 0.04, size * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.bombFuse;
        ctx.fillRect(cx + size * 0.08, cy - size * 0.3, size * 0.08, size * 0.12);
        break;
      }
      case 'ghostHunt': {
        ctx.fillStyle = PALETTE.ghostHunt;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? size * 0.32 : size * 0.14;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'key': {
        ctx.fillStyle = PALETTE.key;
        ctx.beginPath();
        ctx.arc(cx - size * 0.12, cy, size * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - size * 0.02, cy - size * 0.04, size * 0.3, size * 0.08);
        ctx.fillRect(cx + size * 0.18, cy, size * 0.06, size * 0.12);
        break;
      }
    }
    ctx.restore();
  },

  drawDoor(ctx, px, py, size, open, warning, timeMs) {
    ctx.save();
    const pulse = warning > 0 ? 0.5 + 0.5 * Math.sin(timeMs / 70) : 0;
    ctx.fillStyle = open ? PALETTE.doorOpen : PALETTE.doorClosed;
    ctx.globalAlpha = open ? 0.35 : 1;
    if (open) ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
    else ctx.fillRect(px, py, size, size);
    if (warning > 0) {
      ctx.globalAlpha = 0.4 + 0.6 * pulse;
      ctx.strokeStyle = PALETTE.doorWarn;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
    }
    ctx.restore();
  },

  drawCageInterior(ctx, px, py, size) {
    ctx.fillStyle = PALETTE.cage;
    ctx.fillRect(px, py, size, size);
  },

  drawCageGate(ctx, px, py, size) {
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = PALETTE.gate;
    for (let i = 1; i < 4; i++) ctx.fillRect(px + (i * size) / 4 - 1, py, 2, size);
  },

  drawWall(ctx, px, py, size, hard) {
    ctx.fillStyle = hard ? PALETTE.wallHard : PALETTE.wall;
    ctx.fillRect(px, py, size, size);
  },

  drawFloor(ctx, px, py, size, rubble) {
    ctx.fillStyle = rubble ? PALETTE.rubble : PALETTE.floor;
    ctx.fillRect(px, py, size, size);
  },
};

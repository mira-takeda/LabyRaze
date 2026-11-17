// Frame composition (task 22.5). Reads GameState and events; never writes to the Simulation.
//
// Layers, back to front: static maze (offscreen), Doors (with warning pulse), items, Keys,
// Captives in the Cage, allied ghosts, characters (interpolated), HUD. Optional `extras` hooks
// let Phase 2 add lighting, particles and effects without changing this composition order.

import type { GameConfig } from '../core/config';
import type { GameEvent } from '../core/events';
import { buildHud } from '../core/hud';
import type { HudModel } from '../core/hud';
import { speedUnits } from '../core/powers';
import { unitsPerTick } from '../core/progression';
import { hunterBaseUnits } from '../core/sim';
import { ItemKind } from '../core/types';
import type { Character, GameState } from '../core/types';
import { interpolate } from './interp';
import { HUD_H, TILE, cellToPx } from './layout';
import type { Ctx2D, SurfaceFactory } from './layout';
import { PALETTE, placeholderAdapter } from './placeholders';
import type { DrawAdapter, ItemDrawKind } from './placeholders';
import { StaticLayer } from './staticLayer';
import { biomeFor, biomeIndex } from './biomes';
import type { BiomeFx } from './biomeFx';
import type { AllyRenderer } from './allies';
import type { CelebrationLayer } from './celebration';
import type { DoorsLayer } from './doorsLayer';
import { POWER_BLINK_MS, animTime, characterAlpha, drawInvulnAura } from './effects';
import type { RoleFlash } from './effects';
import type { ExplosionLayer } from './explosion';
import type { FeedbackLayer } from './feedback';
import type { HudRenderer } from './hudRenderer';
import type { Lighting } from './lighting';
import type { ParticlePool } from './particles';
import type { SpawnFx } from './spawnFx';
import type { TierSettings } from './quality';

const ITEM_KINDS: Readonly<Record<number, ItemDrawKind>> = {
  [ItemKind.Ordinary]: 'ordinary',
  [ItemKind.Power]: 'power',
  [ItemKind.Speed]: 'speed',
  [ItemKind.Wisp]: 'wisp',
  [ItemKind.Bomb]: 'bomb',
  [ItemKind.GhostHunt]: 'ghostHunt',
};

export { INVULN_BLINK_MS, POWER_BLINK_MS, POWER_WARN_TICKS } from './effects';
/** Largest combined camera offset; the HUD is drawn afterwards, so it never shakes. */
export const SHAKE_LIMIT_PX = 20;

export interface RenderExtras {
  /** After the static layer and before items (e.g. floor lighting). */
  underlay?: (ctx: Ctx2D, state: GameState, timeMs: number) => void;
  /** After characters, before the HUD (particles, explosion flashes, glow). */
  overlay?: (ctx: Ctx2D, state: GameState, timeMs: number, alpha: number) => void;
}

export interface FrameInfo {
  alpha: number;
  timeMs: number;
  /** Screen shake offset in pixels (Phase 2). */
  shake?: { x: number; y: number };
}

/** Phase 2 components (task 25.6). Each is optional; without them Phase 1 drawing is used. */
export interface Phase2Layers {
  doors?: DoorsLayer;
  allies?: AllyRenderer;
  explosion?: ExplosionLayer;
  /** Death, pickup and explosion feedback (task 36.2). */
  feedback?: FeedbackLayer;
  lighting?: Lighting;
  particles?: ParticlePool;
  hud?: HudRenderer;
  /** Level-start biome banner and ambient particles (task 36.5). */
  biomeFx?: BiomeFx;
  roleFlash?: RoleFlash;
  /** Level milestone celebration overlay (task 37.3). */
  celebration?: CelebrationLayer;
  /** Level-start and respawn locator plus death sequencing (second playtest). */
  spawn?: SpawnFx;
  /** Active quality settings (glow, shake). */
  settings?: () => TierSettings;
}

export class Renderer {
  private layer: StaticLayer | null = null;
  private layerMaze: GameState['maze'] | null = null;
  private pendingPatch: Array<{ x: number; y: number }> = [];
  extras: RenderExtras = {};
  /** Reduced-motion setting from the Shell: camera shake on/off and flash strength. */
  motion = { shake: true, flash: 1 };
  /** Hunter speed of the current Run (permille), set by the Shell, for interpolation only. */
  hunterSpeedPermille = 1000;
  /** Camera offset applied to the last frame (read-only diagnostics). */
  lastShake = { x: 0, y: 0 };
  layers: Phase2Layers = {};
  /** Last HUD model drawn (tests and accessibility read it). */
  lastHud: HudModel | null = null;
  private lastFrameMs = 0;
  private lastState: GameState | null = null;

  constructor(
    private readonly ctx: Ctx2D,
    private readonly cfg: GameConfig,
    private readonly factory: SurfaceFactory,
    public adapter: DrawAdapter = placeholderAdapter,
  ) {}

  /** Event hook: destroyed walls are patched into the static layer on the next frame. */
  onEvents(events: ReadonlyArray<GameEvent>, now = this.lastFrameMs): void {
    for (const e of events) {
      if (e.t === 'WallsDestroyed') this.pendingPatch.push(...e.cells.map((c) => ({ x: c.x, y: c.y })));
      if (e.t === 'LevelStarted') {
        this.layerMaze = null;
        this.layers.doors?.reset();
        this.layers.particles?.clear();
        this.layers.feedback?.clear();
      }
    }
    this.layers.doors?.handle(events, now);
    this.layers.explosion?.handle(events, now);
    this.layers.feedback?.handle(events, now, this.lastState);
    this.layers.celebration?.handle(events, now);
    this.layers.roleFlash?.handle(events, now);
    this.layers.biomeFx?.handle(events, now);
    this.layers.spawn?.handle(events, now);
    for (const e of events) {
      if (e.t !== 'PlayerEaten') continue;
      const p = cellToPx(e.cell.x, e.cell.y);
      this.layers.lighting?.explosion(p.x + TILE / 2, p.y + TILE / 2, 2.5);
    }
  }

  /** Forces the static layer to be rebuilt (e.g. after the adapter changes). */
  invalidate(): void {
    this.layerMaze = null;
  }

  private ensureLayer(state: GameState): StaticLayer {
    if (this.layer === null || this.layerMaze !== state.maze) {
      this.adapter.setBiome?.(biomeIndex(state.levelNumber));
      this.layer = new StaticLayer(state.maze, this.adapter, this.factory);
      this.layer.render(state.walls.tiles);
      this.layerMaze = state.maze;
      this.pendingPatch = [];
    } else if (this.pendingPatch.length > 0) {
      this.layer.patch(state.walls.tiles, this.pendingPatch);
      this.pendingPatch = [];
    }
    return this.layer;
  }

  draw(state: GameState, frame: FrameInfo): void {
    const ctx = this.ctx;
    const { timeMs } = frame;
    const L = this.layers;
    let dt = this.lastFrameMs > 0 ? Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000)) : 0;
    this.lastFrameMs = timeMs;
    this.lastState = state;
    L.spawn?.sync(state, timeMs);
    // Render-only hit-stop: freezes interpolation and slows particles; the Tick loop is untouched.
    if (L.feedback) {
      const hs = L.feedback.applyHitStop(timeMs, frame.alpha);
      frame = { ...frame, alpha: hs.alpha };
      dt *= hs.timeScale;
    }
    const settings = L.settings?.();
    const shakeOn = this.cfg.screenShake && this.motion.shake && (settings ? settings.shake : true);
    if (L.explosion) L.explosion.shakeEnabled = shakeOn;
    if (L.feedback) L.feedback.shakeEnabled = shakeOn;
    if (L.feedback) L.feedback.flashScale = this.motion.flash;
    if (L.celebration) {
      L.celebration.flashScale = this.motion.flash;
      L.celebration.motionEnabled = this.motion.shake && this.motion.flash >= 1;
    }
    const base = frame.shake ?? L.explosion?.shake(timeMs) ?? { x: 0, y: 0 };
    const extra = L.feedback?.shake(timeMs);
    const raw = extra ? { x: base.x + extra.x, y: base.y + extra.y } : base;
    const lim = (v: number): number => Math.max(-SHAKE_LIMIT_PX, Math.min(SHAKE_LIMIT_PX, v));
    const shake = { x: lim(raw.x), y: lim(raw.y) };
    this.lastShake = shake;
    const layer = this.ensureLayer(state);
    const w = state.maze.width;
    const width = w * TILE;
    const height = state.maze.height * TILE + HUD_H;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0614';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(Math.round(shake.x), Math.round(shake.y));
    ctx.drawImage(layer.canvas, 0, HUD_H);
    this.extras.underlay?.(ctx, state, timeMs);

    // Doors.
    if (L.doors) {
      L.doors.draw(ctx, state, this.adapter, timeMs);
    } else {
      state.maze.doors.forEach((d, i) => {
        const ds = state.doors[i]!;
        const p = cellToPx(d.cell.x, d.cell.y);
        this.adapter.drawDoor(ctx, p.x, p.y, TILE, ds.open, ds.warning, timeMs);
      });
    }

    // Items (one per Cell).
    const kinds = state.items.kinds;
    for (let i = 0; i < kinds.length; i++) {
      const k = ITEM_KINDS[kinds[i]!];
      if (k === undefined) continue;
      const p = cellToPx(i % w, Math.floor(i / w));
      this.adapter.drawItem(ctx, k, p.x, p.y, TILE, timeMs);
    }
    for (const key of state.items.keys) {
      const p = cellToPx(key.x, key.y);
      this.adapter.drawItem(ctx, 'key', p.x, p.y, TILE, timeMs);
    }

    const levelUnits = unitsPerTick(state.levelNumber, this.cfg);
    const hunterUnits = hunterBaseUnits(levelUnits, { hunterSpeedPermille: this.hunterSpeedPermille });
    const allyUnits = Math.round(levelUnits * this.cfg.allyFactor);
    if (L.allies) {
      L.allies.draw(ctx, state, this.adapter, frame.alpha, allyUnits, this.cfg.allyLeaveTicks, timeMs);
    } else {
      // Captives drawn in the Cage while still captive and not out as allies.
      const interior = state.maze.cage.interior;
      state.ghostHunt.allies.forEach((a, i) => {
        if (state.captives[i] || a.mode !== 'inactive' || interior.length === 0) return;
        const c = interior[(i * 2) % interior.length] ?? interior[i % interior.length]!;
        const p = cellToPx(c.x, c.y);
        this.adapter.drawCharacter(ctx, 'captive', p.x, p.y, TILE, { index: i, timeMs, alpha: 0.85 });
      });
      // Allied ghosts.
      state.ghostHunt.allies.forEach((a, i) => {
        if (a.mode === 'inactive' || (a.mode === 'hunting' && a.spawnIn > 0)) return;
        const pos = interpolate(a, frame.alpha, allyUnits);
        const p = cellToPx(pos.x, pos.y);
        const fade = a.mode === 'leaving' ? Math.max(0, a.leaveIn / Math.max(1, this.cfg.allyLeaveTicks)) : 1;
        this.adapter.drawCharacter(ctx, 'ally', p.x, p.y, TILE, { index: i, dir: a.dir, timeMs, alpha: fade });
      });
    }

    // Characters.
    this.drawCharacter(state, state.hunter, frame, hunterUnits);
    this.drawCharacter(state, state.player, frame, levelUnits);

    // Particles, explosion flashes, then additive lighting.
    const biome = biomeFor(state.levelNumber);
    if (L.lighting) {
      L.lighting.ambient = biome.ambient;
      L.lighting.wispColor = biome.wispGlow;
    }
    if (L.particles) {
      L.biomeFx?.update(state, timeMs, dt, L.particles);
      L.particles.update(dt);
      L.particles.draw(ctx);
    }
    L.feedback?.draw(ctx, timeMs);
    if (L.explosion) {
      for (const p of L.explosion.pending) L.lighting?.explosion(p.x, p.y, p.radiusCells);
      L.explosion.pending.length = 0;
      L.explosion.draw(ctx, timeMs);
    }
    if (L.lighting) L.lighting.draw(ctx, state, timeMs, width, height, settings && !settings.glow ? 0 : (settings?.glowScale ?? 0.5));
    // Characters again on top of the additive glow, so their true colours (dark eyes, custom
    // Workshop colours) are not washed out; the glow still surrounds them.
    if (L.lighting && (!settings || settings.glow)) {
      this.drawCharacter(state, state.hunter, frame, hunterUnits);
      this.drawCharacter(state, state.player, frame, levelUnits);
    }

    L.feedback?.drawFlash(ctx, timeMs, width, height);
    L.spawn?.draw(ctx, timeMs);
    this.extras.overlay?.(ctx, state, timeMs, frame.alpha);
    L.biomeFx?.drawBanner(ctx, timeMs, width, height);
    L.celebration?.draw(ctx, timeMs, width, height);
    ctx.restore();

    const hud = buildHud(state, this.cfg);
    this.lastHud = hud;
    if (L.hud) L.hud.draw(ctx, hud);
    else drawHud(ctx, hud, width, timeMs);
    L.feedback?.drawHudPulse(ctx, timeMs);
  }

  private drawCharacter(state: GameState, c: Character, frame: FrameInfo, levelUnits: number): void {
    if (c.id === 'hunter' && c.respawnIn > 0) return; // waiting to respawn: not on the board
    if (c.id === 'player' && this.layers.spawn?.hidePlayer(frame.timeMs)) return; // death / locator sequence
    const pos = interpolate(c, frame.alpha, speedUnits(levelUnits, c, this.cfg));
    const p = cellToPx(pos.x, pos.y);
    const alpha = characterAlpha(c, frame.timeMs);
    const frightened = c.id === 'hunter' && state.player.power > 0;
    this.adapter.drawCharacter(this.ctx, c.id, p.x, p.y, TILE, {
      dir: c.dir,
      timeMs: animTime(c, frame.timeMs),
      alpha,
      frightened,
      empowered: c.power > 0,
      speedy: c.speed > 0,
      graced: c.id === 'hunter' && c.invulnerable > 0,
    });
    if (c.id === 'player' && c.invulnerable > 0) drawInvulnAura(this.ctx, p.x, p.y, TILE, frame.timeMs);
    this.layers.roleFlash?.draw(this.ctx, c.id, p.x, p.y, TILE, frame.timeMs);
  }
}

/** HUD strip: every required field is drawn as text or icons. */
export function drawHud(ctx: Ctx2D, hud: HudModel, width: number, timeMs: number): void {
  ctx.save();
  ctx.fillStyle = '#0f0820';
  ctx.fillRect(0, 0, width, HUD_H);
  ctx.fillStyle = '#2b1f45';
  ctx.fillRect(0, HUD_H - 2, width, 2);
  ctx.font = 'bold 13px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2e9ff';
  ctx.fillText(`SCORE ${hud.score}`, 8, 6);
  ctx.fillText(`LEVEL ${hud.level}`, 8, 24);
  ctx.fillText(`LIVES ${'♥'.repeat(Math.max(0, Math.min(9, hud.lives)))}${hud.lives > 9 ? `+${hud.lives - 9}` : ''}`, 8, 42);

  ctx.fillStyle = PALETTE.key;
  ctx.fillText(`KEYS ${hud.carriedKeys}`, 150, 6);
  ctx.fillStyle = '#ffb3e0';
  ctx.fillText(`FREED ${hud.rescued}/${hud.rescuedTotal}`, 150, 24);
  ctx.fillStyle = PALETTE.ordinary;
  ctx.fillText(`PELLETS ${hud.pelletsRemaining}`, 150, 42);

  // Bomb slots.
  ctx.fillStyle = '#c9c2dc';
  ctx.fillText('BOMBS', 280, 6);
  hud.bombs.filled.forEach((f, i) => {
    ctx.fillStyle = f ? PALETTE.bomb : '#2b1f45';
    ctx.beginPath();
    ctx.arc(339 + i * 16, 13, 6, 0, Math.PI * 2);
    ctx.fill();
    if (f) {
      ctx.fillStyle = PALETTE.bombFuse;
      ctx.fillRect(341 + i * 16, 4, 2, 4);
    }
  });

  // Ghost Hunt timer.
  if (hud.ghostHunt.active) {
    ctx.fillStyle = PALETTE.ghostHunt;
    ctx.fillText(`HUNT ${hud.ghostHunt.secondsLeft.toFixed(1)}s`, 280, 24);
    ctx.fillRect(280, 39, Math.round(90 * hud.ghostHunt.fraction), 3);
  }

  // Combo.
  if (hud.combo.multiplier > 1 || hud.combo.windowFraction > 0) {
    ctx.fillStyle = PALETTE.wisp;
    ctx.fillText(`COMBO x${hud.combo.multiplier}`, 280, 46);
    ctx.fillRect(370, 50, Math.round(40 * hud.combo.windowFraction), 3);
  }

  // Power and Speed seconds.
  ctx.textAlign = 'right';
  const right = width - 8;
  const blink = Math.floor(timeMs / POWER_BLINK_MS) % 2 === 0;
  if (hud.player.powerSeconds > 0) {
    ctx.fillStyle = blink ? PALETTE.power : '#ffffff';
    ctx.fillText(`POWER ${hud.player.powerSeconds.toFixed(1)}s`, right, 6);
  } else if (hud.hunter.powerSeconds > 0) {
    ctx.fillStyle = blink ? PALETTE.hunterEyes : '#ff5a5a';
    ctx.fillText(`SHADOW BITE POWER ${hud.hunter.powerSeconds.toFixed(1)}s`, right, 6);
  }
  if (hud.player.speedSeconds > 0) {
    ctx.fillStyle = PALETTE.speed;
    ctx.fillText(`SPEED ${hud.player.speedSeconds.toFixed(1)}s`, right, 24);
  }
  if (hud.hunter.speedSeconds > 0) {
    ctx.fillStyle = '#ffe680';
    ctx.fillText(`SB SPEED ${hud.hunter.speedSeconds.toFixed(1)}s`, right, 42);
  }
  ctx.restore();
}

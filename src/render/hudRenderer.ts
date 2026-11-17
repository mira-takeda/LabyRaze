// Polished HUD (task 28.5): sprite icons for Lives, Keys, Captives, pellets, power and speed
// timers, three Bomb slots, Ghost_Hunt time bar and Combo multiplier with its window bar. Drawn
// onto its own small canvas and redrawn only when the visible view-model changes.

import { DEFAULT_CONFIG } from '../core/config';
import type { HudModel } from '../core/hud';
import { HUD_H } from './layout';
import type { Ctx2D, SurfaceFactory } from './layout';
import type { SpriteAtlas } from './spriteCache';

/** The parts of the HUD that are visible (rounded), used for dirty tracking. */
export function hudKey(h: HudModel): string {
  return JSON.stringify([
    h.score,
    h.lives,
    h.level,
    h.carriedKeys,
    h.rescued,
    h.pelletsRemaining,
    h.bombs.filled,
    h.ghostHunt.active ? Math.ceil(h.ghostHunt.secondsLeft * 10) : 0,
    h.combo.multiplier,
    Math.round(h.combo.windowFraction * 40),
    h.combo.chainPoints,
    h.wisps.collected,
    h.wisps.total,
    Math.ceil(h.player.powerSeconds * 10),
    Math.ceil(h.hunter.powerSeconds * 10),
    Math.ceil(h.player.speedSeconds * 10),
    Math.ceil(h.hunter.speedSeconds * 10),
  ]);
}

/** Combo tier colour: cool cyan at tier 1 rising through violet and pink to gold at the cap. */
export function comboTierColor(tier: number, cap: number): string {
  const palette = ['#7fe8ff', '#8fb8ff', '#c29bff', '#ff8ad8', '#ffd95a'];
  if (cap <= 1) return palette[palette.length - 1]!;
  const f = Math.min(1, Math.max(0, (tier - 1) / (cap - 1)));
  return palette[Math.round(f * (palette.length - 1))]!;
}

export class HudRenderer {
  private readonly surface: { canvas: CanvasImageSource; ctx: Ctx2D };
  private key = '';
  redraws = 0;
  /** Difficulty label drawn in the bottom-right corner (set by the Shell; null draws nothing). */
  difficulty: { label: string; color: string } | null = null;

  constructor(
    factory: SurfaceFactory,
    private readonly width: number,
    private readonly atlas: SpriteAtlas | null,
    private readonly wispPoints = DEFAULT_CONFIG.wispPoints,
  ) {
    this.surface = factory(width, HUD_H);
  }

  private icon(name: string, x: number, y: number, fallback: string): void {
    const g = this.surface.ctx;
    if (this.atlas && this.atlas.draw(g, name, x, y, 1)) return;
    g.fillStyle = fallback;
    g.fillRect(x + 2, y + 2, 8, 8);
  }

  private bar(x: number, y: number, w: number, frac: number, color: string): void {
    const g = this.surface.ctx;
    g.fillStyle = '#2b1f45';
    g.fillRect(x, y, w, 4);
    g.fillStyle = color;
    g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), 4);
  }

  /** Redraws the HUD canvas if needed; then blits it. Returns true when it was redrawn. */
  draw(ctx: Ctx2D, h: HudModel): boolean {
    const k = hudKey(h) + (this.difficulty ? this.difficulty.label : '');
    let redrawn = false;
    if (k !== this.key) {
      this.key = k;
      this.redraws++;
      redrawn = true;
      this.render(h);
    }
    ctx.drawImage(this.surface.canvas, 0, 0);
    return redrawn;
  }

  private render(h: HudModel): void {
    const g = this.surface.ctx;
    const W = this.width;
    g.save();
    g.clearRect(0, 0, W, HUD_H);
    g.fillStyle = '#0f0820';
    g.fillRect(0, 0, W, HUD_H);
    g.fillStyle = '#3b2a5c';
    g.fillRect(0, HUD_H - 2, W, 2);
    g.font = 'bold 12px monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'left';

    // Column 1: score, level, lives.
    g.fillStyle = '#f2e9ff';
    g.fillText(`SCORE ${h.score}`, 8, 11);
    g.fillStyle = '#c9bfe6';
    g.fillText(`LEVEL ${h.level}  x${h.speedFactor.toFixed(2)}`, 8, 29);
    const shown = Math.min(h.lives, 4);
    for (let i = 0; i < shown; i++) this.icon('ghost-icon:p', 9 + i * 14, 40, '#f6f2ff');
    let lx = 8 + shown * 14 + 4;
    g.fillStyle = '#f2e9ff';
    if (h.lives > shown) {
      const extra = `+${h.lives - shown}`;
      g.fillText(extra, lx, 47);
      lx += extra.length * 8 + 4; // 12px monospace is about 7.2 px per glyph
    }
    g.fillText('LIVES', lx, 47);

    // Column 2: Keys, Captives, pellets.
    const c2 = 150;
    this.icon('item:key', c2, 4, '#ffe066');
    g.fillStyle = '#ffe066';
    g.fillText(`x${h.carriedKeys}`, c2 + 15, 11);
    for (let i = 0; i < 3; i++) this.icon(i < h.rescued ? `ghost-icon:a${i}` : 'ghost-icon:p', c2 + 41 + i * 14, 4, i < h.rescued ? '#ff6fb5' : '#3a2f50');
    g.fillStyle = '#ffb3e0';
    g.fillText(`${h.rescued}/${h.rescuedTotal}`, c2 + 84, 11);
    this.icon('item:ordinary', c2, 22, '#ffb347');
    g.fillStyle = '#ffb347';
    g.fillText(`${h.pelletsRemaining}`, c2 + 15, 29);
    this.bar(c2 + 50, 27, 60, h.pelletsTotal > 0 ? h.pelletsRemaining / h.pelletsTotal : 0, '#ffb347');

    // Column 3: Bomb slots, Ghost Hunt, Combo.
    const c3 = 285;
    g.fillStyle = '#c9c2dc';
    g.fillText('BOMBS', c3, 11);
    h.bombs.filled.forEach((f, i) => {
      g.globalAlpha = f ? 1 : 0.25;
      this.icon('item:bomb', c3 + 46 + i * 14, 4, '#9aa0b4');
      g.globalAlpha = 1;
    });
    if (h.ghostHunt.active) {
      this.icon('item:ghostHunt', c3, 22, '#c8ff5a');
      g.fillStyle = '#c8ff5a';
      g.fillText(`${h.ghostHunt.secondsLeft.toFixed(1)}s`, c3 + 15, 29);
      this.bar(c3 + 56, 27, 50, h.ghostHunt.fraction, '#c8ff5a');
    }
    // Wisps are a separate score source: shown apart from the pellet counter.
    this.icon('item:wisp:0', c3, 40, '#7fe8ff');
    g.fillStyle = '#7fe8ff';
    g.fillText(`WISPS ${h.wisps.collected}/${h.wisps.total}`, c3 + 15, 47);
    if (h.combo.multiplier > 1 || h.combo.windowFraction > 0) {
      const col = comboTierColor(h.combo.tier, h.combo.cap);
      const max = h.combo.cap > 1 && h.combo.tier >= h.combo.cap;
      g.fillStyle = col;
      // Row y=50 sits below the right column's lowest timer (SQ SPEED, y=38) so they never overlap.
      g.fillText(`${max ? 'MAX' : 'COMBO'} x${h.combo.multiplier} +${h.combo.chainPoints}`, c3 + 112, 50);
      // Tier progress bar (tier colour) above the shrinking window bar.
      this.bar(c3, 54, 96, h.combo.tierFraction, col);
      this.bar(c3, 58, 96, h.combo.windowFraction, '#c29bff');
    } else {
      // No chain running: show what a Wisp is worth.
      g.fillStyle = '#5fb8d0';
      g.fillText(`1 WISP = +${this.wispPoints}`, c3 + 112, 50);
    }

    // Column 4 (right aligned): power and speed timers.
    g.textAlign = 'right';
    const R = W - 8;
    if (h.player.powerSeconds > 0) {
      g.fillStyle = '#ff5ad1';
      g.fillText(`POWER ${h.player.powerSeconds.toFixed(1)}s`, R, 8);
      this.bar(R - 70, 15, 70, h.player.powerFraction, '#ff5ad1');
    } else if (h.hunter.powerSeconds > 0) {
      g.fillStyle = '#ff5a5a';
      g.fillText(`SHADOW BITE ${h.hunter.powerSeconds.toFixed(1)}s`, R, 8);
      this.bar(R - 70, 15, 70, h.hunter.powerFraction, '#ff5a5a');
    }
    if (h.player.speedSeconds > 0) {
      g.fillStyle = '#5affb0';
      g.fillText(`SPEED ${h.player.speedSeconds.toFixed(1)}s`, R, 26);
    }
    if (h.hunter.speedSeconds > 0) {
      g.fillStyle = '#ffe680';
      g.fillText(`SB SPEED ${h.hunter.speedSeconds.toFixed(1)}s`, R, 38);
    }
    if (this.difficulty) {
      // Bottom-right strip: below the Combo / Wisp text (y=50), right of the Combo bars (x <= c3 + 96),
      // above the bottom border; far from the lives text and the CHEAT RUN badge (x 180).
      g.font = 'bold 10px monospace';
      g.fillStyle = this.difficulty.color;
      g.fillText(this.difficulty.label, R, HUD_H - 6);
    }
    g.restore();
  }
}

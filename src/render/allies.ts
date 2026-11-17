// Allied ghost rendering (task 25.4): allied palettes, trailing afterimage, `leaving` fade from
// leaveIn / allyLeaveTicks, animation, and the derived Cage presentation: a Captive is drawn in
// the Cage exactly when `!captives[i] && mode === 'inactive'`.

import type { Ally, GameState } from '../core/types';
import { interpolate } from './interp';
import { TILE, cellToPx } from './layout';
import type { Ctx2D } from './layout';
import type { DrawAdapter } from './placeholders';

export const AFTERIMAGES = 3;

/** True when Captive i is drawn inside the Cage. */
export function captiveInCage(s: Pick<GameState, 'captives' | 'ghostHunt'>, i: 0 | 1 | 2): boolean {
  return !s.captives[i] && s.ghostHunt.allies[i]!.mode === 'inactive';
}

/** True when ally i is drawn in the Maze. */
export function allyVisible(a: Ally): boolean {
  return a.mode === 'returning' || a.mode === 'leaving' || (a.mode === 'hunting' && a.spawnIn === 0);
}

/**
 * Render-side wobble so caged captives look alive and restless: each ghost drifts a
 * couple of pixels on its own timing and glances left and right. Purely visual: pixel
 * offsets applied at draw time, never written to the Simulation.
 */
export function captiveWobble(timeMs: number, index: number): { dx: number; dy: number; dir: 'left' | 'right' | null } {
  const t = timeMs / 1000;
  const phase = index * 2.1;
  const dx = Math.round(Math.sin(t * (2.2 + index * 0.5) + phase) * 1.5);
  const dy = Math.round(Math.sin(t * (2.8 + index * 0.4) + phase * 1.7) * 1.5);
  const look = Math.sin(t * (0.9 + index * 0.23) + phase);
  const dir = look > 0.55 ? 'right' : look < -0.55 ? 'left' : null;
  return { dx, dy, dir };
}

export function leavingAlpha(a: Ally, allyLeaveTicks: number): number {
  return a.mode === 'leaving' ? Math.max(0, Math.min(1, a.leaveIn / Math.max(1, allyLeaveTicks))) : 1;
}

export class AllyRenderer {
  /** Render-side history of drawn positions per ally, for the afterimage. */
  private readonly history: Array<Array<{ x: number; y: number }>> = [[], [], []];

  draw(ctx: Ctx2D, s: GameState, adapter: DrawAdapter, alpha: number, units: number, allyLeaveTicks: number, timeMs: number): void {
    // Captives in the Cage.
    const interior = s.maze.cage.interior;
    for (const i of [0, 1, 2] as const) {
      if (!captiveInCage(s, i) || interior.length === 0) {
        continue;
      }
      const c = interior[(i * 2) % interior.length] ?? interior[i % interior.length]!;
      const p = cellToPx(c.x, c.y);
      const wobble = captiveWobble(timeMs, i);
      adapter.drawCharacter(ctx, 'captive', p.x + wobble.dx, p.y + wobble.dy, TILE, { index: i, dir: wobble.dir, timeMs, alpha: 0.9 });
    }
    // Allies in the Maze with afterimages.
    s.ghostHunt.allies.forEach((a, i) => {
      const hist = this.history[i]!;
      if (!allyVisible(a)) {
        hist.length = 0;
        return;
      }
      const pos = interpolate(a, alpha, units);
      const p = cellToPx(pos.x, pos.y);
      const fade = leavingAlpha(a, allyLeaveTicks);
      hist.forEach((h, k) => {
        const ka = (fade * 0.35 * (k + 1)) / (AFTERIMAGES + 1);
        adapter.drawCharacter(ctx, 'ally', h.x, h.y, TILE, { index: i, dir: a.dir, timeMs, alpha: ka });
      });
      adapter.drawCharacter(ctx, 'ally', p.x, p.y, TILE, { index: i, dir: a.dir, timeMs, alpha: fade });
      hist.push({ x: p.x, y: p.y });
      if (hist.length > AFTERIMAGES) hist.shift();
    });
  }
}

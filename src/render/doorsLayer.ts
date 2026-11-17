// Door animation layer (task 25.2): open and closed art with different glow colours, a warning
// pulse driven by `door.warning` (the Simulation raises it at least doorWarnTicks >= 30 Ticks
// before a change), and a transition animation on DoorChanged (render-side timer).

import type { GameEvent } from '../core/events';
import type { GameState } from '../core/types';
import { TILE, cellToPx } from './layout';
import type { Ctx2D } from './layout';
import type { DrawAdapter } from './placeholders';

export const DOOR_TRANSITION_MS = 220;
export const OPEN_GLOW = '#3fd67a';
export const CLOSED_GLOW = '#d6463f';
export const WARN_GLOW = '#ffd23f';

export class DoorsLayer {
  private readonly changedAt = new Map<number, { at: number; open: boolean }>();

  handle(events: ReadonlyArray<GameEvent>, now: number): void {
    for (const e of events) if (e.t === 'DoorChanged') this.changedAt.set(e.doorIndex, { at: now, open: e.open });
  }

  reset(): void {
    this.changedAt.clear();
  }

  /** 0..1 progress of the transition animation of Door i (1 = finished). */
  transition(i: number, now: number): number {
    const c = this.changedAt.get(i);
    if (!c) return 1;
    return Math.max(0, Math.min(1, (now - c.at) / DOOR_TRANSITION_MS));
  }

  draw(ctx: Ctx2D, s: GameState, adapter: DrawAdapter, now: number): void {
    s.maze.doors.forEach((d, i) => {
      const st = s.doors[i];
      if (!st) return;
      const p = cellToPx(d.cell.x, d.cell.y);
      const t = this.transition(i, now);
      // Glow halo under the door.
      ctx.save();
      ctx.globalAlpha = (st.warning > 0 ? 0.35 + 0.35 * Math.abs(Math.sin(now / 90)) : 0.22) * (st.open ? 1 : 1.2);
      ctx.fillStyle = st.warning > 0 ? WARN_GLOW : st.open ? OPEN_GLOW : CLOSED_GLOW;
      ctx.fillRect(p.x - 3, p.y - 3, TILE + 6, TILE + 6);
      ctx.restore();
      if (t < 1) {
        // Transition: bars slide in (closing) or out (opening).
        const slide = Math.round((st.open ? t : 1 - t) * TILE);
        adapter.drawDoor(ctx, p.x, p.y, TILE, false, 0, now);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#140c22';
        ctx.fillRect(p.x, p.y, TILE, slide);
        ctx.restore();
        if (st.open) adapter.drawDoor(ctx, p.x, p.y, TILE, true, st.warning, now);
      } else {
        adapter.drawDoor(ctx, p.x, p.y, TILE, st.open, st.warning, now);
      }
    });
  }
}

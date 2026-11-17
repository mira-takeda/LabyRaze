// Event bus to particle emitters (task 26.2). Read-only: handlers receive frozen events and the
// last drawn state snapshot for positions; they never write to the Simulation.

import type { GameEvent } from '../core/events';
import type { GameState } from '../core/types';
import { TILE, cellToPx } from './layout';
import { ALLY_COLOURS } from './placeholders';
import { ALLY_TRAIL_MAX, Emitters, hex } from './particles';

function centre(x: number, y: number): { x: number; y: number } {
  const p = cellToPx(x, y);
  return { x: p.x + TILE / 2, y: p.y + TILE / 2 };
}

export class ParticleBindings {
  constructor(
    private readonly emit: Emitters,
    /** Read-only access to the latest state, for positions of events without a Cell. */
    private readonly state: () => GameState | null,
  ) {}

  handle(events: ReadonlyArray<GameEvent>): void {
    const s = this.state();
    for (const e of events) {
      switch (e.t) {
        case 'PelletCollected': {
          const c = centre(e.cell.x, e.cell.y);
          if (e.kind === 'power') this.emit.powerBurst(c.x, c.y);
          else this.emit.pelletBurst(c.x, c.y);
          break;
        }
        case 'WispCollected': {
          const c = centre(e.cell.x, e.cell.y);
          this.emit.wispSparkles(c.x, c.y);
          break;
        }
        case 'KeyCollected': {
          const c = centre(e.cell.x, e.cell.y);
          this.emit.keyEffect(c.x, c.y);
          break;
        }
        case 'CaptiveReleased': {
          if (!s) break;
          const c = centre(s.maze.cage.entrance.x, s.maze.cage.entrance.y);
          this.emit.rescueEffect(c.x, c.y, hex(ALLY_COLOURS[e.index] ?? '#ffffff'));
          break;
        }
        case 'RoleReversed': {
          if (!s) break;
          const who = e.to === 'player' ? s.player.cell : s.hunter.cell;
          const c = centre(who.x, who.y);
          this.emit.roleReversal(c.x, c.y);
          break;
        }
        case 'PlayerEaten': {
          const c = centre(e.cell.x, e.cell.y);
          this.emit.eatenExplosion(c.x, c.y, hex('#f6f2ff'));
          this.emit.playerDeath(c.x, c.y);
          break;
        }
        case 'HunterEaten': {
          const c = centre(e.cell.x, e.cell.y);
          this.emit.eatenExplosion(c.x, c.y, hex('#ffd400'));
          break;
        }
        case 'WallsDestroyed':
          this.emit.bombDebris(e.cells.map((cell) => centre(cell.x, cell.y)));
          break;
        default:
          break;
      }
    }
  }

  /** Continuous emitters driven by the drawn state each frame (trails). Rate-limited per frame. */
  frame(s: GameState, frameIndex: number, trailEvery: number): void {
    if (trailEvery <= 0 || frameIndex % trailEvery !== 0) return;
    // Invulnerability sparkle ring: 4 cyan sparks around the Player every 8th frame.
    if (s.player.invulnerable > 0 && frameIndex % 8 === 0) {
      const c = centre(s.player.cell.x, s.player.cell.y);
      this.emit.invulnSparkles(c.x, c.y);
    }
    if (s.player.speed > 0) {
      const c = centre(s.player.cell.x, s.player.cell.y);
      this.emit.speedTrail(c.x, c.y, hex('#c9bfe6'));
    }
    if (s.hunter.speed > 0 && s.hunter.respawnIn <= 0) {
      const c = centre(s.hunter.cell.x, s.hunter.cell.y);
      this.emit.speedTrail(c.x, c.y, hex('#ffe14a'));
    }
    // Ally trails: at most ALLY_TRAIL_MAX particles per ally per second at 60 fps.
    const allyEvery = Math.max(Math.ceil(60 / ALLY_TRAIL_MAX), trailEvery);
    if (frameIndex % allyEvery !== 0) return;
    s.ghostHunt.allies.forEach((a, i) => {
      if (a.mode === 'hunting' && a.spawnIn === 0) {
        const c = centre(a.cell.x, a.cell.y);
        this.emit.allyTrail(c.x, c.y, hex(ALLY_COLOURS[i] ?? '#ffffff'));
      }
    });
  }
}

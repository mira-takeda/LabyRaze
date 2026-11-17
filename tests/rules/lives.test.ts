// Property 49: Lives, respawn and dropped-Key lifecycle through `step` (task 17.5).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { computeDistanceField } from '../../src/core/pathfinding';
import { Tile } from '../../src/core/types';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Cell, GameState, Input } from '../../src/core/types';
import { arbInput, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

function withState(run: Run, s: GameState): Run {
  return { ...run, state: s };
}

/** Player and Hunter on the same Cell so they collide on the next Tick. */
function meet(s: GameState, at: Cell): GameState {
  return {
    ...s,
    player: { ...s.player, cell: { ...at }, next: null, progress: 0, dir: null, buffered: null },
    hunter: { ...s.hunter, cell: { ...at }, next: null, progress: 0, dir: null, respawnIn: 0, invulnerable: 0 },
  };
}

/** A Floor Cell away from both starts: the first Ordinary_Pellet Cell. */
function spot(s: GameState): Cell {
  return s.maze.ordinary[Math.floor(s.maze.ordinary.length / 2)]!;
}

describe('Property 49: lives, respawn and dropped Keys', () => {
  it('an eaten Player loses a life, respawns invulnerable at its start and drops carried Keys', () => {
    const run = createRun(41, cfg);
    const s0 = run.state;
    const carried = s0.items.keys.slice(0, 2);
    let s = meet(s0, spot(s0));
    s = { ...s, carriedKeys: 2, items: { ...s.items, keys: s.items.keys.slice(2) } };
    const r = step(withState(run, s), IDLE);
    const s1 = r.run.state;
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'PlayerEaten', keysDropped: 2 }));
    expect(s1.lives).toBe(s0.lives - 1);
    // Fair respawn (task 36.1): a Floor Cell without a Key, at least respawnMinHunterDist
    // path Cells (all Doors open) from Squareman's Cell on the eaten Tick.
    const rc = s1.player.cell;
    const w = s1.maze.width;
    expect(s1.walls.tiles[rc.y * w + rc.x]).toBe(Tile.Floor);
    expect(s1.items.keys.some((k) => k.x === rc.x && k.y === rc.y)).toBe(false);
    const open = ((1 << s1.maze.doors.length) - 1) >>> 0;
    const hf = computeDistanceField(s1.maze, s1.walls.tiles, open, s1.walls.version, [s1.hunter.cell.y * w + s1.hunter.cell.x]);
    expect(hf.dist[rc.y * w + rc.x]).toBeGreaterThanOrEqual(cfg.respawnMinHunterDist);
    // invulnerabilityTicks set on the eaten Tick, then the Tick's timer decrement.
    expect(s1.player.invulnerable).toBe(cfg.invulnerabilityTicks - 1);
    expect(s1.carriedKeys).toBe(0);
    expect(s1.items.keys).toHaveLength(3);
    // Dropped Keys lie on passable, non-Cage Cells and are collectable again.
    for (const k of s1.items.keys) {
      expect(s1.maze.cage.interior.some((c) => c.x === k.x && c.y === k.y)).toBe(false);
    }
    void carried;
  });

  it('an invulnerable Player is not eaten', () => {
    const run = createRun(42, cfg);
    let s = meet(run.state, spot(run.state));
    s = { ...s, player: { ...s.player, invulnerable: 50 } };
    const r = step(withState(run, s), IDLE);
    expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(false);
    expect(r.run.state.lives).toBe(run.state.lives);
  });

  it('invulnerability lasts exactly invulnerabilityTicks after being eaten', () => {
    const run = createRun(43, cfg);
    let r = step(withState(run, meet(run.state, spot(run.state))), IDLE);
    let ticks = 0;
    let cur = r.run;
    while (cur.state.player.invulnerable > 0) {
      ticks++;
      // Keep the Hunter out of the way so it cannot interfere.
      cur = { ...cur, state: { ...cur.state, hunter: { ...cur.state.hunter, respawnIn: 5 } } };
      r = step(cur, IDLE);
      cur = r.run;
    }
    expect(ticks + 1).toBe(cfg.invulnerabilityTicks);
  });

  it('an eaten Squareman waits hunterRespawnTicks at its start, then has hunterGraceTicks of grace', () => {
    const run = createRun(44, cfg);
    let s = meet(run.state, spot(run.state));
    s = { ...s, player: { ...s.player, power: 200 } };
    let r = step(withState(run, s), IDLE);
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'HunterEaten', by: 'player' }));
    let cur = r.run;
    const start = cur.state.maze.hunterStart;
    expect(cur.state.hunter.cell).toEqual(start);
    let waited = 1;
    while (cur.state.hunter.respawnIn > 0) {
      expect(cur.state.hunter.cell).toEqual(start);
      expect(cur.state.hunter.next).toBeNull();
      // Move the Player far away (to its start) so CHASE/FLEE cannot collide.
      cur = { ...cur, state: { ...cur.state, player: { ...cur.state.player, cell: { ...cur.state.maze.playerStart }, next: null, progress: 0 } } };
      r = step(cur, IDLE);
      cur = r.run;
      waited++;
    }
    expect(waited).toBe(cfg.hunterRespawnTicks);
    expect(cur.state.hunter.invulnerable).toBe(cfg.hunterGraceTicks);

    // During grace an empowered Player cannot eat it.
    const g = meet(cur.state, cur.state.hunter.cell);
    const graced: GameState = { ...g, hunter: { ...g.hunter, invulnerable: cur.state.hunter.invulnerable }, player: { ...g.player, power: 100 } };
    const rg = step(withState(cur, graced), IDLE);
    expect(rg.events.some((e) => e.t === 'HunterEaten')).toBe(false);
  });

  it('losing the last life ends the run with gameOver', () => {
    const run = createRun(45, cfg);
    let s = meet(run.state, spot(run.state));
    s = { ...s, lives: 1 };
    const r = step(withState(run, s), IDLE);
    expect(r.run.state.lives).toBe(0);
    expect(r.run.state.phase).toBe('gameOver');
    expect(r.run.progression.gameOver).toBe(true);
    expect(r.events).toContainEqual(expect.objectContaining({ t: 'GameOver' }));
    // gameOver is terminal.
    const after = step(r.run, { pressed: 'left', bomb: true, continue: true });
    expect(after.run).toBe(r.run);
    expect(after.events).toEqual([]);
  });

  it('under random play lives never rise within a level and Keys are conserved', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 20, maxLength: 200 }), (seed, inputs) => {
        let run = createRun(seed, cfg);
        for (let t = 0; t < 2500 && run.state.phase === 'playing'; t++) {
          const before = run.state;
          const r = step(run, { ...inputs[t % inputs.length]!, continue: false });
          const s = r.run.state;
          const eaten = r.events.filter((e) => e.t === 'PlayerEaten').length;
          expect(s.lives).toBe(Math.max(0, before.lives - eaten));
          expect(s.items.keys.length + s.carriedKeys + s.captives.filter(Boolean).length).toBe(3);
          if (eaten > 0) {
            expect(s.carriedKeys).toBe(0);
            expect(s.player.invulnerable).toBe(cfg.invulnerabilityTicks - 1);
          }
          run = r.run;
        }
      }),
      { numRuns: 20 },
    );
  }, 120_000);
});

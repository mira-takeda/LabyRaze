// Property 41: Squareman flees allies and ally catches follow the eaten rule (task 17.15).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createHunterBrain, decideHunter } from '../../src/core/hunter';
import { isPassable } from '../../src/core/grid';
import { UNREACHABLE, computeDistanceField } from '../../src/core/pathfinding';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Cell, GameState, Input } from '../../src/core/types';
import { freeCell, placeGhostHunt, playerArriving, withState } from './stepHelpers';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

function hunting(seed: number): Run {
  const run0 = createRun(seed, cfg);
  const at = freeCell(run0.state);
  let s = playerArriving(placeGhostHunt(run0.state, at), at);
  s = { ...s, player: { ...s.player, invulnerable: 1e9 }, lives: 1_000_000 };
  return step(withState(run0, s), IDLE).run;
}

/** All three allies spawned and hunting at `cell`. */
function alliesAt(s: GameState, cell: Cell): GameState {
  const allies = s.ghostHunt.allies.map((a) => ({ ...a, cell: { ...cell }, next: null, progress: 0, dir: null, spawnIn: 0, mode: 'hunting' as const }));
  return { ...s, ghostHunt: { ...s.ghostHunt, allies: allies as GameState['ghostHunt']['allies'] } };
}

describe('Property 41: fleeing and ally catches', () => {
  it('an ally sharing the Cell of an alive Squareman eats it: score, respawn, no harm to the Player', () => {
    for (const seed of [91, 92, 93]) {
      const run = hunting(seed);
      const h = run.state.hunter;
      let s = alliesAt(run.state, h.cell);
      s = { ...s, hunter: { ...h, next: null, progress: 0, respawnIn: 0, invulnerable: 0 } };
      const r = step(withState(run, s), IDLE);
      const eaten = r.events.filter((e) => e.t === 'HunterEaten');
      expect(eaten).toHaveLength(1);
      expect(eaten[0]).toMatchObject({ by: 'ally' });
      expect(r.run.state.score - s.score).toBeGreaterThanOrEqual(cfg.scoreWeights.hunterEaten);
      expect(r.run.state.hunter.cell).toEqual(s.maze.hunterStart);
      expect(r.run.state.hunter.respawnIn).toBe(cfg.hunterRespawnTicks - 1);
      expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(false);
      expect(r.run.state.captives).toEqual(s.captives);
    }
  });

  it('a Squareman in grace is not eaten by an ally', () => {
    const run = hunting(94);
    const h = run.state.hunter;
    let s = alliesAt(run.state, h.cell);
    s = { ...s, hunter: { ...h, next: null, progress: 0, respawnIn: 0, invulnerable: 20 } };
    const r = step(withState(run, s), IDLE);
    expect(r.events.some((e) => e.t === 'HunterEaten')).toBe(false);
  });

  it('allies never eat the Player', () => {
    const run = hunting(95);
    let s = alliesAt(run.state, run.state.player.cell);
    s = { ...s, player: { ...s.player, invulnerable: 0, next: null, progress: 0, dir: null } };
    // Hunter far away and inactive so only allies are near the Player.
    s = { ...s, hunter: { ...s.hunter, respawnIn: 100 } };
    const r = step(withState(run, s), IDLE);
    expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(false);
    expect(r.run.state.lives).toBe(s.lives);
  });

  it('a fleeing Squareman never steps closer to the nearest ally when a non-closer neighbour exists', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 0, max: 300 }), (seed, warm) => {
        let run = hunting(seed);
        for (let t = 0; t < warm && run.state.ghostHunt.ticksLeft > 0; t++) run = step(run, IDLE).run;
        const s = run.state;
        if (s.ghostHunt.ticksLeft === 0 || s.hunter.respawnIn > 0 || s.hunter.next !== null) return;
        const sources = s.ghostHunt.allies.filter((a) => a.mode === 'hunting' && a.spawnIn === 0).map((a) => a.cell);
        if (sources.length === 0 || s.player.power > 0) return;
        const d = decideHunter(s, createHunterBrain(seed, 1), cfg);
        if (d.mode !== 'FLEE' || d.dir === null) return;
        const w = s.maze.width;
        const mask = s.derived.doorMask;
        const f = computeDistanceField(s.maze, s.walls.tiles, mask, s.walls.version, sources.map((c) => c.y * w + c.x));
        const here = f.dist[s.hunter.cell.y * w + s.hunter.cell.x]!;
        const step1 = (dir: string): Cell => ({
          x: s.hunter.cell.x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0),
          y: s.hunter.cell.y + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0),
        });
        const dist = (c: Cell): number => {
          const v = f.dist[c.y * w + c.x]!;
          return v === UNREACHABLE ? Number.MAX_SAFE_INTEGER : v;
        };
        const options = (['up', 'right', 'down', 'left'] as const)
          .map(step1)
          .filter((c) => isPassable(s.walls.tiles, w, s.maze.height, s.maze.doors, mask, c.x, c.y));
        const nonCloser = options.some((c) => dist(c) >= here);
        if (nonCloser) expect(dist(step1(d.dir))).toBeGreaterThanOrEqual(here);
      }),
      { numRuns: 60 },
    );
  }, 120_000);
});

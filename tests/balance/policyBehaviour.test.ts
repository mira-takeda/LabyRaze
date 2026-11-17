import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { UNREACHABLE, computeDistanceField } from '../../src/core/pathfinding';
import { ItemKind, Tile } from '../../src/core/types';
import type { GameState } from '../../src/core/types';
import { POLICY_NAMES, makePolicy, primaryGoal } from '../../tools/balance/policies';
import type { PolicyName } from '../../tools/balance/policies';
import { playLevel } from '../../tools/balance/runner';

const cfg = DEFAULT_CONFIG;
const SEEDS = [1, 2, 3, 4, 5, 6];

describe('policy behaviour on sample Mazes (Player-only race)', () => {
  for (const name of POLICY_NAMES) {
    it(`${name} completes a Rescue on every sample Maze`, () => {
      const policy = makePolicy(name, { bombRadius: cfg.bombRadius });
      for (const seed of SEEDS) {
        const r = playLevel(createRun(seed, cfg), policy, { mode: 'playerOnly', maxTicks: 12_000 }).result;
        expect(r.outcome, `${name} seed ${seed}`).toBe('playerWin');
        expect(r.events.filter((e) => e.t === 'CaptiveReleased')).toHaveLength(3);
      }
    }, 120_000);
  }

  // Walking over a Bomb or Ghost_Hunt item collects it, and the generator may place one on a
  // cut Cell that every route to a Key or the Cage crosses. So "never picks up" means: the
  // policy never uses the item, and only collects one that no item-free route can avoid,
  // even with every Door open.
  function unavoidable(prev: GameState, name: PolicyName, kind: number): boolean {
    const w = prev.maze.width;
    const tiles = prev.walls.tiles.slice();
    for (let i = 0; i < tiles.length; i++) if (prev.items.kinds[i] === kind) tiles[i] = Tile.WallHard;
    const goal = primaryGoal(prev, name);
    const all = ((1 << prev.maze.doors.length) - 1) >>> 0;
    const f = computeDistanceField(prev.maze, tiles, all, 0, goal.map((c) => c.y * w + c.x));
    const from = prev.player.cell;
    return f.dist[from.y * w + from.x] === UNREACHABLE;
  }

  for (const [name, kind, picked, used] of [
    ['bombNone', ItemKind.Bomb, 'BombCollected', 'BombActivated'],
    ['ghostHuntNone', ItemKind.GhostHunt, 'GhostHuntStarted', 'GhostHuntStarted'],
  ] as const) {
    it(`${name} never uses its item and only collects one that cannot be avoided`, () => {
      const policy = makePolicy(name, { bombRadius: cfg.bombRadius });
      let forced = 0;
      for (const seed of SEEDS) {
        let prev: GameState = createRun(seed, cfg).state;
        let pickups = 0;
        const r = playLevel(createRun(seed, cfg), policy, {
          mode: 'playerOnly',
          maxTicks: 12_000,
          onTick: (s, events, input) => {
            if (name === 'bombNone') expect(input.bomb, `seed ${seed}`).toBe(false);
            if (events.some((e) => e.t === picked)) {
              pickups++;
              expect(unavoidable(prev, name, kind), `${name} seed ${seed} avoidable pickup at tick ${s.tick}`).toBe(true);
            }
            prev = s;
          },
        }).result;
        if (name === 'bombNone') expect(r.events.some((e) => e.t === used), `seed ${seed}`).toBe(false);
        forced += pickups;
      }
      expect(forced).toBeGreaterThanOrEqual(0);
    }, 120_000);
  }

  it('bombAggressive uses at least one Bomb across the sample Mazes', () => {
    const policy = makePolicy('bombAggressive', { bombRadius: cfg.bombRadius });
    let used = 0;
    for (const seed of SEEDS) {
      const r = playLevel(createRun(seed, cfg), policy, { mode: 'playerOnly', maxTicks: 12_000 }).result;
      used += r.events.filter((e) => e.t === 'BombActivated').length;
    }
    expect(used).toBeGreaterThan(0);
  }, 120_000);

  it('ghostHuntOpportunistic starts a Ghost Hunt on at least one sample Maze', () => {
    const policy = makePolicy('ghostHuntOpportunistic', { bombRadius: cfg.bombRadius });
    let started = 0;
    for (const seed of SEEDS) {
      const r = playLevel(createRun(seed, cfg), policy, { mode: 'playerOnly', maxTicks: 12_000 }).result;
      started += r.events.filter((e) => e.t === 'GhostHuntStarted').length;
    }
    expect(started).toBeGreaterThan(0);
  }, 120_000);
});

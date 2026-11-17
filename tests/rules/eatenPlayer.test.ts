import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { computeDistanceField } from '../../src/core/pathfinding';
import { applyPlayerEaten, fairRespawnCell, resolveCollisions, respawnSafeDistance } from '../../src/core/rules';
import { Tile } from '../../src/core/types';
import type { Cell, GameState, Maze } from '../../src/core/types';
import { allFixtureMazes, buildState, makeCharacter } from '../helpers/fixtures';

// Feature: kirobit-halloween-maze, Property 21: Eaten Player consequences
// **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
// Hand-built fixture mazes at this wave; the generated-maze variant runs in task 17.5.

const cfg = DEFAULT_CONFIG;
const mazes = allFixtureMazes();
const idx = (m: Maze, c: Cell): number => c.y * m.width + c.x;

function allOpen(m: Maze): number {
  return m.doors.length >= 31 ? 0xffffffff : ((1 << m.doors.length) - 1) >>> 0;
}

function dists(s: GameState, from: Cell): Int32Array {
  const m = s.maze;
  return computeDistanceField(m, s.walls.tiles, allOpen(m), s.walls.version, [idx(m, from)]).dist;
}

const scenario = fc
  .record({
    mazeIndex: fc.nat(mazes.length - 1),
    deathPick: fc.nat(10_000),
    carried: fc.integer({ min: 0, max: 3 }),
    keyPicks: fc.array(fc.nat(10_000), { minLength: 0, maxLength: 3 }),
    captives: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
    bombs: fc.integer({ min: 0, max: 5 }),
    comboCount: fc.integer({ min: 1, max: 8 }),
    comboTicksLeft: fc.integer({ min: 0, max: 100 }),
    lives: fc.integer({ min: 1, max: 5 }),
    score: fc.nat(100_000),
  })
  .map((r) => {
    const maze = mazes[r.mazeIndex]!;
    const cage = new Set(maze.cage.interior.map((c) => idx(maze, c)));
    cage.add(idx(maze, maze.cage.entrance));
    const floors: Cell[] = [];
    for (let i = 0; i < maze.tiles.length; i++) {
      if (maze.tiles[i] === Tile.Floor && !cage.has(i)) floors.push({ x: i % maze.width, y: Math.floor(i / maze.width) });
    }
    const death = floors[r.deathPick % floors.length]!;
    const floorKeys: Cell[] = [];
    for (const p of r.keyPicks) {
      const c = floors[p % floors.length]!;
      if (!floorKeys.some((k) => k.x === c.x && k.y === c.y)) floorKeys.push(c);
    }
    const base = buildState(maze);
    const state: GameState = {
      ...base,
      player: makeCharacter('player', death),
      items: { ...base.items, keys: floorKeys },
      carriedKeys: r.carried,
      captives: r.captives,
      bombs: r.bombs,
      comboCount: r.comboCount,
      comboTicksLeft: r.comboTicksLeft,
      lives: r.lives,
      score: r.score,
    };
    return { state, death };
  });

describe('Property 21: Eaten Player consequences', () => {
  it('Feature: kirobit-halloween-maze, Property 21: Eaten Player consequences', () => {
    fc.assert(
      fc.property(scenario, ({ state, death }) => {
        const m = state.maze;
        const r = applyPlayerEaten(state, cfg);
        const after = r.state;

        // Key conservation (carried + floor + delivered)
        const delivered = (s: GameState): number => s.captives.filter(Boolean).length;
        const total = (s: GameState): number => s.carriedKeys + s.items.keys.length + delivered(s);
        expect(total(after)).toBe(total(state));

        // Dropped keys: distinct, floor, outside cage and entrance, reachable, nearest-first
        const drops = after.items.keys.slice(state.items.keys.length);
        expect(after.items.keys.slice(0, state.items.keys.length)).toEqual(state.items.keys);
        expect(drops.length).toBe(state.carriedKeys - after.carriedKeys);
        const all = after.items.keys.map((k) => idx(m, k));
        expect(new Set(all).size).toBe(all.length);
        const cage = new Set(m.cage.interior.map((c) => idx(m, c)));
        cage.add(idx(m, m.cage.entrance));
        const fromStart = dists(state, m.playerStart);
        const fromDeath = dists(state, death);
        for (const d of drops) {
          expect(state.walls.tiles[idx(m, d)]).toBe(Tile.Floor);
          expect(cage.has(idx(m, d))).toBe(false);
          expect(fromStart[idx(m, d)]).toBeGreaterThanOrEqual(0);
        }
        const dd = drops.map((d) => fromDeath[idx(m, d)]!);
        for (let i = 1; i < dd.length; i++) expect(dd[i]!).toBeGreaterThanOrEqual(dd[i - 1]!);
        const taken = new Set(all);
        const eligible: number[] = [];
        for (let i = 0; i < m.tiles.length; i++) {
          if (state.walls.tiles[i] === Tile.Floor && !cage.has(i) && fromDeath[i]! >= 0 && !taken.has(i)) eligible.push(i);
        }
        if (dd.length > 0) {
          const far = dd[dd.length - 1]!;
          for (const i of eligible) expect(fromDeath[i]!).toBeGreaterThanOrEqual(far);
        }
        // All carried keys are dropped when enough eligible cells exist (fixtures have plenty)
        expect(after.carriedKeys).toBe(0);

        // Fair respawn (task 36.1): a Floor Cell reachable from the start, outside the Cage,
        // holding no Key, chosen by the fair-respawn rule; with invulnerability.
        const rc = after.player.cell;
        expect(state.walls.tiles[idx(m, rc)]).toBe(Tile.Floor);
        expect(cage.has(idx(m, rc))).toBe(false);
        expect(fromStart[idx(m, rc)]).toBeGreaterThanOrEqual(0);
        expect(after.items.keys.some((k) => k.x === rc.x && k.y === rc.y)).toBe(false);
        expect(rc).toEqual(fairRespawnCell(state, after.items.keys, cfg.respawnMinHunterDist, respawnSafeDistance(state.levelNumber, cfg)));
        expect(after.player.invulnerable).toBe(cfg.invulnerabilityTicks);

        // Exactly one life lost; game over exactly at 0
        expect(after.lives).toBe(state.lives - 1);
        if (after.lives === 0) {
          expect(after.phase).toBe('gameOver');
          expect(r.events.some((e) => e.t === 'GameOver')).toBe(true);
        } else {
          expect(after.phase).toBe('playing');
          expect(r.events.some((e) => e.t === 'GameOver')).toBe(false);
        }

        // Captives, bombs unchanged; combo reset
        expect(after.captives).toEqual(state.captives);
        expect(after.bombs).toBe(state.bombs);
        expect(after.comboCount).toBe(1);
        expect(after.comboTicksLeft).toBe(0);
      }),
      { numRuns: 200 },
    );
  });

  it('resolveCollisions applies the same consequences when Squareman eats the Player', () => {
    const state0 = buildState(mazes[1]!);
    const cell = { x: 3, y: 3 };
    const state: GameState = {
      ...state0,
      player: makeCharacter('player', cell),
      hunter: makeCharacter('hunter', cell),
      carriedKeys: 2,
      lives: 1,
    };
    const r = resolveCollisions(state, null, cfg);
    expect(r.state.lives).toBe(0);
    expect(r.state.phase).toBe('gameOver');
    expect(r.state.player.cell).toEqual(fairRespawnCell(state, r.state.items.keys, cfg.respawnMinHunterDist, respawnSafeDistance(state.levelNumber, cfg)));
    expect(r.state.carriedKeys + r.state.items.keys.length).toBe(2 + state.items.keys.length);
  });
});

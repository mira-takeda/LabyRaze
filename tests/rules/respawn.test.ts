// Task 36.1: fair respawn and anti-spawn-kill. Property 49 (lives, respawn, dropped Keys).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG, validateConfig } from '../../src/core/config';
import { computeDistanceField } from '../../src/core/pathfinding';
import { applyPlayerEaten, fairRespawnCell, respawnSafeDistance } from '../../src/core/rules';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { COLLECT_PLAYER, COLLECTOR_MASK, Tile } from '../../src/core/types';
import type { Cell, GameState, Input, ItemKindCode } from '../../src/core/types';
import { arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

function allOpen(s: GameState): number {
  const n = s.maze.doors.length;
  return n >= 31 ? 0xffffffff : ((1 << n) - 1) >>> 0;
}

function field(s: GameState, from: Cell): Int32Array {
  const w = s.maze.width;
  return computeDistanceField(s.maze, s.walls.tiles, allOpen(s), s.walls.version, [from.y * w + from.x]).dist;
}

function floors(s: GameState): Cell[] {
  const { width, height } = s.maze;
  const out: Cell[] = [];
  for (let i = 0; i < width * height; i++) {
    if (s.walls.tiles[i] === Tile.Floor) out.push({ x: i % width, y: Math.floor(i / width) });
  }
  return out;
}

/** State where the Hunter stands on `h` and the Player on `p`. */
function place(s: GameState, p: Cell, h: Cell): GameState {
  return {
    ...s,
    lives: 1000,
    player: { ...s.player, cell: { ...p }, next: null, progress: 0, dir: null, buffered: null, invulnerable: 0 },
    hunter: { ...s.hunter, cell: { ...h }, next: null, progress: 0, dir: null, respawnIn: 0, invulnerable: 0 },
  };
}

/** Independent check of the respawn rule for one eaten event. */
function checkRespawn(before: GameState, after: GameState): void {
  const { width } = before.maze;
  const rc = after.player.cell;
  const idx = rc.y * width + rc.x;
  const sf = field(before, before.maze.playerStart);
  const hf = field(before, before.hunter.cell);
  const keyAt = (c: Cell): boolean => after.items.keys.some((k) => k.x === c.x && k.y === c.y);
  const itemAt = (c: Cell): boolean =>
    (COLLECTOR_MASK[after.items.kinds[c.y * width + c.x] as ItemKindCode] & COLLECT_PLAYER) !== 0;
  const eligible = (c: Cell): boolean =>
    before.walls.tiles[c.y * width + c.x] === Tile.Floor && sf[c.y * width + c.x]! >= 0 && !keyAt(c) && !itemAt(c);

  // Valid Cell: Floor (so no Wall, Cage, gate or Door), reachable, no Key.
  expect(before.walls.tiles[idx]).toBe(Tile.Floor);
  expect(sf[idx]).toBeGreaterThanOrEqual(0);
  expect(keyAt(rc)).toBe(false);
  expect(itemAt(rc)).toBe(false);
  expect(after.player.invulnerable).toBe(cfg.invulnerabilityTicks);

  const min = cfg.respawnMinHunterDist;
  const farExists = floors(before).some((c) => eligible(c) && hf[c.y * width + c.x]! >= min);
  if (farExists) expect(hf[idx]).toBeGreaterThanOrEqual(min);
  // Otherwise it maximises the distance among eligible Cells.
  else {
    const best = Math.max(...floors(before).filter(eligible).map((c) => hf[c.y * width + c.x]!));
    expect(hf[idx]).toBe(best);
  }
  // Second playtest: when a Cell beyond Squareman's invulnerability reach with two or more exits
  // exists, the respawn uses one, so Squareman cannot arrive before the protection ends.
  const safeD = respawnSafeDistance(before.levelNumber, cfg);
  const h = before.maze.height;
  const exits = (c: Cell): number =>
    [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => {
      const x = c.x + dx!;
      const y = c.y + dy!;
      if (x < 0 || y < 0 || x >= width || y >= h) return false;
      const tile = before.walls.tiles[y * width + x];
      return tile === Tile.Floor || tile === Tile.Door;
    }).length;
  const safeExists = floors(before).some((c) => eligible(c) && hf[c.y * width + c.x]! >= safeD && exits(c) >= 2);
  if (safeExists) {
    expect(hf[idx]).toBeGreaterThanOrEqual(safeD);
    expect(exits(rc)).toBeGreaterThanOrEqual(2);
  }
}

describe('config', () => {
  it('has respawnMinHunterDist 8, invulnerabilityTicks 120 and validates >= 0', () => {
    expect(cfg.respawnMinHunterDist).toBe(8);
    expect(cfg.invulnerabilityTicks).toBe(120);
    expect(validateConfig({ ...cfg, respawnMinHunterDist: -1 })).toContain('respawnMinHunterDist must be >= 0');
    expect(validateConfig({ ...cfg, respawnMinHunterDist: 0 })).toEqual([]);
  });
});

describe('fair respawn', () => {
  it('Property 49: respawn Cell is valid and far from Squareman whenever such a Cell exists', () => {
    // Feature: kirobit-halloween-maze, Property 49: Lives, respawn and dropped-Key lifecycle
    // **Validates: Requirements 11.1, 11.2, 11.3, 11.8, 31.6**
    fc.assert(
      fc.property(arbSeed, fc.nat(), fc.nat(), fc.nat(), (seed, a, b, k) => {
        const s0 = createRun(seed, cfg).state;
        const sf = field(s0, s0.maze.playerStart);
        const fl = floors(s0).filter((c) => sf[c.y * s0.maze.width + c.x]! >= 0);
        const death = fl[a % fl.length]!;
        // Hunter either camps on the death Cell or sits on a random Floor Cell / the start.
        const h = k % 3 === 0 ? death : k % 3 === 1 ? s0.maze.playerStart : fl[b % fl.length]!;
        const before = { ...place(s0, death, h), carriedKeys: k % 2 };
        const r = applyPlayerEaten(before, cfg);
        checkRespawn(before, r.state);
        // Deterministic: the same input gives the same Cell.
        expect(applyPlayerEaten(before, cfg).state.player.cell).toEqual(r.state.player.cell);
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  it('respawnSafeDistance covers Squareman travel during invulnerability and grows with Level_Speed', () => {
    expect(respawnSafeDistance(1, cfg)).toBe(Math.ceil((cfg.invulnerabilityTicks * cfg.baseUnitsPerTick) / 1000));
    expect(respawnSafeDistance(1, cfg)).toBeGreaterThanOrEqual(cfg.respawnMinHunterDist);
    expect(respawnSafeDistance(30, cfg)).toBeGreaterThan(respawnSafeDistance(1, cfg));
    expect(respawnSafeDistance(1, { ...cfg, invulnerabilityTicks: 1 })).toBe(cfg.respawnMinHunterDist);
  });

  it('respawns at (or next to) playerStart when Squareman is beyond its invulnerability reach', () => {
    // Seed 7 starts in a one-exit corner, which counts as a dead end, so the respawn is the
    // adjacent Cell with two exits, still beyond Squareman's reach.
    const s0 = createRun(7, cfg).state;
    const sf = field(s0, s0.maze.playerStart);
    const w = s0.maze.width;
    const safeD = respawnSafeDistance(s0.levelNumber, cfg);
    const far = floors(s0).find((c) => sf[c.y * w + c.x]! >= safeD + 1)!;
    expect(far).toBeDefined();
    const r = applyPlayerEaten(place(s0, far, far), cfg);
    const rc = r.state.player.cell;
    expect(sf[rc.y * w + rc.x]).toBeLessThanOrEqual(1);
    expect(field(s0, far)[rc.y * w + rc.x]).toBeGreaterThanOrEqual(safeD);
  });

  it('falls back to playerStart when no Cell is eligible (documented degenerate case)', () => {
    const s0 = createRun(11, cfg).state;
    expect(fairRespawnCell(s0, floors(s0), cfg.respawnMinHunterDist)).toEqual(s0.maze.playerStart);
  });

  it('moves away from a Squareman camping on the start Cell', () => {
    const s0 = createRun(8, cfg).state;
    const start = s0.maze.playerStart;
    const r = applyPlayerEaten(place(s0, start, start), cfg);
    const hf = field(s0, start);
    const rc = r.state.player.cell;
    expect(rc).not.toEqual(start);
    expect(hf[rc.y * s0.maze.width + rc.x]).toBeGreaterThanOrEqual(cfg.respawnMinHunterDist);
  });

  it('a camping Squareman cannot chain deaths faster than the invulnerability window', () => {
    const run0 = createRun(9, cfg);
    let run: Run = { ...run0, state: place(run0.state, run0.state.maze.playerStart, run0.state.maze.playerStart) };
    const deaths: number[] = [];
    for (let t = 0; t < cfg.invulnerabilityTicks * 4; t++) {
      // Worst case: Squareman is teleported onto the Player before every Tick.
      const s = run.state;
      run = { ...run, state: { ...s, hunter: { ...s.hunter, cell: { ...s.player.cell }, next: null, progress: 0, respawnIn: 0, invulnerable: 0 } } };
      const r = step(run, IDLE);
      if (r.events.some((e) => e.t === 'PlayerEaten')) deaths.push(t);
      run = r.run;
      if (run.state.phase !== 'playing') break;
    }
    expect(deaths.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < deaths.length; i++) {
      expect(deaths[i]! - deaths[i - 1]!).toBeGreaterThanOrEqual(cfg.invulnerabilityTicks);
    }
  }, 120_000);

  it('no PlayerEaten within invulnerabilityTicks after a respawn', () => {
    const run0 = createRun(10, cfg);
    let run: Run = { ...run0, state: place(run0.state, run0.state.maze.playerStart, run0.state.maze.playerStart) };
    let r = step(run, IDLE);
    expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(true);
    run = r.run;
    for (let t = 1; t < cfg.invulnerabilityTicks; t++) {
      const s = run.state;
      run = { ...run, state: { ...s, hunter: { ...s.hunter, cell: { ...s.player.cell }, next: null, progress: 0, respawnIn: 0, invulnerable: 0 } } };
      r = step(run, IDLE);
      expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(false);
      run = r.run;
    }
  }, 120_000);
});

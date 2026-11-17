import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import {
  applyHunterEaten,
  applyPlayerEaten,
  detectCollision,
  droppedKeyCells,
  fairRespawnCell,
  respawnSafeDistance,
  resolveCollisions,
} from '../../src/core/rules';
import { Tile } from '../../src/core/types';
import type { Cell, GameState } from '../../src/core/types';
import { cageState, makeCharacter } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const A: Cell = { x: 3, y: 3 };
const B: Cell = { x: 4, y: 3 };

function setup(over: {
  p?: Partial<ReturnType<typeof makeCharacter>>;
  h?: Partial<ReturnType<typeof makeCharacter>>;
  pc?: Cell;
  hc?: Cell;
  state?: Partial<GameState>;
}): GameState {
  const s = cageState();
  return {
    ...s,
    player: makeCharacter('player', over.pc ?? A, over.p),
    hunter: makeCharacter('hunter', over.hc ?? A, over.h),
    ...over.state,
  };
}

const key = (c: Cell): string => `${c.x},${c.y}`;

describe('collision detection', () => {
  it('detects same-cell and swap, not adjacency', () => {
    expect(detectCollision(null, A, A)).toBe('sameCell');
    expect(detectCollision({ player: A, hunter: B }, B, A)).toBe('swap');
    expect(detectCollision(null, A, B)).toBeNull();
    expect(detectCollision({ player: A, hunter: B }, A, B)).toBeNull();
  });
  it('a swap eats the player through resolveCollisions', () => {
    const s = setup({ pc: B, hc: A });
    const r = resolveCollisions(s, { player: A, hunter: B }, cfg);
    expect(r.state.lives).toBe(cfg.livesInitial - 1);
  });
});

describe('eat rules', () => {
  it('hunter eats the player when nobody holds power', () => {
    const r = resolveCollisions(setup({}), null, cfg);
    expect(r.state.lives).toBe(cfg.livesInitial - 1);
    expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(true);
    // Fair respawn (task 36.1): Squareman sits near the start in this small fixture.
    expect(r.state.player.cell).toEqual(fairRespawnCell(setup({}), r.state.items.keys, cfg.respawnMinHunterDist, respawnSafeDistance(setup({}).levelNumber, cfg)));
    expect(r.state.walls.tiles[r.state.player.cell.y * r.state.maze.width + r.state.player.cell.x]).toBe(Tile.Floor);
    expect(r.state.player.invulnerable).toBe(cfg.invulnerabilityTicks);
  });
  it('hunter eats the player when the hunter holds power', () => {
    const r = resolveCollisions(setup({ h: { power: 100 } }), null, cfg);
    expect(r.state.lives).toBe(cfg.livesInitial - 1);
  });
  it('player eats the hunter while empowered', () => {
    const r = resolveCollisions(setup({ p: { power: 100 } }), null, cfg);
    expect(r.state.lives).toBe(cfg.livesInitial);
    expect(r.state.score).toBe(cfg.scoreWeights.hunterEaten);
    expect(r.state.hunter.respawnIn).toBe(cfg.hunterRespawnTicks);
    expect(r.state.hunter.invulnerable).toBe(cfg.hunterRespawnTicks + cfg.hunterGraceTicks);
    expect(r.state.hunter.cell).toEqual(r.state.maze.hunterStart);
    expect(r.events).toEqual([{ t: 'HunterEaten', cell: A, by: 'player' }]);
  });
  it('invulnerability blocks being eaten', () => {
    const s = setup({ p: { invulnerable: 5 } });
    const r = resolveCollisions(s, null, cfg);
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });
  it('a hunter in grace cannot be eaten and a respawning hunter collides with nothing', () => {
    const grace = resolveCollisions(setup({ p: { power: 9 }, h: { invulnerable: 5 } }), null, cfg);
    expect(grace.events).toEqual([]);
    const away = resolveCollisions(setup({ h: { respawnIn: 10, invulnerable: 40 } }), null, cfg);
    expect(away.events).toEqual([]);
  });
});

describe('player eaten', () => {
  it('conserves keys, drops them on distinct reachable cells outside the cage', () => {
    const base = setup({ state: { carriedKeys: 3, bombs: 2 } });
    const before = base.carriedKeys + base.items.keys.length;
    const r = applyPlayerEaten(base, cfg);
    expect(r.state.carriedKeys).toBe(0);
    expect(r.state.carriedKeys + r.state.items.keys.length).toBe(before);
    const dropped = r.state.items.keys.slice(base.items.keys.length);
    expect(dropped).toHaveLength(3);
    expect(new Set(r.state.items.keys.map(key)).size).toBe(r.state.items.keys.length);
    const w = base.maze.width;
    const inCage = new Set(base.maze.cage.interior.map(key));
    for (const c of dropped) {
      expect(inCage.has(key(c))).toBe(false);
      expect(base.walls.tiles[c.y * w + c.x]).toBe(Tile.Floor);
    }
    expect(r.events).toContainEqual({ t: 'PlayerEaten', cell: A, keysDropped: 3 });
  });
  it('drops onto the nearest cells first', () => {
    const s = setup({ state: { carriedKeys: 2, items: { ...cageState().items, keys: [] } } });
    const cells = droppedKeyCells(s, A, 2);
    expect(cells[0]).toEqual(A);
    expect(Math.abs(cells[1]!.x - A.x) + Math.abs(cells[1]!.y - A.y)).toBe(1);
  });
  it('keeps captives and bombs, resets the combo', () => {
    const base = setup({ state: { captives: [true, false, true], bombs: 2, comboCount: 4, comboTicksLeft: 50, carriedKeys: 1 } });
    const r = applyPlayerEaten(base, cfg);
    expect(r.state.captives).toEqual([true, false, true]);
    expect(r.state.bombs).toBe(2);
    expect(r.state.comboCount).toBe(1);
    expect(r.state.comboTicksLeft).toBe(0);
    expect(r.events).toContainEqual({ t: 'ComboReset', reason: 'playerEaten' });
  });
  it('is game over at 0 lives', () => {
    const r = resolveCollisions(setup({ state: { lives: 1, score: 40 } }), null, cfg);
    expect(r.state.lives).toBe(0);
    expect(r.state.phase).toBe('gameOver');
    expect(r.events).toContainEqual({ t: 'GameOver', score: 40 });
    const more = resolveCollisions(setup({ state: { lives: 2 } }), null, cfg);
    expect(more.state.phase).toBe('playing');
  });
});

describe('ally catches', () => {
  it('trigger hunter respawn and score without touching power or captives', () => {
    const s = setup({ pc: { x: 1, y: 1 }, hc: B, h: { power: 50 }, state: { captives: [true, false, false] } });
    const r = resolveCollisions(s, null, cfg, [
      { allyId: 1, cell: B },
      { allyId: 2, cell: B },
    ]);
    expect(r.state.score).toBe(cfg.scoreWeights.hunterEaten); // only the first catch scores
    expect(r.state.hunter.respawnIn).toBe(cfg.hunterRespawnTicks);
    expect(r.state.hunter.power).toBe(50);
    expect(r.state.captives).toEqual([true, false, false]);
    expect(r.events).toEqual([{ t: 'HunterEaten', cell: B, by: 'ally', allyId: 1 }]);
  });
  it('the shared handler matches for player and ally', () => {
    const s = setup({});
    const a = applyHunterEaten(s, cfg, 'player');
    const b = applyHunterEaten(s, cfg, 'ally', 0);
    expect(b.state).toEqual(a.state);
  });
  it('never eat the player', () => {
    const s = setup({});
    const r = resolveCollisions({ ...s, hunter: makeCharacter('hunter', B) }, null, cfg, []);
    expect(r.state.lives).toBe(cfg.livesInitial);
  });
});

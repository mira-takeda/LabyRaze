import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { dirDx, dirDy, isPassable } from '../../src/core/grid';
import { createHunterBrain, decideHunter } from '../../src/core/hunter';
import { computeDistanceField, lookaheadDoorMask } from '../../src/core/pathfinding';
import { ItemKind } from '../../src/core/types';
import type { Cell, Dir, GameState, Maze } from '../../src/core/types';
import { allFixtureMazes, buildState, makeCharacter, mazeFromAscii } from '../helpers/fixtures';

const RING = [
  'HHHHHHHHH',
  'H..U....H',
  'H.#####.H',
  'H.......H',
  'HHHHHHHHH',
];

function ring(over: Partial<GameState>): GameState {
  const maze = mazeFromAscii(RING);
  const s = buildState(maze, { over });
  return { ...s, items: { ...s.items, kinds: new Uint8Array(s.items.kinds.length) } };
}

function step(c: Cell, d: Dir): Cell {
  return { x: c.x + dirDx(d), y: c.y + dirDy(d) };
}

function dist(s: GameState, from: Cell, to: Cell): number {
  const w = s.maze.width;
  const f = computeDistanceField(s.maze, s.walls.tiles, s.derived.doorMask, s.walls.version, [from.y * w + from.x]);
  return f.dist[to.y * w + to.x]!;
}

function allyHunting(s: GameState, cell: Cell): GameState {
  const [a0, a1, a2] = s.ghostHunt.allies;
  const allies: GameState['ghostHunt']['allies'] = [{ ...a0, mode: 'hunting', cell }, a1, a2];
  return { ...s, ghostHunt: { ...s.ghostHunt, ticksLeft: 100, allies } };
}

describe('hunter FLEE', () => {
  it('moves away from the empowered Player', () => {
    const s = ring({ player: makeCharacter('player', { x: 5, y: 1 }, { power: 100 }) });
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.mode).toBe('FLEE');
    expect(d.dir).toBe('left');
    expect(dist(s, step(s.hunter.cell, d.dir!), s.player.cell)).toBeGreaterThan(dist(s, s.hunter.cell, s.player.cell));
  });

  it('prefers the open branch over a dead end at a junction', () => {
    const maze = mazeFromAscii([
      'HHHHHHHHH',
      'HHHH.HHHH',
      'H...U...H',
      'HHHHHHHHH',
    ]);
    // Player to the right: flee left along the corridor, not into the up dead end.
    const s = buildState(maze, { over: { player: makeCharacter('player', { x: 6, y: 2 }, { power: 50 }) } });
    expect(decideHunter(s, createHunterBrain(1, 1)).dir).toBe('left');
  });

  it('flees from a hunting ally even when the Player has no power', () => {
    const s = allyHunting(ring({ player: makeCharacter('player', { x: 7, y: 3 }) }), { x: 5, y: 1 });
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.mode).toBe('FLEE');
    expect(d.dir).toBe('left');
  });

  it('takes a nearby Power_Pellet when it is closer than the empowered Player', () => {
    const base = ring({ player: makeCharacter('player', { x: 7, y: 3 }, { power: 100 }) });
    const put = (x: number, y: number): GameState => {
      const kinds = new Uint8Array(base.items.kinds.length);
      kinds[y * base.maze.width + x] = ItemKind.Power;
      return { ...base, items: { ...base.items, kinds } };
    };
    expect(decideHunter(put(4, 1), createHunterBrain(1, 1)).dir).toBe('right');
    // Pellet nearer to the Player than to the Hunter is ignored: plain flee.
    expect(decideHunter(put(7, 2), createHunterBrain(1, 1)).dir).toBe('left');
  });
});

describe('hunter CHASE', () => {
  it('reduces the distance to the Player while empowered and in range', () => {
    const s = ring({
      player: makeCharacter('player', { x: 6, y: 1 }),
      hunter: makeCharacter('hunter', { x: 3, y: 1 }, { power: 100 }),
    });
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.mode).toBe('CHASE');
    expect(d.dir).toBe('right');
    expect(dist(s, step(s.hunter.cell, d.dir!), s.player.cell)).toBeLessThan(dist(s, s.hunter.cell, s.player.cell));
  });

  it('does not chase beyond hunterChaseDistance', () => {
    const s = ring({
      player: makeCharacter('player', { x: 1, y: 3 }),
      hunter: makeCharacter('hunter', { x: 7, y: 1 }, { power: 100 }),
    });
    const cfg = { ...DEFAULT_CONFIG, hunterChaseDistance: dist(s, s.hunter.cell, s.player.cell) - 1 };
    expect(decideHunter(s, createHunterBrain(1, 1), cfg).mode).toBe('COLLECT');
  });
});

describe('hunter respawn', () => {
  it('does not move while respawning', () => {
    const s = ring({
      player: makeCharacter('player', { x: 5, y: 1 }, { power: 100 }),
      hunter: makeCharacter('hunter', { x: 3, y: 1 }, { respawnIn: 50 }),
    });
    const d = decideHunter(s, createHunterBrain(1, 1));
    expect(d.dir).toBeNull();
  });
});

function passableCells(maze: Maze): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (isPassable(maze.tiles, maze.width, maze.height, maze.doors, (1 << maze.doors.length) - 1, x, y)) out.push({ x, y });
    }
  }
  return out.length > 0 ? out : [maze.playerStart];
}

describe('hunter determinism and safety', () => {
  it('gives identical decisions for identical inputs', () => {
    const s = ring({ player: makeCharacter('player', { x: 5, y: 1 }, { power: 100 }) });
    const a = decideHunter(s, createHunterBrain(3, 2));
    expect(decideHunter(s, createHunterBrain(3, 2))).toEqual(a);
  });

  it('always chooses a direction that leads to a passable cell', () => {
    const mazes = [mazeFromAscii(RING), ...allFixtureMazes()];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: mazes.length - 1 }),
        fc.nat(),
        fc.nat(),
        fc.constantFrom('none', 'playerPower', 'ally', 'chase'),
        fc.constantFrom<Dir | null>(null, 'up', 'right', 'down', 'left'),
        fc.boolean(),
        (mi, hi, pi, kind, pdir, doorsOpen) => {
          const maze = mazes[mi]!;
          const open = passableCells(maze);
          const hc = open[hi % open.length]!;
          const pc = open[pi % open.length]!;
          let s = buildState(maze, {
            over: {
              hunter: makeCharacter('hunter', hc, { power: kind === 'chase' ? 100 : 0 }),
              player: makeCharacter('player', pc, { power: kind === 'playerPower' ? 100 : 0, dir: pdir }),
            },
          });
          if (!doorsOpen) s = { ...s, derived: { ...s.derived, doorMask: 0 } };
          if (kind === 'ally') s = allyHunting(s, pc);
          const d = decideHunter(s, createHunterBrain(1, 1));
          if (d.dir === null) return true;
          const mask = lookaheadDoorMask(s.derived.doorMask, s.doors, DEFAULT_CONFIG.doorLookaheadTicks);
          const t = step(hc, d.dir);
          const { width: w, height: h } = maze;
          if (isPassable(s.walls.tiles, w, h, maze.doors, mask, t.x, t.y)) return true;
          // Otherwise it must be a wrap step to a passable partner.
          return maze.wrapPairs.some(([a, b]) =>
            [[a, b], [b, a]].some(
              ([from, to]) =>
                from!.x === hc.x && from!.y === hc.y && isPassable(s.walls.tiles, w, h, maze.doors, mask, to!.x, to!.y),
            ),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: kirobit-halloween-maze, Property 14: Hunter flee and chase behavior
// **Validates: Requirements 8.5, 8.6**
describe('Feature: kirobit-halloween-maze, Property 14: Hunter flee and chase behavior', () => {
  const mazes = [mazeFromAscii(RING), ...allFixtureMazes()];
  const INF = Number.POSITIVE_INFINITY;

  function fieldOf(s: GameState, mask: number, cells: Cell[]): Int32Array | number[] {
    const w = s.maze.width;
    return computeDistanceField(s.maze, s.walls.tiles, mask, s.walls.version, cells.map((c) => c.y * w + c.x)).dist;
  }
  function dd(s: GameState, f: ArrayLike<number>, c: Cell): number {
    const v = f[c.y * s.maze.width + c.x]!;
    return v < 0 ? INF : v;
  }
  /** Passable one-step destinations (4-neighbours plus wrap partner). */
  function moves(s: GameState, mask: number, c: Cell): Cell[] {
    const { width: w, height: h, doors, wrapPairs } = s.maze;
    const out: Cell[] = [];
    for (const d of ['up', 'right', 'down', 'left'] as Dir[]) {
      const t = step(c, d);
      if (isPassable(s.walls.tiles, w, h, doors, mask, t.x, t.y)) out.push(t);
    }
    for (const [a, b] of wrapPairs) {
      for (const [from, to] of [[a, b], [b, a]] as const) {
        if (from.x === c.x && from.y === c.y && isPassable(s.walls.tiles, w, h, doors, mask, to.x, to.y)) out.push(to);
      }
    }
    return out;
  }
  function destOf(s: GameState, mask: number, c: Cell, d: Dir): Cell | null {
    const t = step(c, d);
    const { width: w, height: h, doors } = s.maze;
    if (isPassable(s.walls.tiles, w, h, doors, mask, t.x, t.y)) return t;
    return moves(s, mask, c).find((m) => Math.abs(m.x - c.x) > 1 || Math.abs(m.y - c.y) > 1) ?? null;
  }

  const gen = fc.record({
    mi: fc.integer({ min: 0, max: mazes.length - 1 }),
    hi: fc.nat(),
    pi: fc.nat(),
    ai: fc.nat(),
    playerPower: fc.boolean(),
    ally: fc.boolean(),
    hunterPower: fc.boolean(),
    respawn: fc.boolean(),
    pdir: fc.constantFrom<Dir | null>(null, 'up', 'right', 'down', 'left'),
    doorsOpen: fc.boolean(),
    chaseDistance: fc.integer({ min: 0, max: 30 }),
  });

  function build(g: typeof gen extends fc.Arbitrary<infer T> ? T : never) {
    const maze = mazes[g.mi]!;
    const open = passableCells(maze);
    const hc = open[g.hi % open.length]!;
    const pc = open[g.pi % open.length]!;
    let s = buildState(maze, {
      over: {
        hunter: makeCharacter('hunter', hc, { power: g.hunterPower ? 100 : 0, respawnIn: g.respawn ? 20 : 0 }),
        player: makeCharacter('player', pc, { power: g.playerPower ? 100 : 0, dir: g.pdir }),
      },
    });
    s = { ...s, items: { ...s.items, kinds: new Uint8Array(s.items.kinds.length) } }; // no pellets
    if (!g.doorsOpen) s = { ...s, derived: { ...s.derived, doorMask: 0 } };
    if (g.ally) s = allyHunting(s, open[g.ai % open.length]!);
    const cfg = { ...DEFAULT_CONFIG, hunterChaseDistance: g.chaseDistance };
    const mask = lookaheadDoorMask(s.derived.doorMask, s.doors, cfg.doorLookaheadTicks);
    return { s, cfg, mask, hc, pc };
  }

  it('selects FLEE > CHASE > COLLECT and idles while respawning', () => {
    let flee = 0;
    let chase = 0;
    let collect = 0;
    fc.assert(
      fc.property(gen, (g) => {
        const { s, cfg, mask, hc, pc } = build(g);
        const d = decideHunter(s, createHunterBrain(1, 1), cfg);
        if (g.respawn) return d.dir === null;
        const fleeSrc = g.playerPower || g.ally;
        const toPlayer = dist2(s, mask, hc, pc);
        const expected = fleeSrc
          ? 'FLEE'
          : g.hunterPower && toPlayer <= cfg.hunterChaseDistance
            ? 'CHASE'
            : 'COLLECT';
        if (expected === 'FLEE') flee++;
        else if (expected === 'CHASE') chase++;
        else collect++;
        return d.mode === expected;
      }),
      { numRuns: 400 },
    );
    expect(flee).toBeGreaterThan(0);
    expect(chase).toBeGreaterThan(0);
    expect(collect).toBeGreaterThan(0);
  });

  function dist2(s: GameState, mask: number, a: Cell, b: Cell): number {
    return dd(s, fieldOf(s, mask, [a]), b);
  }

  it('FLEE never steps toward the nearest flee source when a non-approaching step exists', () => {
    let checked = 0;
    fc.assert(
      fc.property(gen, (g) => {
        const { s, cfg, mask, hc } = build(g);
        if (g.respawn || !(g.playerPower || g.ally)) return true;
        const d = decideHunter(s, createHunterBrain(1, 1), cfg);
        if (d.dir === null) return true;
        const sources: Cell[] = [];
        if (g.playerPower) sources.push(s.player.cell);
        for (const a of s.ghostHunt.allies) if (a.mode === 'hunting' && a.spawnIn === 0) sources.push(a.cell);
        const sf = fieldOf(s, mask, sources);
        const here = dd(s, sf, hc);
        if (here === INF) return true;
        const chosen = destOf(s, mask, hc, d.dir);
        if (chosen === null) return false;
        checked++;
        const dc = dd(s, sf, chosen);
        if (dc >= here) return true;
        // The step approaches a source. Allowed only if every non-approaching alternative is a
        // dead end (penalised) or a closing Door cell (design: FLEE tie-break and penalties).
        return moves(s, mask, hc)
          .filter((m) => dd(s, sf, m) >= here)
          .every((m) => {
            const exits = moves(s, mask, m).filter((e) => e.x !== hc.x || e.y !== hc.y).length;
            const onDoor = s.maze.doors.some((dr) => dr.cell.x === m.x && dr.cell.y === m.y);
            return exits === 0 || onDoor;
          });
      }),
      { numRuns: 400 },
    );
    expect(checked).toBeGreaterThan(0);
  });

  it('CHASE steps toward the Player or its predicted Cell', () => {
    let checked = 0;
    fc.assert(
      fc.property(gen, (g) => {
        const { s, cfg, mask, hc, pc } = build(g);
        if (g.respawn || g.playerPower || g.ally || !g.hunterPower) return true;
        const hp = dist2(s, mask, hc, pc);
        if (hp > cfg.hunterChaseDistance) return true;
        const d = decideHunter(s, createHunterBrain(1, 1), cfg);
        if (d.mode !== 'CHASE') return false;
        if (hp === 0) return true;
        if (d.dir === null) return false;
        const chosen = destOf(s, mask, hc, d.dir);
        if (chosen === null) return false;
        checked++;
        const playerField = fieldOf(s, mask, [pc]);
        if (dd(s, playerField, chosen) < hp) return true;
        // Otherwise it targets a predicted Cell (at most 3 steps ahead of the Player).
        const hf = fieldOf(s, mask, [hc]);
        const cf = fieldOf(s, mask, [chosen]);
        for (let y = 0; y < s.maze.height; y++) {
          for (let x = 0; x < s.maze.width; x++) {
            const c = { x, y };
            if (dd(s, playerField, c) <= 3 && dd(s, cf, c) < dd(s, hf, c)) return true;
          }
        }
        return false;
      }),
      { numRuns: 400 },
    );
    expect(checked).toBeGreaterThan(0);
  });
});

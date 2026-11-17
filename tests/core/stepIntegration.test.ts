import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { CageInterior, ItemKind, Tile } from '../../src/core/types';
import type { Cell, Dir, GameState, Input, Maze } from '../../src/core/types';
import { buildState, cageMazeNoDoor, makeCharacter, makeItems } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const FROZEN = 100_000; // a respawning Squareman neither moves nor collects

interface Placed {
  bombs?: Cell[];
  wisps?: Cell[];
  ghostHunt?: Cell[];
}

/** The no-door cage maze with special items placed on floor cells (removed from the ordinary list). */
function mazeWith(p: Placed): Maze {
  const m = cageMazeNoDoor();
  const taken = new Set([...(p.bombs ?? []), ...(p.wisps ?? []), ...(p.ghostHunt ?? [])].map((c) => `${c.x},${c.y}`));
  return {
    ...m,
    ordinary: m.ordinary.filter((c) => !taken.has(`${c.x},${c.y}`)),
    bombs: p.bombs ?? [],
    wisps: p.wisps ?? [],
    ghostHunt: p.ghostHunt ?? [],
  };
}

function runOn(maze: Maze, over: Partial<GameState> = {}, frozenHunter = true): Run {
  const base = createRun(1, cfg);
  const state = buildState(maze, { over: { lives: 1_000_000, ...over } });
  const hunter = frozenHunter ? makeCharacter('hunter', maze.hunterStart, { respawnIn: FROZEN }) : state.hunter;
  return { ...base, state: { ...state, hunter, items: makeItems(maze) } };
}

interface Out {
  run: Run;
  events: GameEvent[];
}

function drive(run: Run, n: number, input: Input, until?: (r: Run) => boolean): Out {
  const events: GameEvent[] = [];
  let r = run;
  for (let i = 0; i < n; i++) {
    const o = step(r, input);
    r = o.run;
    events.push(...o.events);
    if (until?.(r)) break;
  }
  return { run: r, events };
}

const right = (d: Dir = 'right'): Input => ({ pressed: d, bomb: false, continue: false });
const kindAt = (s: GameState, c: Cell): number => s.items.kinds[c.y * s.maze.width + c.x]!;

describe('step integration: bombs', () => {
  const B = [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }];

  it('collects bombs up to the capacity of 3 and leaves the fourth on the floor', () => {
    const o = drive(runOn(mazeWith({ bombs: B })), 600, right());
    const s = o.run.state;
    expect(s.bombs).toBe(3);
    expect(s.items.bombsOnFloor).toBe(1);
    expect(kindAt(s, B[3]!)).toBe(ItemKind.Bomb);
    expect(kindAt(s, B[0]!)).toBe(ItemKind.None);
    const got = o.events.filter((e) => e.t === 'BombCollected');
    expect(got.map((e) => (e.t === 'BombCollected' ? e.inventory : 0))).toEqual([1, 2, 3]);
  });

  it('detonates a collected bomb on input.bomb, spending one and keeping prison and boundary intact', () => {
    const maze = mazeWith({ bombs: [{ x: 3, y: 1 }] });
    const r0 = runOn(maze);
    const got = drive(r0, 400, right(), (r) => r.state.bombs === 1);
    expect(got.run.state.bombs).toBe(1);
    const before = got.run.state;
    const o = drive(got.run, 1, { pressed: null, bomb: true, continue: false });
    const s = o.run.state;
    expect(s.bombs).toBe(0);
    expect(s.walls.version).toBeGreaterThan(before.walls.version);
    expect(s.walls.destroyed).toBeGreaterThan(0);
    expect(o.events.some((e) => e.t === 'BombDetonated')).toBe(true);
    expect(o.events.some((e) => e.t === 'WallsDestroyed')).toBe(true);
    for (let i = 0; i < s.walls.tiles.length; i++) {
      const orig = maze.tiles[i]!;
      if (orig !== Tile.Wall) expect(s.walls.tiles[i]).toBe(orig);
    }
    // a second press with an empty inventory changes nothing
    const again = drive(o.run, 1, { pressed: null, bomb: true, continue: false });
    expect(again.run.state.walls.version).toBe(s.walls.version);
  });
});

describe('step integration: wisps', () => {
  it('scores a wisp, builds the combo on consecutive wisps and never touches ordinaryRemaining', () => {
    const W = [{ x: 2, y: 1 }, { x: 3, y: 1 }];
    const r0 = runOn(mazeWith({ wisps: W }));
    const ordinary = r0.state.items.ordinaryRemaining;
    const first = drive(r0, 400, right(), (r) => r.state.items.wispsRemaining === 1);
    expect(first.run.state.score).toBe(cfg.wispPoints);
    expect(first.run.state.comboCount).toBe(1);
    const both = drive(first.run, 400, right(), (r) => r.state.items.wispsRemaining === 0);
    const s = both.run.state;
    expect(s.score).toBe(cfg.wispPoints * 3);
    expect(s.comboCount).toBe(2);
    expect(s.items.ordinaryRemaining).toBe(ordinary);
    expect(kindAt(s, W[1]!)).toBe(ItemKind.None);
    const ev = both.events.filter((e) => e.t === 'WispCollected');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ combo: 2, points: cfg.wispPoints * 2 });
  });
});

describe('step integration: Ghost Hunt', () => {
  const G = { x: 2, y: 1 };

  it('starts at once with 3 allies and never alters rescue progress', () => {
    const maze = mazeWith({ ghostHunt: [G] });
    const r0 = runOn(maze, { captives: [true, false, false], carriedKeys: 1 });
    const hit = drive(r0, 400, right(), (r) => r.state.items.ghostHuntOnFloor === 0);
    const s1 = hit.run.state;
    expect(s1.items.ghostHuntOnFloor).toBe(0);
    expect(kindAt(s1, G)).toBe(ItemKind.None);
    expect(s1.ghostHunt.ticksLeft).toBe(cfg.ghostHuntTicks);
    expect(s1.ghostHunt.allies.map((a) => a.mode)).toEqual(['hunting', 'hunting', 'hunting']);
    expect(hit.events.filter((e) => e.t === 'GhostHuntStarted')).toEqual([
      { t: 'GhostHuntStarted', refresh: false, ticks: cfg.ghostHuntTicks },
    ]);

    let r = hit.run;
    const interior = (c: Cell): boolean => r.state.walls.tiles[c.y * maze.width + c.x] === CageInterior;
    let ended = false;
    for (let i = 0; i < cfg.ghostHuntTicks + 800; i++) {
      const o = step(r, IDLE);
      r = o.run;
      ended ||= o.events.some((e) => e.t === 'GhostHuntEnded');
      expect(r.state.captives).toEqual([true, false, false]);
      expect(r.state.carriedKeys).toBe(1);
      // a rescued Kiro never goes back inside the Cage
      expect(interior(r.state.ghostHunt.allies[0].cell)).toBe(false);
    }
    expect(ended).toBe(true);
    const [a0, a1, a2] = r.state.ghostHunt.allies;
    expect([a0.mode, a1.mode, a2.mode]).toEqual(['inactive', 'inactive', 'inactive']);
    expect(interior(a1.cell)).toBe(true);
    expect(interior(a2.cell)).toBe(true);
    expect(r.state.ghostHunt.ticksLeft).toBe(0);
  }, 60_000);

  it('lets allies catch Squareman, which respawns, and the player scores', () => {
    const maze = mazeWith({ ghostHunt: [G] });
    const r0 = runOn(maze, {}, false);
    const hit = drive(r0, 400, right(), (r) => r.state.items.ghostHuntOnFloor === 0);
    const scoreBefore = hit.run.state.score;
    const o = drive(hit.run, cfg.ghostHuntTicks, IDLE, (r) => r.state.hunter.respawnIn > 0 && r.state.score > scoreBefore);
    const eaten = o.events.find((e) => e.t === 'HunterEaten');
    expect(eaten).toMatchObject({ t: 'HunterEaten', by: 'ally' });
    expect(o.run.state.hunter.respawnIn).toBeGreaterThan(0);
    expect(o.run.state.score).toBe(scoreBefore + cfg.scoreWeights.hunterEaten);
  }, 60_000);

  it('never lets Squareman collect Bomb, Wisp or Ghost Hunt', () => {
    const at = { x: 9, y: 7 };
    for (const kind of ['bombs', 'wisps', 'ghostHunt'] as const) {
      const maze = mazeWith({ [kind]: [at] });
      const r0 = runOn(maze, {}, false);
      const o = drive(r0, 1, IDLE);
      const s = o.run.state;
      expect(kindAt(s, at)).not.toBe(ItemKind.None);
      expect(s.bombs).toBe(0);
      expect(s.score).toBe(0);
      expect(s.ghostHunt.ticksLeft).toBe(0);
      expect(s.items.bombsOnFloor + s.items.wispsRemaining + s.items.ghostHuntOnFloor).toBe(1);
    }
  });
});

describe('step integration: determinism', () => {
  const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
  const scripted = (t: number): Input => ({
    pressed: t % 7 === 0 ? DIRS[(t / 7) % 4 | 0]! : null,
    bomb: t % 53 === 0,
    continue: t % 97 === 0,
  });

  const play = (make: () => Run): { run: Run; events: GameEvent[] } => {
    let run = make();
    const events: GameEvent[] = [];
    for (let t = 0; t < 3000; t++) {
      const o = step(run, scripted(t));
      run = o.run;
      events.push(...o.events);
    }
    return { run, events };
  };

  it('replays a hand-built maze with every mechanic active over 3000 ticks', () => {
    const maze = mazeWith({
      bombs: [{ x: 2, y: 1 }, { x: 1, y: 3 }],
      wisps: [{ x: 3, y: 1 }, { x: 1, y: 2 }, { x: 4, y: 3 }],
      ghostHunt: [{ x: 1, y: 4 }],
    });
    const make = (): Run => runOn(maze, { captives: [true, false, false] }, false);
    const a = play(make);
    const b = play(make);
    expect(b.run.state).toEqual(a.run.state);
    expect(b.events).toEqual(a.events);
  }, 60_000);

  it('replays a generated maze over 3000 ticks', () => {
    const make = (): Run => {
      const r = createRun(777, cfg);
      return { ...r, state: { ...r.state, lives: 1_000_000, bombs: 3 } };
    };
    const a = play(make);
    const b = play(make);
    expect(b.run.state).toEqual(a.run.state);
    expect(b.run.brain).toEqual(a.run.brain);
    expect(b.events).toEqual(a.events);
  }, 60_000);
});

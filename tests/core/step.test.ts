import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Dir, Input } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

/** Scripted input: a pure function of the tick, so two runs see the same sequence. */
function scripted(t: number): Input {
  const pressed = t % 17 === 0 ? DIRS[(t / 17) % 4 | 0]! : null;
  return { pressed, bomb: t % 251 === 0, continue: t % 97 === 0 };
}

/** A run that cannot end by the player running out of lives, for idle-player tests. */
function immortal(seed: number): Run {
  const r = createRun(seed, cfg);
  return { ...r, state: { ...r.state, lives: 1_000_000 } };
}

describe('step', () => {
  it('is deterministic over 2000 ticks with the same seed and inputs', () => {
    const play = (): { run: Run; events: GameEvent[] } => {
      let run = createRun(1234, cfg);
      const all: GameEvent[] = [];
      for (let t = 0; t < 2000; t++) {
        const r = step(run, scripted(t));
        run = r.run;
        all.push(...r.events);
      }
      return { run, events: all };
    };
    const a = play();
    const b = play();
    expect(b.run.state).toEqual(a.run.state);
    expect(b.run.brain).toEqual(a.run.brain);
    expect(b.events).toEqual(a.events);
  }, 60_000);

  it('increments the tick and does not mutate its input', () => {
    const run = createRun(5, cfg);
    const snapshot = structuredClone(run.state);
    const r = step(run, IDLE);
    expect(r.run.state.tick).toBe(1);
    expect(run.state).toEqual(snapshot);
    expect(step(r.run, IDLE).run.state.tick).toBe(2);
  });

  it('moves the player when a passable direction is pressed', () => {
    const run = createRun(5, cfg);
    const start = run.state.player.cell;
    const moved = DIRS.some((d) => {
      let r = run;
      for (let t = 0; t < 20; t++) r = step(r, { pressed: d, bomb: false, continue: false }).run;
      const p = r.state.player;
      return p.cell.x !== start.x || p.cell.y !== start.y || p.next !== null;
    });
    expect(moved).toBe(true);
  });

  it('lets the hunter move on its own and collect ordinary pellets', () => {
    let r = immortal(11);
    const before = r.state.items.ordinaryRemaining;
    const hStart = r.state.hunter.cell;
    let hunterMoved = false;
    for (let t = 0; t < 600; t++) {
      r = step(r, IDLE).run;
      const h = r.state.hunter;
      if (h.cell.x !== hStart.x || h.cell.y !== hStart.y) hunterMoved = true;
    }
    expect(hunterMoved).toBe(true);
    expect(r.state.items.ordinaryRemaining).toBeLessThan(before);
  }, 30_000);

  it('ends the level with a hunter win when the player idles', () => {
    let r = immortal(21);
    let ticks = 0;
    while (r.state.phase === 'playing' && ticks < 20_000) {
      r = step(r, IDLE).run;
      ticks++;
    }
    expect(r.state.phase).toBe('levelEnd');
    expect(r.state.outcome).toBe('hunterWin');
    expect(r.state.items.ordinaryRemaining).toBe(0);
    // Balance signal, read from the test output when needed.
    console.info(`[balance] idle player, seed 21: hunter cleared all pellets in ${ticks} ticks`);
    // continue starts the next attempt at the same level, minus a life
    const c = step(r, { ...IDLE, continue: true });
    expect(c.run.state.phase).toBe('playing');
    expect(c.run.state.tick).toBe(0);
    // lives lost during the level carry over, and the hunter win costs one more
    expect(c.run.state.lives).toBe(r.state.lives - 1);
    expect(c.run.progression.levelNumber).toBe(1);
    expect(c.events[0]?.t).toBe('LevelStarted');
    // no continue: nothing happens
    expect(step(r, IDLE).run).toBe(r);
  }, 60_000);

  it('ignores a bomb press with 0 bombs', () => {
    const run = createRun(8, cfg);
    expect(run.state.bombs).toBe(0);
    const a = step(run, IDLE);
    const b = step(run, { ...IDLE, bomb: true });
    expect(b.run.state).toEqual(a.run.state);
    expect(b.events).toEqual(a.events);
  });

  it('produces events in per-tick order', () => {
    const rank = (e: GameEvent): number => {
      switch (e.t) {
        case 'DoorWarning':
        case 'DoorChanged':
          return 1;
        case 'PelletCollected':
          return 3;
        case 'PlayerEaten':
        case 'HunterEaten':
          return 4;
        case 'LevelEnded':
          return 7;
        default:
          return -1;
      }
    };
    let r = immortal(33);
    let seen = 0;
    for (let t = 0; t < 3000 && r.state.phase === 'playing'; t++) {
      const out = step(r, IDLE);
      r = out.run;
      const ranks = out.events.map(rank).filter((x) => x >= 0);
      seen += ranks.length;
      expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    }
    expect(seen).toBeGreaterThan(0);
  }, 60_000);
});

// Task 37.3: the level-start hold on a LevelMilestone (Shell wiring as in main.ts, without the DOM).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Input } from '../../src/core/types';
import { LEVEL_LOCATOR_MS, SpawnFx } from '../../src/render/spawnFx';
import { celebrationHoldMs, isConfirmCode } from '../../src/shell/display';
import { GameLoop, TICK_MS } from '../../src/shell/loop';
import { endLevel, runAt } from '../helpers/runAt';

const cfg = DEFAULT_CONFIG;
const CONTINUE: Input = { pressed: null, bomb: false, continue: true };
const IDLE: Input = { pressed: null, bomb: false, continue: false };

interface Rig {
  loop: GameLoop;
  fx: SpawnFx;
  steps: () => number;
  run: () => Run;
  events: GameEvent[];
  frame: (now: number) => void;
}

function rig(level: number): Rig {
  let run = endLevel(runAt(7, cfg, level), 'playerWin');
  let steps = 0;
  const fx = new SpawnFx();
  fx.celebrationMs = celebrationHoldMs;
  const events: GameEvent[] = [];
  const loop = new GameLoop(
    {
      running: () => !fx.holding(now),
      tick: () => {
        const r = step(run, steps === 0 ? CONTINUE : IDLE);
        steps++;
        run = r.run;
        return r.events;
      },
      render: (_a, t) => fx.sync(run.state, t),
    },
    { request: () => 0, cancel: () => undefined },
  );
  let now = 0;
  loop.bus.subscribe((e) => {
    events.push(...e);
    fx.handle(e, now);
  });
  return {
    loop,
    fx,
    steps: () => steps,
    run: () => run,
    events,
    frame: (t) => {
      now = t;
      loop.frame(t);
    },
  };
}

/** Runs frames until the first Tick happens (the level change), returns the time of that frame. */
function advanceToLevelStart(r: Rig): number {
  let t = 0;
  r.frame(t);
  while (r.steps() === 0) {
    t += TICK_MS;
    r.frame(t);
  }
  return t;
}

/** Frames after `t0` until the Simulation steps again; returns the elapsed time and the Ticks run meanwhile. */
function holdLength(r: Rig, t0: number, skipAt?: number): { ms: number; stepsDuring: number } {
  const stepsBefore = r.steps();
  let t = t0;
  let stepsDuring = 0;
  for (let i = 0; i < 1000; i++) {
    t += TICK_MS;
    if (skipAt !== undefined && t >= skipAt && r.fx.celebrating(t)) r.fx.skipCelebration(t);
    r.frame(t);
    if (r.steps() > stepsBefore + 0) {
      return { ms: t - t0, stepsDuring };
    }
    stepsDuring = r.steps() - stepsBefore;
  }
  throw new Error('hold never ended');
}

describe('celebration hold (Shell)', () => {
  it('celebrationHoldMs is 3000 and the confirm keys are Enter and NumpadEnter', () => {
    expect(celebrationHoldMs).toBe(3000);
    expect(isConfirmCode('Enter')).toBe(true);
    expect(isConfirmCode('NumpadEnter')).toBe(true);
    expect(isConfirmCode('Space')).toBe(false);
  });

  it('on LevelMilestone the hold lasts celebrationHoldMs and the Simulation is not stepped meanwhile', () => {
    const r = rig(99);
    const t0 = advanceToLevelStart(r);
    expect(r.events.some((e) => e.t === 'LevelMilestone' && e.level === 100)).toBe(true);
    expect(r.run().state.levelNumber).toBe(100);
    expect(r.fx.celebrating(t0 + 1)).toBe(true);
    const h = holdLength(r, t0);
    expect(h.stepsDuring).toBe(0);
    expect(h.ms).toBeGreaterThanOrEqual(celebrationHoldMs - TICK_MS);
    expect(h.ms).toBeLessThanOrEqual(celebrationHoldMs + 2 * TICK_MS);
  });

  it('the confirm key skips the hold, then play continues', () => {
    const r = rig(99);
    const t0 = advanceToLevelStart(r);
    const h = holdLength(r, t0, t0 + 500);
    expect(h.stepsDuring).toBe(0);
    expect(h.ms).toBeLessThan(700);
    expect(r.fx.celebrating(t0 + 600)).toBe(false);
    // Normal play: the Simulation keeps stepping on later frames.
    const n = r.steps();
    let t = t0 + h.ms;
    for (let i = 0; i < 30; i++) r.frame((t += TICK_MS));
    expect(r.steps()).toBeGreaterThan(n + 20);
  });

  it('a normal level keeps the existing level-start hold and cannot be skipped', () => {
    const r = rig(97);
    const t0 = advanceToLevelStart(r);
    expect(r.events.some((e) => e.t === 'LevelMilestone')).toBe(false);
    expect(r.fx.celebrating(t0 + 1)).toBe(false);
    expect(r.fx.skipCelebration(t0 + 100)).toBe(false);
    const h = holdLength(r, t0);
    expect(h.stepsDuring).toBe(0);
    expect(h.ms).toBeGreaterThanOrEqual(LEVEL_LOCATOR_MS - TICK_MS);
    expect(h.ms).toBeLessThanOrEqual(LEVEL_LOCATOR_MS + 2 * TICK_MS);
  });
});

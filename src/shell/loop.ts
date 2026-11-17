// Accumulator frame loop and event bus (task 22.4).
// The Simulation advances in fixed 60 Hz Ticks. Each frame adds the clamped elapsed time to an
// accumulator, runs floor(acc / tickMs) Ticks (bounded catch-up), then renders with
// alpha = acc / tickMs. Events of the frame's Tick batch are published synchronously afterwards.

import type { GameEvent } from '../core/events';
import { freezeEvents } from '../core/events';

export const TICK_MS = 1000 / 60;
/** Longest frame delta accepted (a background tab must not cause a burst of Ticks). */
export const MAX_FRAME_MS = 250;
/** Most Ticks run in one frame; any excess time is dropped. */
export const MAX_TICKS_PER_FRAME = 8;

export type Listener = (events: ReadonlyArray<GameEvent>) => void;

/** Synchronous publish/subscribe for the Tick batch events of one frame. */
export class EventBus {
  private readonly listeners: Listener[] = [];

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      const i = this.listeners.indexOf(l);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  publish(events: GameEvent[]): void {
    if (events.length === 0) return;
    const frozen = freezeEvents(events);
    for (const l of [...this.listeners]) l(frozen);
  }
}

export interface Accumulator {
  acc: number;
  last: number | null;
}

export function createAccumulator(): Accumulator {
  return { acc: 0, last: null };
}

/**
 * Advances the accumulator to `now` and returns how many Ticks to run and the render alpha.
 * Pure apart from mutating `a`.
 */
export function advance(a: Accumulator, now: number): { ticks: number; alpha: number } {
  if (a.last === null) {
    a.last = now;
    return { ticks: 0, alpha: 0 };
  }
  const delta = Math.min(MAX_FRAME_MS, Math.max(0, now - a.last));
  a.last = now;
  a.acc += delta;
  // Epsilon: sums of frame deltas land a hair below a whole Tick (e.g. 16.6666/16.6667),
  // which would otherwise delay the Tick by a frame.
  let ticks = Math.floor(a.acc / TICK_MS + 1e-9);
  if (ticks > MAX_TICKS_PER_FRAME) {
    ticks = MAX_TICKS_PER_FRAME;
    a.acc = Math.min(a.acc - ticks * TICK_MS, TICK_MS * 0.999);
  } else {
    a.acc = Math.max(0, a.acc - ticks * TICK_MS);
  }
  return { ticks, alpha: Math.min(1, Math.max(0, a.acc / TICK_MS)) };
}

export interface LoopHooks {
  /** Runs one Tick and returns its events. */
  tick: () => GameEvent[];
  /** Draws a frame with the interpolation alpha and the frame time. */
  render: (alpha: number, now: number) => void;
  /** Called once per frame before ticking (e.g. menus). Return false to pause the Simulation. */
  running?: () => boolean;
}

export interface FrameScheduler {
  request: (cb: (t: number) => void) => number;
  cancel: (id: number) => void;
}

export class GameLoop {
  readonly bus = new EventBus();
  private readonly acc = createAccumulator();
  private id: number | null = null;
  /** Ticks run so far (for tests and the perf harness). */
  ticksRun = 0;

  constructor(
    private readonly hooks: LoopHooks,
    private readonly scheduler: FrameScheduler,
  ) {}

  /** One frame: advance, run Ticks, publish the batch, render. Exposed for tests. */
  frame(now: number): void {
    const { ticks, alpha } = advance(this.acc, now);
    const run = this.hooks.running ? this.hooks.running() : true;
    const batch: GameEvent[] = [];
    if (run) {
      for (let i = 0; i < ticks; i++) {
        batch.push(...this.hooks.tick());
        this.ticksRun++;
      }
    }
    this.bus.publish(batch);
    this.hooks.render(run ? alpha : 0, now);
  }

  start(): void {
    if (this.id !== null) return;
    const loop = (t: number): void => {
      this.frame(t);
      this.id = this.scheduler.request(loop);
    };
    this.id = this.scheduler.request(loop);
  }

  stop(): void {
    if (this.id !== null) this.scheduler.cancel(this.id);
    this.id = null;
    this.acc.last = null;
    this.acc.acc = 0;
  }
}

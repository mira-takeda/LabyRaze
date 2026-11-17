// Accumulator frame loop and event bus (task 22.4).
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/core/events';
import { EventBus, GameLoop, MAX_FRAME_MS, MAX_TICKS_PER_FRAME, TICK_MS, advance, createAccumulator } from '../../src/shell/loop';

function fakeScheduler(): { request: (cb: (t: number) => void) => number; cancel: () => void } {
  return { request: () => 1, cancel: () => undefined };
}

describe('accumulator', () => {
  it('runs floor(elapsed / tickMs) Ticks and carries the remainder as alpha', () => {
    const a = createAccumulator();
    expect(advance(a, 0)).toEqual({ ticks: 0, alpha: 0 });
    const r = advance(a, TICK_MS * 2.5);
    expect(r.ticks).toBe(2);
    expect(r.alpha).toBeCloseTo(0.5, 6);
    const r2 = advance(a, TICK_MS * 3);
    expect(r2.ticks).toBe(1);
    expect(r2.alpha).toBeCloseTo(0, 6);
  });

  it('total Ticks match elapsed time over many uneven frames', () => {
    const a = createAccumulator();
    let t = 0;
    let ticks = 0;
    advance(a, t);
    const deltas = [3, 16, 17, 33, 5, 40, 16.6, 1, 0, 25];
    for (let i = 0; i < 300; i++) {
      t += deltas[i % deltas.length]!;
      ticks += advance(a, t).ticks;
    }
    expect(Math.abs(ticks - Math.floor(t / TICK_MS))).toBeLessThanOrEqual(1);
  });

  it('clamps long frames and bounds catch-up', () => {
    const a = createAccumulator();
    advance(a, 0);
    const r = advance(a, 10_000);
    expect(r.ticks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
    expect(r.ticks).toBeLessThanOrEqual(Math.floor(MAX_FRAME_MS / TICK_MS));
    expect(r.alpha).toBeLessThan(1);
  });

  it('negative time steps run nothing', () => {
    const a = createAccumulator();
    advance(a, 100);
    expect(advance(a, 50).ticks).toBe(0);
  });
});

describe('game loop', () => {
  it('publishes the Tick batch synchronously after the Ticks, then renders', () => {
    const order: string[] = [];
    let n = 0;
    const loop = new GameLoop(
      {
        tick: (): GameEvent[] => {
          order.push(`tick${n}`);
          return [{ t: 'KeyCollected', cell: { x: n++, y: 0 } }];
        },
        render: (alpha) => order.push(`render${alpha.toFixed(2)}`),
      },
      fakeScheduler(),
    );
    const got: number[] = [];
    loop.bus.subscribe((events) => {
      order.push('publish');
      got.push(events.length);
      expect(Object.isFrozen(events[0])).toBe(true);
    });
    loop.frame(0);
    loop.frame(TICK_MS * 2);
    expect(order).toEqual(['render0.00', 'tick0', 'tick1', 'publish', 'render0.00']);
    expect(got).toEqual([2]);
    expect(loop.ticksRun).toBe(2);
  });

  it('pauses the Simulation when running() is false but still renders', () => {
    let ticks = 0;
    let renders = 0;
    const loop = new GameLoop({ tick: () => (ticks++, []), render: () => renders++, running: () => false }, fakeScheduler());
    loop.frame(0);
    loop.frame(100);
    expect(ticks).toBe(0);
    expect(renders).toBe(2);
  });

  it('the bus supports unsubscribe and ignores empty batches', () => {
    const bus = new EventBus();
    let calls = 0;
    const off = bus.subscribe(() => calls++);
    bus.publish([]);
    bus.publish([{ t: 'GameOver', score: 1 }]);
    off();
    bus.publish([{ t: 'GameOver', score: 2 }]);
    expect(calls).toBe(1);
  });
});

// Browser performance and latency harness with a fake clock (task 22.8).
import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGETS, PerfHarness, botDirection } from '../../src/shell/perfHarness';

describe('perf harness', () => {
  it('passes a fast run where every press is consumed by the next Tick', () => {
    const h = new PerfHarness(1000);
    let t = 0;
    let tick = 0;
    while (!h.done) {
      if (tick % 20 === 0) h.pressed(t, tick);
      tick++;
      if ((tick - 1) % 20 === 0) h.consumed(t + 16.7, tick);
      h.frame(t, t + 4);
      t += 16.7;
    }
    const r = h.result();
    expect(r.frames).toBeGreaterThan(50);
    expect(r.frameP95Ms).toBeCloseTo(4, 5);
    expect(r.maxTicksToConsume).toBe(1);
    expect(r.pass).toBe(true);
  });

  it('fails when the frame work p95 exceeds 16.7 ms', () => {
    const h = new PerfHarness(500);
    let t = 0;
    let i = 0;
    h.pressed(0, 0);
    h.consumed(16, 1);
    while (!h.done) {
      h.frame(t, t + (i++ % 4 === 0 ? 30 : 5));
      t += 33;
    }
    const r = h.result();
    expect(r.frameP95Ms).toBeGreaterThan(DEFAULT_BUDGETS.frameP95Ms);
    expect(r.pass).toBe(false);
  });

  it('fails when a press waits more than one Tick', () => {
    const h = new PerfHarness(100);
    h.pressed(0, 10);
    h.consumed(50, 13);
    h.frame(0, 1);
    h.frame(200, 201);
    const r = h.result();
    expect(r.maxTicksToConsume).toBe(3);
    expect(r.pass).toBe(false);
  });

  it('the bot schedule is deterministic and uses all four directions', () => {
    const a = Array.from({ length: 40 }, (_, n) => botDirection(n, 7));
    const b = Array.from({ length: 40 }, (_, n) => botDirection(n, 7));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(4);
  });

  it('separates an intentional hold and FIFO queue time from a delayed eligible input', () => {
    const h = new PerfHarness(100);
    h.pause(0, true);
    for (let i = 0; i < 4; i++) h.pressed(i * 10, 0, i);
    h.pause(80, false);
    for (let i = 1; i <= 4; i++) h.consumed(80 + i, i);
    h.frame(0, 1);
    h.frame(101, 102);
    expect(h.result()).toMatchObject({ pass: true, maxTicksToConsume: 1, maxQueueTicks: 4, heldInputs: 4, intentionalPauseMs: 80 });
  });

  it('accounts for discarded inputs and still detects genuine tick delays behind a queue', () => {
    const h = new PerfHarness(100);
    h.pressed(0, 0);
    h.pressed(1, 0, 1);
    h.discard();
    h.consumed(60, 3);
    h.frame(0, 1);
    h.frame(101, 102);
    expect(h.result()).toMatchObject({ pass: false, queued: 2, discarded: 1, inputs: 1, pending: 0, maxTicksToConsume: 3 });
  });

  it('measures callback work separately from rAF scheduling delay', () => {
    const h = new PerfHarness(100);
    h.pressed(0, 0);
    h.consumed(20, 1);
    h.frame(20, 24, 0);
    h.frame(121, 125, 100);
    expect(h.result()).toMatchObject({ frameP95Ms: 4, rafDeltaP95Ms: 100 });
  });

  it('does not hide an overdue pending input behind earlier successful samples', () => {
    const h = new PerfHarness(100);
    h.pressed(0, 0); h.consumed(16, 1);
    h.pressed(17, 1); h.ticked(2);
    h.frame(0, 1); h.frame(101, 102);
    expect(h.result()).toMatchObject({ pass: false, overdueInputs: 1, pending: 1 });
  });
});

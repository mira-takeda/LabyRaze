// Browser performance and latency harness (task 22.8), enabled with `?perf=1`.
// A scripted bot plays for `durationMs`. Budgets (Requirement 21):
//  - Frame_Time p95 <= 16.7 ms, where Frame_Time is the wall-clock time to render one frame
//    (the work of the frame callback: Ticks plus drawing). The rAF delta p95 is reported too.
//  - Input consumed by its first eligible Tick, preserving the existing one-direction-per-Tick
//    FIFO policy. Intentional animation holds and time behind older presses are reported
//    separately. Dropped/cleared directions are accounted for, never silently counted as consumed.
// The result is exposed as window.__kirobitPerf.

export interface PerfBudgets {
  frameP95Ms: number;
  maxTicksToConsume: number;
}

export const DEFAULT_BUDGETS: PerfBudgets = { frameP95Ms: 16.7, maxTicksToConsume: 1 };

export interface PerfResult {
  frames: number;
  frameP95Ms: number;
  frameMeanMs: number;
  rafDeltaP95Ms: number;
  inputs: number;
  maxTicksToConsume: number;
  inputLatencyP95Ms: number;
  pass: boolean;
  budgets: PerfBudgets;
  queued: number;
  discarded: number;
  pending: number;
  heldInputs: number;
  intentionalPauseMs: number;
  activeLatencyP95Ms: number;
  maxQueueTicks: number;
  overdueInputs: number;
}

function p95(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const r = 0.95 * (s.length - 1);
  const lo = Math.floor(r);
  const hi = Math.min(s.length - 1, lo + 1);
  return Math.round((s[lo]! + (s[hi]! - s[lo]!) * (r - lo)) * 100) / 100;
}

export class PerfHarness {
  private readonly work: number[] = [];
  private readonly deltas: number[] = [];
  private readonly latencies: number[] = [];
  private readonly tickGaps: number[] = [];
  private readonly queueGaps: number[] = [];
  private readonly activeLatencies: number[] = [];
  private queued = 0;
  private discarded = 0;
  private heldInputs = 0;
  private pauseAt: number | null = null;
  private pauseMs = 0;
  private ticks = 0;
  private last: number | null = null;
  private start: number | null = null;
  private readonly pending: Array<{ at: number; tick: number; ahead: number; held: boolean }> = [];
  done = false;

  constructor(
    readonly durationMs = 30_000,
    readonly budgets: PerfBudgets = DEFAULT_BUDGETS,
  ) {}

  /** Records one frame that started at `start` and finished at `end`. Returns true when done. */
  frame(start: number, end: number, rafTime = start): boolean {
    if (this.done) return true;
    if (this.start === null) this.start = start;
    if (this.last !== null) this.deltas.push(rafTime - this.last);
    this.last = rafTime;
    this.work.push(end - start);
    if (end - this.start >= this.durationMs) this.done = true;
    return this.done;
  }

  /** The bot pressed a key at `now`; `ticksRun` is the Tick count at that moment. */
  pressed(now: number, ticksRun: number, ahead = 0): void {
    if (this.done) return;
    this.queued++;
    this.pending.push({ at: now, tick: ticksRun, ahead, held: this.pauseAt !== null });
  }

  /** Holds are wall-clock pauses, not simulation delay. FIFO queue time is reported separately. */
  pause(now: number, held: boolean): void {
    if (this.done) return;
    if (held) {
      if (this.pauseAt === null) this.pauseAt = now;
      for (const p of this.pending) p.held = true;
    } else if (this.pauseAt !== null) {
      this.pauseMs += now - this.pauseAt;
      this.pauseAt = null;
    }
  }

  discard(): void {
    if (this.done) return;
    if (this.pending.shift()) {
      this.discarded++;
      for (const p of this.pending) p.ahead = Math.max(0, p.ahead - 1);
    }
  }

  ticked(tick: number): void {
    if (!this.done) this.ticks = tick;
  }

  /** The Tick numbered `tick` (1-based count after it ran) consumed the oldest pending press. */
  consumed(now: number, tick: number): void {
    if (this.done) return;
    const p = this.pending.shift();
    if (p === undefined) return;
    this.latencies.push(now - p.at);
    this.queueGaps.push(tick - p.tick);
    this.tickGaps.push(Math.max(1, tick - p.tick - p.ahead));
    if (p.held) this.heldInputs++;
    else if (p.ahead === 0) this.activeLatencies.push(now - p.at);
  }

  result(): PerfResult {
    const frameP95Ms = p95(this.work);
    const mean = this.work.length > 0 ? this.work.reduce((a, b) => a + b, 0) / this.work.length : 0;
    const maxTicksToConsume = this.tickGaps.length > 0 ? Math.max(...this.tickGaps) : 0;
    const overdueInputs = this.pending.filter((p) => this.ticks > p.tick + p.ahead).length;
    return {
      frames: this.work.length,
      frameP95Ms,
      frameMeanMs: Math.round(mean * 100) / 100,
      rafDeltaP95Ms: p95(this.deltas),
      inputs: this.latencies.length,
      maxTicksToConsume,
      inputLatencyP95Ms: p95(this.latencies),
      pass:
        this.work.length > 0 &&
        this.latencies.length > 0 &&
        frameP95Ms <= this.budgets.frameP95Ms &&
        maxTicksToConsume <= this.budgets.maxTicksToConsume && overdueInputs === 0,
      budgets: this.budgets,
      queued: this.queued,
      discarded: this.discarded,
      pending: this.pending.length,
      heldInputs: this.heldInputs,
      intentionalPauseMs: Math.round(this.pauseMs + (this.pauseAt === null || this.last === null ? 0 : Math.max(0, this.last - this.pauseAt))),
      activeLatencyP95Ms: p95(this.activeLatencies),
      maxQueueTicks: this.queueGaps.length ? Math.max(...this.queueGaps) : 0,
      overdueInputs,
    };
  }
}

/** Deterministic bot key schedule: the n-th direction for a seed. */
export function botDirection(n: number, seed: number): 'up' | 'down' | 'left' | 'right' {
  const dirs = ['up', 'right', 'down', 'left'] as const;
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0; // keep it unsigned so the index is 0..3
  return dirs[x % 4]!;
}

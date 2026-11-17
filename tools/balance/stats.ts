/**
 * Balance_Simulator statistics helpers (task 18.2).
 *
 * Pure and deterministic: no clock, no randomness, no I/O.
 *
 * Conventions
 * - Empty input and any non-finite value (NaN, +-Infinity) throw a RangeError.
 *   Nothing here ever returns NaN.
 * - Percentiles use linear interpolation between order statistics (the "R-7"
 *   method: rank = p/100 * (n - 1)). `p` is an integer in [0, 100], so the rank
 *   is computed in integer arithmetic (p * (n - 1)) divided by 100, and the
 *   result is rounded to `DECIMALS` places so output is stable across platforms.
 */

export const DECIMALS = 6;

const SCALE = 10 ** DECIMALS;

/** Round to a fixed number of decimals (half away from zero), normalising -0. */
export function roundFixed(x: number): number {
  assertFinite(x, 'roundFixed');
  const r = Math.sign(x) * Math.round(Math.abs(x) * SCALE) / SCALE;
  return r === 0 ? 0 : r;
}

function assertFinite(x: number, what: string): void {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new RangeError(`${what}: non-finite value ${String(x)}`);
  }
}

function assertSamples(values: readonly number[], what: string): void {
  if (values.length === 0) throw new RangeError(`${what}: empty input`);
  for (const v of values) assertFinite(v, what);
}

function sortedCopy(values: readonly number[], what: string): number[] {
  assertSamples(values, what);
  return [...values].sort((a, b) => a - b);
}

function percentileSorted(sorted: readonly number[], p: number): number {
  if (!Number.isInteger(p) || p < 0 || p > 100) {
    throw new RangeError(`percentile: p must be an integer in [0, 100], got ${String(p)}`);
  }
  const n = sorted.length;
  const num = p * (n - 1); // integer
  const lo = Math.floor(num / 100);
  const rem = num - lo * 100; // integer in [0, 99]
  const a = sorted[lo] as number;
  if (rem === 0) return roundFixed(a);
  const b = sorted[lo + 1] as number;
  return roundFixed(a + ((b - a) * rem) / 100);
}

/** Percentile `p` (integer 0..100) with linear interpolation. Throws on empty/non-finite input. */
export function percentile(values: readonly number[], p: number): number {
  return percentileSorted(sortedCopy(values, 'percentile'), p);
}

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export function mean(values: readonly number[]): number {
  assertSamples(values, 'mean');
  let sum = 0;
  for (const v of values) sum += v;
  return roundFixed(sum / values.length);
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number {
  assertSamples(values, 'stdDev');
  let sum = 0;
  for (const v of values) sum += v;
  const m = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - m) * (v - m);
  return roundFixed(Math.sqrt(sq / values.length));
}

export function min(values: readonly number[]): number {
  assertSamples(values, 'min');
  let r = values[0] as number;
  for (const v of values) if (v < r) r = v;
  return roundFixed(r);
}

export function max(values: readonly number[]): number {
  assertSamples(values, 'max');
  let r = values[0] as number;
  for (const v of values) if (v > r) r = v;
  return roundFixed(r);
}

export interface HistogramBin {
  /** Inclusive lower edge. */
  readonly lo: number;
  /** Exclusive upper edge, except the last bin where it is inclusive. */
  readonly hi: number;
  readonly count: number;
}

/** Equal-width histogram over [min, max]. All-equal input yields one bin of width 0. */
export function histogram(values: readonly number[], bins: number): HistogramBin[] {
  assertSamples(values, 'histogram');
  if (!Number.isInteger(bins) || bins < 1) {
    throw new RangeError(`histogram: bins must be a positive integer, got ${String(bins)}`);
  }
  const lo = min(values);
  const hi = max(values);
  if (lo === hi) return [{ lo, hi, count: values.length }];
  const width = (hi - lo) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor((v - lo) / width));
    counts[i] = (counts[i] as number) + 1;
  }
  return counts.map((count, i) => ({
    lo: roundFixed(lo + i * width),
    hi: i === bins - 1 ? hi : roundFixed(lo + (i + 1) * width),
    count,
  }));
}

/** Distribution summary: the baseline JSON shape (design, Metrics). */
export interface DistributionSummary {
  readonly mean: number;
  readonly median: number;
  readonly p5: number;
  readonly p95: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
}

export function summarize(values: readonly number[]): DistributionSummary {
  const sorted = sortedCopy(values, 'summarize');
  return {
    mean: mean(sorted),
    median: percentileSorted(sorted, 50),
    p5: percentileSorted(sorted, 5),
    p95: percentileSorted(sorted, 95),
    min: roundFixed(sorted[0] as number),
    max: roundFixed(sorted[sorted.length - 1] as number),
    count: sorted.length,
  };
}

/** ratio = pelletClearTicks / rescueTicks. Both must be finite and rescueTicks > 0. */
export function ratio(pelletClearTicks: number, rescueTicks: number): number {
  assertFinite(pelletClearTicks, 'ratio');
  assertFinite(rescueTicks, 'ratio');
  if (rescueTicks <= 0) throw new RangeError('ratio: rescueTicks must be > 0');
  return roundFixed(pelletClearTicks / rescueTicks);
}

/** Element-wise ratios of two equally long arrays (same Seed order). */
export function ratios(pelletClearTicks: readonly number[], rescueTicks: readonly number[]): number[] {
  if (pelletClearTicks.length !== rescueTicks.length) {
    throw new RangeError('ratios: length mismatch');
  }
  if (pelletClearTicks.length === 0) throw new RangeError('ratios: empty input');
  return pelletClearTicks.map((t, i) => ratio(t, rescueTicks[i] as number));
}

export interface Proportion {
  readonly wins: number;
  readonly total: number;
  readonly rate: number;
  readonly lo: number;
  readonly hi: number;
}

/** Wilson score interval for a win rate. Default z = 1.96 (95%). */
export function winRate(wins: number, total: number, z = 1.96): Proportion {
  if (!Number.isInteger(wins) || !Number.isInteger(total) || total < 1 || wins < 0 || wins > total) {
    throw new RangeError(`winRate: invalid wins/total ${String(wins)}/${String(total)}`);
  }
  assertFinite(z, 'winRate');
  if (z < 0) throw new RangeError('winRate: z must be >= 0');
  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return {
    wins,
    total,
    rate: roundFixed(p),
    lo: roundFixed(Math.max(0, centre - half)),
    hi: roundFixed(Math.min(1, centre + half)),
  };
}

export type SummaryStat = keyof Omit<DistributionSummary, 'count'>;

/** A band on one statistic. Either bound may be omitted. */
export interface Band {
  readonly min?: number;
  readonly max?: number;
}

export interface BandViolation {
  readonly stat: string;
  readonly value: number;
  readonly band: Band;
  /** Distance outside the band, always > 0. */
  readonly excess: number;
  /** Seed with the worst offending sample, when sample data was supplied. */
  readonly worstSeed?: number;
}

export interface SeededSample {
  readonly seed: number;
  readonly value: number;
}

/**
 * Check a statistic against a band. Returns null when inside, otherwise the
 * violation. `samples` (optional) names the worst Seed: the sample furthest outside the band.
 */
export function checkBand(
  stat: string,
  value: number,
  band: Band,
  samples?: readonly SeededSample[],
): BandViolation | null {
  assertFinite(value, `checkBand(${stat})`);
  if (band.min !== undefined) assertFinite(band.min, `checkBand(${stat}).min`);
  if (band.max !== undefined) assertFinite(band.max, `checkBand(${stat}).max`);
  if (band.min !== undefined && band.max !== undefined && band.min > band.max) {
    throw new RangeError(`checkBand(${stat}): min > max`);
  }
  const excessOf = (v: number): number =>
    band.min !== undefined && v < band.min
      ? band.min - v
      : band.max !== undefined && v > band.max
        ? v - band.max
        : 0;
  const excess = excessOf(value);
  if (excess <= 0) return null;
  let worstSeed: number | undefined;
  if (samples !== undefined) {
    let worst = 0;
    for (const s of samples) {
      assertFinite(s.value, `checkBand(${stat}) sample`);
      const e = excessOf(s.value);
      // Ties break on the lowest Seed so the result is order independent.
      if (e > worst || (e === worst && e > 0 && worstSeed !== undefined && s.seed < worstSeed)) {
        worst = e;
        worstSeed = s.seed;
      }
    }
  }
  const base = { stat, value, band, excess: roundFixed(excess) };
  return worstSeed === undefined ? base : { ...base, worstSeed };
}

/**
 * Centre-statistic tolerance: |stat - baseline| <= max(absTol, relTol * |baseline|).
 * `relTol` is `balanceRelTol` (design default 0.15).
 */
export function withinTolerance(stat: number, baseline: number, absTol: number, relTol: number): boolean {
  assertFinite(stat, 'withinTolerance');
  assertFinite(baseline, 'withinTolerance');
  assertFinite(absTol, 'withinTolerance');
  assertFinite(relTol, 'withinTolerance');
  if (absTol < 0 || relTol < 0) throw new RangeError('withinTolerance: tolerances must be >= 0');
  return Math.abs(stat - baseline) <= Math.max(absTol, relTol * Math.abs(baseline));
}

/** Same check as {@link withinTolerance}, returning the violation for reporting. */
export function checkTolerance(
  stat: string,
  value: number,
  baseline: number,
  absTol: number,
  relTol: number,
  samples?: readonly SeededSample[],
): BandViolation | null {
  if (withinTolerance(value, baseline, absTol, relTol)) return null;
  const tol = Math.max(absTol, relTol * Math.abs(baseline));
  return checkBand(stat, value, { min: baseline - tol, max: baseline + tol }, samples);
}

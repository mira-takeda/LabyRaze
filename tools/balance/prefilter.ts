// Evidence for validity check 8 (task 19.7). For the baseline Seed set it computes the analytic
// race ratio of every Maze, its correlation with the simulated threeKey ratio, and proposes
// prefilterBand = [p5 / F, p95 * F] (F = widening factor, default 2), reporting how many of the
// measured Mazes the band would reject.
//
//   tsx tools/balance/prefilter.ts [--factor 2]

import { DEFAULT_CONFIG } from '../../src/core/config';
import { analyticRaceRatio } from '../../src/core/maze/validate';
import { runAtLevel } from './runner';
import { readBaseline } from './cli';
import { ALL_ON } from './simulator';
import { percentile } from './stats';

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

function main(): void {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--factor');
  const factor = fi >= 0 ? Number(args[fi + 1]) : 2;
  const b = readBaseline();
  if (!b) {
    console.log('no baseline');
    process.exit(1);
  }
  const analytic: number[] = [];
  const simulated: number[] = [];
  const all: number[] = [];
  for (const level of b.meta.levels) {
    const cs = b.report.stats[ALL_ON]?.[String(level)]?.threeKey;
    const sim = new Map<number, number>((cs?.ratioSamples ?? []).map((s) => [s.seed, s.value]));
    for (let i = 0; i < b.meta.n; i++) {
      const seed = b.meta.baseSeed + i;
      const r = analyticRaceRatio(runAtLevel(seed, level, DEFAULT_CONFIG).state.maze);
      all.push(r);
      const s = sim.get(seed);
      if (s !== undefined) {
        analytic.push(r);
        simulated.push(s);
      }
    }
  }
  const p5 = percentile(all, 5);
  const p95 = percentile(all, 95);
  const band = { min: Math.floor((p5 / factor) * 100) / 100, max: Math.ceil(p95 * factor * 100) / 100 };
  const rejected = all.filter((r) => r < band.min || r > band.max).length;
  const out = {
    mazes: all.length,
    analytic: { min: percentile(all, 0), p5, median: percentile(all, 50), p95, max: percentile(all, 100) },
    correlationWithSimulatedThreeKey: Math.round(pearson(analytic, simulated) * 1e4) / 1e4,
    factor,
    band,
    rejectedInBaseline: rejected,
  };
  console.log(JSON.stringify(out, null, 1));
}

if (process.argv[1]?.endsWith('prefilter.ts')) main();

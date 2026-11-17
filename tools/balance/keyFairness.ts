// Read-only Key placement fairness measurement (task 36.8). Never writes baseline.json.
//   tsx tools/balance/keyFairness.ts [outFile]
// Default output: tools/balance/logs/key-fairness-before.json (pass another path for the "after" run).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import { bfsDistances } from '../../src/core/maze/validate';

const out = resolve(process.argv[2] ?? 'tools/balance/logs/key-fairness-before.json');
const baseline = JSON.parse(readFileSync(resolve('tools/balance/baseline.json'), 'utf8'));
const { n, baseSeed, levels } = baseline.meta as { n: number; baseSeed: number; levels: number[] };
const PCTS = [0, 2, 5, 50, 95, 98, 100];

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)) * 1000) / 1000;
}
function summary(values: number[]): Record<string, number> {
  const s = [...values].sort((a, b) => a - b);
  const o: Record<string, number> = {};
  for (const p of PCTS) o[`p${p}`] = pct(s, p);
  return o;
}
function pearson(xs: number[], ys: number[]): number | null {
  const m = xs.length;
  if (m < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / m;
  const my = ys.reduce((a, b) => a + b, 0) / m;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < m; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000;
}

// Band reported against: the configured keyRouteMin/keyRouteMax when present, else the 36.8 values.
const cfgAny = DEFAULT_CONFIG as unknown as Record<string, unknown>;
const band = {
  min: typeof cfgAny.keyRouteMin === 'number' ? cfgAny.keyRouteMin : 34,
  max: typeof cfgAny.keyRouteMax === 'number' ? cfgAny.keyRouteMax : 92,
};
const outOfBand: Array<{ seed: number; level: number; route: number; repairs: number; fallback: boolean }> = [];
const t0 = Date.now();
const stats = baseline.report?.stats?.B1G1W1 ?? baseline.report?.stats?.[Object.keys(baseline.report.stats)[0]!];
const result: Record<string, unknown> = { task: '36.8', n, baseSeed, levels, perLevel: {}, all: {} };
const all = { route: [] as number[], delta: [] as number[], minKey: [] as number[], maxKey: [] as number[], pellets: [] as number[], ratio: [] as number[] };

for (const level of levels) {
  const route: number[] = [];
  const delta: number[] = [];
  const minKey: number[] = [];
  const maxKey: number[] = [];
  const pellets: number[] = [];
  const ratio: number[] = [];
  const routeBySeed = new Map<number, number>();
  for (let s = baseSeed; s < baseSeed + n; s++) {
    const m = generateMaze(s, level, DEFAULT_CONFIG);
    const nav = { width: m.width, height: m.height, tiles: m.tiles, doors: m.doors };
    const at = (d: Int32Array, c: { x: number; y: number }): number => d[c.y * m.width + c.x]!;
    const dp = bfsDistances(nav, [m.playerStart]);
    const dh = bfsDistances(nav, [m.hunterStart]);
    const dc = bfsDistances(nav, [m.cage.entrance]);
    const keyD = m.keys.map((k) => bfsDistances(nav, [k]));
    // Greedy route: nearest remaining Key each step, then the Cage entrance.
    let cur = m.playerStart;
    let curD = dp;
    const left = m.keys.map((_, i) => i);
    let len = 0;
    while (left.length > 0) {
      let bi = 0;
      for (let j = 1; j < left.length; j++) if (at(curD, m.keys[left[j]!]!) < at(curD, m.keys[left[bi]!]!)) bi = j;
      const ki = left.splice(bi, 1)[0]!;
      len += at(curD, m.keys[ki]!);
      cur = m.keys[ki]!;
      curD = keyD[ki]!;
    }
    len += at(curD, m.cage.entrance);
    void cur;
    route.push(len);
    routeBySeed.set(s, len);
    if (len < band.min || len > band.max) outOfBand.push({ seed: s, level, route: len, repairs: m.generation.repairs, fallback: m.generation.fallback === true });
    for (const k of m.keys) delta.push(Math.abs(at(dp, k) - at(dh, k)));
    const kd = m.keys.map((k) => at(dc, k));
    minKey.push(Math.min(...kd));
    maxKey.push(Math.max(...kd));
    pellets.push(m.ordinary.length);
    ratio.push(m.ordinary.length / len);
  }
  // Correlation with the baseline per-Seed threeKey ratio (rescue/pellet race) when available.
  const cell = stats?.[String(level)]?.threeKey;
  const samples: Array<{ seed: number; value: number }> = cell?.ratioSamples ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const sm of samples) {
    const r = routeBySeed.get(sm.seed);
    if (r !== undefined) {
      xs.push(r);
      ys.push(sm.value);
    }
  }
  (result.perLevel as Record<string, unknown>)[String(level)] = {
    routeLength: summary(route),
    keyDeltaPlayerVsHunter: summary(delta),
    minKeyCageDist: summary(minKey),
    maxKeyCageDist: summary(maxKey),
    pellets: summary(pellets),
    pelletsPerRoute: summary(ratio),
    baselineRatioCorrelation: { pearsonRouteVsRatio: pearson(xs, ys), samples: xs.length },
  };
  all.route.push(...route);
  all.delta.push(...delta);
  all.minKey.push(...minKey);
  all.maxKey.push(...maxKey);
  all.pellets.push(...pellets);
  all.ratio.push(...ratio);
}
const med = pct([...all.route].sort((a, b) => a - b), 50);
result.all = {
  routeLength: summary(all.route),
  routeMedian: med,
  routeMinOverMedian: Math.min(...all.route) / med,
  routeMaxOverMedian: Math.max(...all.route) / med,
  keyDeltaPlayerVsHunter: summary(all.delta),
  minKeyCageDist: summary(all.minKey),
  maxKeyCageDist: summary(all.maxKey),
  pellets: summary(all.pellets),
  pelletsPerRoute: summary(all.ratio),
  band,
  outOfBandCount: outOfBand.length,
  outOfBand,
  durationMs: Date.now() - t0,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.all, null, 1));

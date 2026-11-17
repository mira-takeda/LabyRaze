// Evidence-based Seed count (task 19.6): bootstraps the per-Seed ratio samples stored in
// baseline.json (see bootstrap.ts). The chosen full-run N is the smallest whose worst relative
// half-width of both p5 and median is within `--margin` (default the band margin 0.1).
//
//   tsx tools/balance/seedCount.ts [--margin 0.1] [--resamples 400]

import { seedCountTable } from './bootstrap';
import { readBaseline } from './cli';
import { ALL_ON } from './simulator';

function arg(name: string, fallback: number): number {
  const a = process.argv.slice(2);
  const i = a.indexOf(name);
  const v = i >= 0 ? Number(a[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function main(): void {
  const margin = arg('--margin', 0.1);
  const resamples = arg('--resamples', 400);
  const b = readBaseline();
  if (!b) {
    console.log('no baseline');
    process.exit(1);
  }
  const cells: Record<string, number[]> = {};
  for (const [level, byPolicy] of Object.entries(b.report.stats[ALL_ON] ?? {})) {
    for (const [policy, cs] of Object.entries(byPolicy)) cells[`${policy}@L${level}`] = cs.ratioSamples.map((s) => s.value);
  }
  const candidates = [20, 40, 50, 100, 150, 200, 250, 300, 400, 500].filter((n) => n <= b.meta.n);
  const rows = seedCountTable(cells, candidates, resamples);
  console.log('n     worst p5 half-width   worst median half-width   worst cell');
  for (const r of rows) console.log(`${String(r.n).padEnd(5)} ${r.worstP5.toFixed(4).padEnd(21)} ${r.worstMedian.toFixed(4).padEnd(25)} ${r.worstCell}`);
  const pick = rows.find((r) => r.worstP5 <= margin && r.worstMedian <= margin);
  console.log(pick ? `chosen n = ${pick.n} (smallest with both half-widths <= ${margin})` : `no candidate meets ${margin}; keep n = ${b.meta.n}`);
  console.log(JSON.stringify({ margin, resamples, rows, chosen: pick?.n ?? b.meta.n }));
}

if (process.argv[1]?.endsWith('seedCount.ts')) main();

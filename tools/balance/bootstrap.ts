// Bootstrap precision of p5 and median for candidate Seed counts (tasks 19.6 and 18.6).
// Deterministic resampling of stored per-Seed ratio samples; no clock, no Math.random.

import { percentile } from './stats';

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export interface SeedCountRow {
  n: number;
  /** Worst (over cells) relative 94% half-width of p5. */
  worstP5: number;
  /** Worst (over cells) relative 94% half-width of the median. */
  worstMedian: number;
  worstCell: string;
}

export function seedCountTable(samplesByCell: Record<string, number[]>, candidates: number[], resamples: number): SeedCountRow[] {
  const rows: SeedCountRow[] = [];
  for (const n of candidates) {
    let worstP5 = 0;
    let worstMedian = 0;
    let worstCell = '';
    for (const [cell, xs] of Object.entries(samplesByCell)) {
      if (xs.length < 20) continue;
      const fullP5 = percentile(xs, 5);
      const fullMed = percentile(xs, 50);
      let h = 0;
      for (const ch of cell) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
      const r = rng(n * 7919 + h);
      const p5s: number[] = [];
      const meds: number[] = [];
      for (let k = 0; k < resamples; k++) {
        const sample: number[] = new Array<number>(n);
        for (let i = 0; i < n; i++) sample[i] = xs[Math.floor(r() * xs.length)]!;
        p5s.push(percentile(sample, 5));
        meds.push(percentile(sample, 50));
      }
      const hw = (v: number[], full: number): number => (percentile(v, 97) - percentile(v, 3)) / 2 / Math.max(1e-9, full);
      const a = hw(p5s, fullP5);
      const b = hw(meds, fullMed);
      if (a > worstP5 || b > worstMedian) worstCell = cell;
      worstP5 = Math.max(worstP5, a);
      worstMedian = Math.max(worstMedian, b);
    }
    rows.push({ n, worstP5: Math.round(worstP5 * 1e4) / 1e4, worstMedian: Math.round(worstMedian * 1e4) / 1e4, worstCell });
  }
  return rows;
}

/** Smallest candidate whose worst median half-width is within `tol` (else the largest). */
export function pickN(rows: readonly SeedCountRow[], tol: number, key: 'worstMedian' | 'worstP5' = 'worstMedian'): number {
  const ok = rows.find((r) => r[key] <= tol);
  return ok ? ok.n : (rows[rows.length - 1]?.n ?? 0);
}

// worker_threads pool (task 18.5). Units are sorted canonically, split into contiguous chunks,
// run in parallel and merged back in canonical order, so the output does not depend on the
// worker count. Timing is only used by the caller's budget check and never enters results.
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameConfig } from '../../src/core/config';
import { DEFAULT_LIMITS, compareUnits, runUnits } from './simulator';
import type { RaceLimits, Unit, UnitResult } from './simulator';

export function defaultWorkerCount(): number {
  return Math.max(1, Math.min(availableParallelism() - 1, 8));
}

/** Splits `units` (already sorted) into `k` contiguous chunks of near-equal size. */
export function chunk<T>(units: readonly T[], k: number): T[][] {
  const n = Math.max(1, Math.min(k, units.length));
  const out: T[][] = [];
  const base = Math.floor(units.length / n);
  let extra = units.length % n;
  let i = 0;
  for (let c = 0; c < n; c++) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    out.push(units.slice(i, i + size));
    i += size;
  }
  return out.filter((c) => c.length > 0);
}

export interface PoolOptions {
  workers?: number;
  limits?: RaceLimits;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Runs all units. With `workers <= 1` everything runs in this thread (the reference result).
 * Otherwise each chunk runs in its own worker thread with the project TypeScript loader.
 */
export async function runPool(units: readonly Unit[], cfg: GameConfig, opts: PoolOptions = {}): Promise<UnitResult[]> {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const sorted = [...units].sort(compareUnits);
  const k = opts.workers ?? defaultWorkerCount();
  if (k <= 1 || sorted.length <= 1) return runUnits(sorted, cfg, limits);

  const chunks = chunk(sorted, k);
  const progress = new Array<number>(chunks.length).fill(0);
  const parts = await Promise.all(
    chunks.map(
      (units, ci) =>
        new Promise<UnitResult[]>((resolve, reject) => {
          const w = new Worker(new URL('./worker.ts', import.meta.url), {
            workerData: { units, cfg, limits },
            execArgv: ['--import', new URL('../registerTypeScript.mjs', import.meta.url).href],
          });
          w.on('message', (m: { type: string; done?: number; results?: UnitResult[] }) => {
            if (m.type === 'progress' && m.done !== undefined) {
              progress[ci] = m.done;
              opts.onProgress?.(progress.reduce((a, b) => a + b, 0), sorted.length);
            } else if (m.type === 'done' && m.results) {
              progress[ci] = units.length;
              opts.onProgress?.(progress.reduce((a, b) => a + b, 0), sorted.length);
              resolve(m.results);
            }
          });
          w.on('error', reject);
          w.on('exit', (code) => {
            if (code !== 0) reject(new Error(`balance worker ${ci} exited with code ${code}`));
          });
        }),
    ),
  );
  // Chunks are contiguous slices of the sorted list, so concatenation is canonical order.
  return parts.flat();
}

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';

// Timing lives in the test only; src/core stays free of clocks.
describe('maze generation performance', () => {
  it('generates 100 mazes within 50 ms at p95', () => {
    // Warm-up so JIT compilation is not counted.
    for (let seed = 1000; seed < 1010; seed++) generateMaze(seed, 1, DEFAULT_CONFIG);

    const times: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const t0 = performance.now();
      generateMaze(seed, 1 + (seed % 200), DEFAULT_CONFIG);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((s, v) => s + v, 0) / times.length;
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    const max = times[times.length - 1]!;
    console.log(
      `generateMaze x100: mean ${mean.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${max.toFixed(2)} ms (budget 50 ms p95)`,
    );
    expect(p95).toBeLessThanOrEqual(50);
  });
});

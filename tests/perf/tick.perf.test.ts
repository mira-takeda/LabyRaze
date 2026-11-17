// Tick performance (task 20.1, Requirement 21.3 and 21.7): p95 of `step` at most 2 ms over at
// least 10,000 Ticks, including scripted Bomb detonations and Ghost Hunt events.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { makePolicy } from '../../tools/balance/policies';

const TICKS = 12_000;
const BUDGET_P95_MS = 2;

function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(0.95 * (s.length - 1))]!;
}

describe('Tick performance', () => {
  it(`step p95 <= ${BUDGET_P95_MS} ms over ${TICKS} Ticks with Bombs and Ghost Hunt`, () => {
    const cfg = DEFAULT_CONFIG;
    const policy = makePolicy('ghostHuntOpportunistic', { bombRadius: cfg.bombRadius });
    let run: Run = createRun(2026, cfg);
    run = { ...run, state: { ...run.state, lives: 1_000_000 } };
    // Warm-up (JIT) outside the measurement.
    for (let t = 0; t < 500; t++) run = step(run, policy(run.state)).run;

    const times: number[] = [];
    let bombs = 0;
    let hunts = 0;
    let levels = 0;
    for (let t = 0; t < TICKS; t++) {
      const input = policy(run.state);
      // Scripted detonations: grant and fire a Bomb every 400 Ticks.
      const scripted = t % 400 === 0 && run.state.phase === 'playing';
      if (scripted) run = { ...run, state: { ...run.state, bombs: Math.max(1, run.state.bombs) } };
      const t0 = performance.now();
      const r = step(run, { ...input, bomb: input.bomb || scripted });
      times.push(performance.now() - t0);
      for (const e of r.events) {
        if (e.t === 'BombDetonated') bombs++;
        if (e.t === 'GhostHuntStarted') hunts++;
        if (e.t === 'LevelStarted') levels++;
      }
      run = r.run;
      // Keep Ghost Hunts coming: re-arm a Ghost_Hunt item when none is left on the floor.
      if (t % 900 === 0 && run.state.phase === 'playing' && run.state.items.ghostHuntOnFloor === 0 && run.state.maze.ordinary.length > 0) {
        const s = run.state;
        const c = s.maze.ordinary[(t / 900) % s.maze.ordinary.length]!;
        const kinds = s.items.kinds.slice();
        if (kinds[c.y * s.maze.width + c.x] === 0) {
          kinds[c.y * s.maze.width + c.x] = 6;
          run = { ...run, state: { ...s, items: { ...s.items, kinds, ghostHuntOnFloor: 1 } } };
        }
      }
    }
    const p = p95(times);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    console.info(`tick perf: p95 ${p.toFixed(3)} ms, mean ${mean.toFixed(3)} ms, bombs ${bombs}, ghost hunts ${hunts}, levels ${levels}`);
    expect(times.length).toBeGreaterThanOrEqual(10_000);
    expect(bombs).toBeGreaterThan(0);
    expect(hunts).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(BUDGET_P95_MS);
  }, 300_000);
});

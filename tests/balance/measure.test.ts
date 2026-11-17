// Simulator measure mode (task 18.3).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { ALL_ON, FEATURE_KEYS, aggregate, configFor, planUnits, runUnit, runUnits, stripWisps } from '../../tools/balance/simulator';
import { createRun } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;

describe('balance measure', () => {
  it('feature toggles only change item counts', () => {
    const off = configFor(cfg, 'B0G0W0');
    expect(off.bombsPerLevel).toBe(0);
    expect(off.ghostHuntPerLevel).toBe(0);
    const { bombsPerLevel: _a, ghostHuntPerLevel: _b, ...restOff } = off;
    const { bombsPerLevel: _d, ghostHuntPerLevel: _e, ...restOn } = cfg;
    void [_a, _b, _d, _e];
    expect(restOff).toEqual(restOn);
    for (const k of FEATURE_KEYS) {
      const s = createRun(5, configFor(cfg, k)).state;
      if (k.includes('B0')) expect(s.maze.bombs).toHaveLength(0);
      if (k.includes('G0')) expect(s.maze.ghostHunt).toHaveLength(0);
    }
  });

  it('"Wisps off" strips the Wisps of the same Maze and leaves the Ordinary_Pellets identical', () => {
    const on = createRun(5, cfg);
    const off = stripWisps(on);
    expect(on.state.maze.wisps.length).toBeGreaterThan(0);
    expect(off.state.maze.wisps).toHaveLength(0);
    expect(off.state.items.wispsRemaining).toBe(0);
    expect(Array.from(off.state.items.kinds).some((k) => k === ItemKind.Wisp)).toBe(false);
    expect(off.state.maze.ordinary).toEqual(on.state.maze.ordinary);
    expect(off.state.items.ordinaryRemaining).toBe(on.state.items.ordinaryRemaining);
    expect(off.state.maze.tiles).toEqual(on.state.maze.tiles);
  });

  it('plans canonical units covering every level, Seed, policy and toggle', () => {
    const units = planUnits({ baseSeed: 10, n: 2, levels: [1, 5], policies: ['oneKey', 'threeKey'], toggles: ['B0G1W1'], togglePolicy: 'threeKey' });
    // per (level, seed): hunter + 2 policies on all-on, plus hunter + threeKey on the toggle
    expect(units).toHaveLength(2 * 2 * 5);
    const keys = units.map((u) => `${u.level}|${u.seed}|${u.features}|${u.kind}`);
    expect(new Set(keys).size).toBe(units.length);
    expect(units[0]).toEqual({ level: 1, seed: 10, features: 'B0G1W1', kind: 'hunter' });
  });

  it('runs the real step: the Hunter clears pellets and a policy rescues, giving a ratio', () => {
    const units = planUnits({ baseSeed: 3, n: 2, levels: [1], policies: ['threeKey'], toggles: [], togglePolicy: 'threeKey' });
    const results = runUnits(units, cfg);
    for (const r of results) {
      if (r.hunter) expect(r.hunter.pelletClearTicks).toBeGreaterThan(0);
      if (r.policy) expect(r.policy.rescueTicks).toBeGreaterThan(0);
    }
    const report = aggregate(results);
    const cs = report.stats[ALL_ON]!['1']!['threeKey']!;
    expect(cs.ratio).not.toBeNull();
    expect(cs.ratio!.count).toBe(2);
    expect(cs.ratio!.p5).toBeLessThanOrEqual(cs.ratio!.median);
    expect(report.pelletClear[ALL_ON]!['1']!.count).toBe(2);
  }, 120_000);

  it('a unit result is a pure function of the unit', () => {
    const u = { level: 5, seed: 42, features: ALL_ON, kind: 'bombAggressive' as const };
    expect(runUnit(u, cfg)).toEqual(runUnit(u, cfg));
  }, 60_000);
});

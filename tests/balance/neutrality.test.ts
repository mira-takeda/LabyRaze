// Post-baseline config neutrality (stabilization): the config fields added after the
// final 500-Seed baseline (1UP, celebrations, difficulty) do not change balance results
// at their default values, so the historical baseline stays valid without re-measurement.
// The consistency test strips exactly these fields for its legacy-hash comparison and
// pins each of them at the neutral value proven here.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { hunterBaseUnits } from '../../src/core/sim';
import { readBaseline } from '../../tools/balance/cli';
import type { PolicyName } from '../../tools/balance/policies';
import { planUnits, runUnits } from '../../tools/balance/simulator';

describe('post-baseline config neutrality', () => {
  it('1UP and celebrations on/off give identical balance results (check seeds, all levels x policies)', () => {
    const b = readBaseline();
    expect(b).not.toBeNull();
    const units = planUnits({
      baseSeed: 500_001,
      // All baseline levels x policies, two check seeds: the same comparison the checkpoint
      // probe ran over four seeds, sized so this permanent test fits the shared suite.
      n: 2,
      levels: b!.meta.levels,
      policies: b!.meta.policies as PolicyName[],
      toggles: [],
      togglePolicy: 'threeKey',
    });
    const on = runUnits(units, DEFAULT_CONFIG);
    const off = runUnits(units, {
      ...DEFAULT_CONFIG,
      oneUpThresholds: [],
      oneUpRepeat: 0,
      celebrationFirstLevel: 1_000_000_000,
      celebrationEvery: 1,
    });
    expect(on).toHaveLength(off.length);
    let maxScore = 0;
    for (let i = 0; i < on.length; i++) {
      expect(JSON.stringify(off[i])).toBe(JSON.stringify(on[i]));
      const s = on[i]!.policy?.contested.score ?? 0;
      if (s > maxScore) maxScore = s;
    }
    // 1UP can only trigger at the first threshold, which no balance bot reaches here.
    expect(maxScore).toBeLessThan(Math.min(...DEFAULT_CONFIG.oneUpThresholds));
    // ~180 s in isolation; the full suite saturates the CPU, so allow the same 300 s
    // budget the longest generation tests use (no change to seeds, units or assertions).
  }, 300_000);

  it('hunterSpeedPermille 1000 (NORMAL) is the exact identity for Squareman speed', () => {
    for (let lu = 1; lu <= 2000; lu++) {
      expect(hunterBaseUnits(lu, { hunterSpeedPermille: 1000 })).toBe(lu);
    }
    expect(DEFAULT_CONFIG.hunterSpeedPermille).toBe(1000);
  });
});

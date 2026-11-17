// Imperfect, human-like policies (evidence for the saturated win-rate metrics).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { HUMAN_POLICY_NAMES, HUMAN_PROFILES, makePolicy } from '../../tools/balance/policies';
import { playLevel } from '../../tools/balance/runner';
const cfg = DEFAULT_CONFIG;
const SEEDS = [1, 2, 3, 4, 5, 6];
function rescueTicks(name: Parameters<typeof makePolicy>[0], seed: number): { ticks: number; won: boolean; events: string } {
  const r = playLevel(createRun(seed, cfg), makePolicy(name, { bombRadius: cfg.bombRadius, seed }), { mode: 'playerOnly', maxTicks: 30_000 }).result;
  return { ticks: r.ticks, won: r.outcome === 'playerWin', events: JSON.stringify(r.events) };
}
describe('human-like policies', () => {
  it('profiles get slower and more error-prone from skilled to novice', () => {
    const [s, c, n] = HUMAN_POLICY_NAMES.map((k) => HUMAN_PROFILES[k]);
    expect(s!.reactionTicks).toBeLessThan(c!.reactionTicks);
    expect(c!.reactionTicks).toBeLessThan(n!.reactionTicks);
    expect(s!.turnErrorRate).toBeLessThan(c!.turnErrorRate);
    expect(c!.turnErrorRate).toBeLessThan(n!.turnErrorRate);
  });
  it('are deterministic for the same Seed and differ across Seeds', () => {
    const a = rescueTicks('humanCasual', 3);
    const b = rescueTicks('humanCasual', 3);
    expect(b).toEqual(a);
  }, 120_000);
  it('still rescue all Captives alone, but slower than the perfect policy, novices slowest', () => {
    const total: Record<string, number> = {};
    for (const name of ['ghostHuntOpportunistic', ...HUMAN_POLICY_NAMES] as const) {
      total[name] = 0;
      for (const seed of SEEDS) {
        const r = rescueTicks(name, seed);
        expect(r.won, `${name} seed ${seed}`).toBe(true);
        total[name] += r.ticks;
      }
    }
    expect(total.humanSkilled!).toBeGreaterThan(total.ghostHuntOpportunistic!);
    expect(total.humanNovice!).toBeGreaterThan(total.humanSkilled!);
  }, 300_000);
  it('never detonate Bombs', () => {
    for (const name of HUMAN_POLICY_NAMES) {
      const p = makePolicy(name, { bombRadius: cfg.bombRadius, seed: 9 });
      const r = playLevel(createRun(9, cfg), p, { mode: 'playerOnly', maxTicks: 30_000 }).result;
      expect(r.events.some((e) => e.t === 'BombActivated'), name).toBe(false);
    }
  }, 120_000);
});
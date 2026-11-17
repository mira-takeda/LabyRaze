// Door examples through `step` (task 17.8).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Input } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

function immortal(seed: number): Run {
  const r = createRun(seed, cfg);
  return { ...r, state: { ...r.state, lives: 1_000_000, player: { ...r.state.player, invulnerable: 1e9 } } };
}

describe('Doors through step', () => {
  it('every Door emits a warning before each state change after the first warn window', () => {
    for (const seed of [61, 62, 63]) {
      let run = immortal(seed);
      const initialInWindow = run.state.doors.map((d) => d.warning > 0);
      const changed = new Set<number>();
      const lastWarn = new Map<string, number>();
      for (let t = 0; t < 3000 && run.state.phase === 'playing'; t++) {
        const r = step(run, IDLE);
        const tick = r.run.state.tick;
        for (const e of r.events) {
          if (e.t === 'DoorWarning') lastWarn.set(`${e.doorIndex}:${e.open}`, tick);
          if (e.t === 'DoorChanged') {
            const first = !changed.has(e.doorIndex);
            changed.add(e.doorIndex);
            const w = lastWarn.get(`${e.doorIndex}:${e.open}`);
            if (first && initialInWindow[e.doorIndex] && w === undefined) continue; // warned in state only
            if (tick <= cfg.doorWarnTicks && w === undefined) continue;
            expect(w, `seed ${seed} door ${e.doorIndex} tick ${tick}`).toBeDefined();
            expect(tick - w!).toBeGreaterThanOrEqual(cfg.doorWarnTicks);
          }
        }
        run = r.run;
      }
      expect(changed.size).toBeGreaterThan(0);
    }
  }, 60_000);

  it('Squareman drops its committed route on the Tick of a Door change and recomputes', () => {
    for (const seed of [64, 65]) {
      let run = immortal(seed);
      let checked = 0;
      for (let t = 0; t < 3000 && run.state.phase === 'playing' && checked < 3; t++) {
        const r = step(run, IDLE);
        const doorChange = r.events.some((e: GameEvent) => e.t === 'DoorChanged');
        if (doorChange && run.state.hunter.respawnIn <= 0) {
          // The brain was notified this Tick: its target was cleared and re-chosen from scratch,
          // so it equals what a brain with no committed target decides on the same state.
          checked++;
          const fresh = step({ ...run, brain: { ...run.brain, target: -1 } }, IDLE);
          expect(r.run.brain).toEqual(fresh.run.brain);
          expect(r.run.state.hunter).toEqual(fresh.run.state.hunter);
        }
        run = r.run;
      }
      expect(checked).toBeGreaterThan(0);
    }
  }, 60_000);
});

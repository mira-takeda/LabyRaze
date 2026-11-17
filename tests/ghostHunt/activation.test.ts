// Property 37: Ghost Hunt activation, refresh and power neutrality (task 17.13).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { GameEvent } from '../../src/core/events';
import type { Input, Who } from '../../src/core/types';
import { arbSeed } from '../helpers/arbitraries';
import { freeCell, placeGhostHunt, playerArriving, withState } from './stepHelpers';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };

function startHunt(seed: number): { before: Run; after: ReturnType<typeof step> } {
  const run = createRun(seed, cfg);
  const at = run.state.maze.ghostHunt[0] ?? freeCell(run.state);
  let s = placeGhostHunt(run.state, at);
  s = playerArriving(s, at);
  s = { ...s, player: { ...s.player, invulnerable: 10_000 } };
  const before = withState(run, s);
  return { before, after: step(before, IDLE) };
}

function powerEventsFor(events: readonly GameEvent[], who: Who): boolean {
  return events.some(
    (e) =>
      (e.t === 'PowerStarted' || e.t === 'PowerEnded' || e.t === 'PowerDenied') && e.who === who ||
      e.t === 'RoleReversed' ||
      (e.t === 'PelletCollected' && e.kind === 'power'),
  );
}

describe('Property 37: Ghost Hunt activation, refresh and power neutrality', () => {
  it('activates on the pickup Tick with the full duration and all three allies staggered at the entrance', () => {
    for (const seed of [71, 72, 73]) {
      const { before, after } = startHunt(seed);
      const s = after.run.state;
      expect(after.events).toContainEqual({ t: 'GhostHuntStarted', refresh: false, ticks: cfg.ghostHuntTicks });
      expect(s.ghostHunt.ticksLeft).toBe(cfg.ghostHuntTicks);
      s.ghostHunt.allies.forEach((a, i) => {
        expect(a.mode).toBe('hunting');
        expect(a.cell).toEqual(s.maze.cage.entrance);
        expect(a.spawnIn).toBe(i * cfg.allyStaggerTicks);
      });
      // No inventory or rescue field changes.
      expect(s.bombs).toBe(before.state.bombs);
      expect(s.carriedKeys).toBe(before.state.carriedKeys);
      expect(s.captives).toEqual(before.state.captives);
      expect(s.items.keys).toEqual(before.state.items.keys);
      expect(s.items.ghostHuntOnFloor).toBe(before.state.items.ghostHuntOnFloor - 1);
    }
  });

  it('a second pickup while active restarts the duration (refresh)', () => {
    const { after } = startHunt(74);
    let run = after.run;
    for (let t = 0; t < 100; t++) run = step(run, IDLE).run;
    expect(run.state.ghostHunt.ticksLeft).toBe(cfg.ghostHuntTicks - 100);
    const at = freeCell(run.state, [run.state.player.cell]);
    let s = placeGhostHunt(run.state, at);
    s = playerArriving(s, at);
    const r = step(withState(run, s), IDLE);
    expect(r.events).toContainEqual({ t: 'GhostHuntStarted', refresh: true, ticks: cfg.ghostHuntTicks });
    expect(r.run.state.ghostHunt.ticksLeft).toBe(cfg.ghostHuntTicks);
  });

  it('a pickup while allies are still returning counts as a refresh', () => {
    const short = { ...cfg, ghostHuntTicks: 60 };
    const run0 = createRun(75, short);
    const at = freeCell(run0.state);
    let s = playerArriving(placeGhostHunt(run0.state, at), at);
    s = { ...s, player: { ...s.player, invulnerable: 10_000 } };
    let run = step(withState(run0, s), IDLE).run;
    while (run.state.ghostHunt.ticksLeft > 0) run = step(run, IDLE).run;
    if (run.state.ghostHunt.allies.some((a) => a.mode === 'returning')) {
      const at2 = freeCell(run.state, [run.state.player.cell, at]);
      const s2 = playerArriving(placeGhostHunt(run.state, at2), at2);
      const r = step(withState(run, s2), IDLE);
      expect(r.events).toContainEqual({ t: 'GhostHuntStarted', refresh: true, ticks: short.ghostHuntTicks });
    }
  });

  it('power fields change only through the power rules while the hunt is active', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const { after } = startHunt(seed);
        let run = after.run;
        while (run.state.ghostHunt.ticksLeft > 0 && run.state.phase === 'playing') {
          const prev = run.state;
          const r = step(run, IDLE);
          const s = r.run.state;
          for (const who of ['player', 'hunter'] as const) {
            if (!powerEventsFor(r.events, who)) {
              expect(s[who].power, `${who} power at tick ${s.tick}`).toBe(Math.max(0, prev[who].power - 1));
            }
          }
          expect(s.player.power > 0 && s.hunter.power > 0).toBe(false);
          run = r.run;
        }
      }),
      { numRuns: 15 },
    );
  }, 120_000);
});

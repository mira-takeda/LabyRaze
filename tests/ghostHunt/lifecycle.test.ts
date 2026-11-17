import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { emptyGhostHunt, stepGhostHunt } from '../../src/core/ghostHunt';
import type { GhostHuntCommand } from '../../src/core/ghostHunt';
import type { GhostHuntEvent } from '../../src/core/events';
import type { GhostHuntState, GhostHuntView } from '../../src/core/types';
import { buildState, cageMaze } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const maze = cageMaze();
const base = buildState(maze);

function viewOf(rescued: [boolean, boolean, boolean]): GhostHuntView {
  return {
    walls: base.walls,
    doors: base.doors,
    derived: base.derived,
    hunter: base.hunter,
    playerCell: base.player.cell,
    cage: maze.cage,
    tick: 0,
    rescued,
  };
}

const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;
const inCageInterior = (c: { x: number; y: number }) => maze.cage.interior.some((i) => sameCell(i, c));

function run(gh: GhostHuntState, view: GhostHuntView, ticks: number): { gh: GhostHuntState; events: GhostHuntEvent[] } {
  const events: GhostHuntEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = stepGhostHunt(gh, view, cfg);
    gh = r.gh;
    events.push(...r.events);
  }
  return { gh, events };
}

// Property simulations are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Ghost Hunt lifecycle', () => {
  it('start spawns 3 allies from the entrance, staggered, with ticksLeft', () => {
    const view = viewOf([false, false, false]);
    const r = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true });
    expect(r.gh.ticksLeft).toBe(cfg.ghostHuntTicks);
    expect(r.gh.allies.map((a) => a.mode)).toEqual(['hunting', 'hunting', 'hunting']);
    expect(r.gh.allies.map((a) => a.spawnIn)).toEqual([0, cfg.allyStaggerTicks, 2 * cfg.allyStaggerTicks]);
    for (const a of r.gh.allies) expect(a.cell).toEqual(maze.cage.entrance);
    expect(r.events).toEqual([{ t: 'GhostHuntStarted', refresh: false, ticks: cfg.ghostHuntTicks }]);
  });

  it('stagger counts down while held at the entrance', () => {
    const view = viewOf([false, false, false]);
    let gh = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true }).gh;
    gh = run(gh, view, cfg.allyStaggerTicks).gh;
    expect(gh.allies.map((a) => a.spawnIn)).toEqual([0, 0, cfg.allyStaggerTicks]);
  });

  it('refresh restarts the duration', () => {
    const view = viewOf([false, false, false]);
    let gh = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true }).gh;
    gh = run(gh, view, 100).gh;
    expect(gh.ticksLeft).toBe(cfg.ghostHuntTicks - 100);
    const r = stepGhostHunt(gh, view, cfg, { pickup: true });
    expect(r.gh.ticksLeft).toBe(cfg.ghostHuntTicks);
    expect(r.events).toEqual([{ t: 'GhostHuntStarted', refresh: true, ticks: cfg.ghostHuntTicks }]);
  });

  it('at expiry rescued allies leave, imprisoned allies return, never back into the cage for rescued', () => {
    const view = viewOf([true, false, true]);
    let gh = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true }).gh;
    const r = run(gh, view, cfg.ghostHuntTicks - 1);
    gh = r.gh;
    expect(gh.ticksLeft).toBe(1);
    const end = stepGhostHunt(gh, view, cfg);
    expect(end.events).toEqual([{ t: 'GhostHuntEnded', reason: 'expired' }]);
    expect(end.gh.ticksLeft).toBe(0);
    expect(end.gh.allies.map((a) => a.mode)).toEqual(['leaving', 'returning', 'leaving']);
    expect(end.gh.allies[0]?.leaveIn).toBe(cfg.allyLeaveTicks);

    const after = run(end.gh, view, cfg.allyLeaveTicks + 5).gh;
    expect(after.allies.every((a) => a.mode === 'inactive')).toBe(true);
    expect(inCageInterior(after.allies[0]!.cell)).toBe(false);
    expect(inCageInterior(after.allies[2]!.cell)).toBe(false);
    expect(inCageInterior(after.allies[1]!.cell)).toBe(true); // captive back in its cage
  });

  it('pickup while returning switches allies back to hunting', () => {
    const view = viewOf([false, false, false]);
    const gh: GhostHuntState = {
      ticksLeft: 0,
      allies: emptyGhostHunt(maze.cage.entrance).allies.map((a) => ({ ...a, mode: 'returning' as const })) as GhostHuntState['allies'],
    };
    const r = stepGhostHunt(gh, view, cfg, { pickup: true });
    expect(r.gh.allies.map((a) => a.mode)).toEqual(['hunting', 'hunting', 'hunting']);
    expect(r.events[0]).toMatchObject({ t: 'GhostHuntStarted', refresh: true });
  });

  it('level-end cleanup resets to inactive and emits once', () => {
    const view = viewOf([true, false, false]);
    let gh = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true }).gh;
    gh = run(gh, view, 30).gh;
    const r = stepGhostHunt(gh, view, cfg, { levelEnd: true });
    expect(r.gh).toEqual(emptyGhostHunt(maze.cage.entrance));
    expect(r.events).toEqual([{ t: 'GhostHuntEnded', reason: 'levelEnd' }]);
    expect(stepGhostHunt(r.gh, view, cfg, { levelEnd: true }).events).toEqual([]);
  });

  it('is deterministic and does not mutate its input', () => {
    const view = viewOf([true, true, false]);
    const gh = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true }).gh;
    const snap = structuredClone(gh);
    stepGhostHunt(gh, view, cfg);
    expect(gh).toEqual(snap);
  });
});

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

describe('Ghost Hunt never touches rescue state (property)', () => {
  it('random start/refresh/tick/levelEnd leaves rescue flags unchanged and rescued allies out of the cage', () => {
    // **Validates: Requirements 29.9, 29.10, 29.11, 29.12, 29.14**
    const cmdArb = fc.constantFrom<'start' | 'tick' | 'levelEnd'>('start', 'tick', 'tick', 'tick', 'levelEnd');
    fc.assert(
      fc.property(
        fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
        fc.array(fc.tuple(cmdArb, fc.integer({ min: 1, max: 200 })), { minLength: 1, maxLength: 25 }),
        (flags, ops) => {
          const rescued = deepFreeze([...flags] as [boolean, boolean, boolean]);
          const before = structuredClone(rescued);
          // the view is frozen shallowly (its typed arrays cannot be frozen); rescued is deep-frozen
          const view = Object.freeze({ ...viewOf(rescued), cage: deepFreeze(structuredClone(maze.cage)) });
          // every input to stepGhostHunt except the evolving state is frozen
          const frozenCfg = deepFreeze({ ...cfg });
          let gh = deepFreeze(emptyGhostHunt(maze.cage.entrance));
          for (const [op, n] of ops) {
            const count = op === 'tick' ? n : 1;
            for (let i = 0; i < count; i++) {
              const cmd: GhostHuntCommand = op === 'start' ? { pickup: true } : op === 'levelEnd' ? { levelEnd: true } : {};
              gh = deepFreeze(stepGhostHunt(gh, view, frozenCfg, deepFreeze(cmd)).gh);
              gh.allies.forEach((a, idx) => {
                if (!rescued[idx]) return;
                // a rescued Kiro is never imprisoned again
                expect(a.mode).not.toBe('returning');
                expect(inCageInterior(a.cell)).toBe(false);
              });
            }
          }
          expect(rescued).toEqual(before);
          expect(view.rescued).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});

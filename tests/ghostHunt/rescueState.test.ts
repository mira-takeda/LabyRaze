import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { stepGhostHunt } from '../../src/core/ghostHunt';
import type { GhostHuntCommand } from '../../src/core/ghostHunt';
import { resolveCollisions, resolveRescue } from '../../src/core/rules';
import { CageInterior, Floor } from '../../src/core/types';
import type { Cell, GameState, GhostHuntState, GhostHuntView } from '../../src/core/types';
import { buildState, cageMaze } from '../helpers/fixtures';

// Feature: kirobit-halloween-maze, Property 38: Ghost Hunt never changes Captives or Carried_Keys
// **Validates: Requirements 29.11, 29.12, 31.5**

const cfg: GameConfig = { ...DEFAULT_CONFIG, ghostHuntTicks: 40 };
const maze = cageMaze();
const entrance = maze.cage.entrance;
const floors: Cell[] = [];
for (let y = 0; y < maze.height; y++) {
  for (let x = 0; x < maze.width; x++) if (maze.tiles[y * maze.width + x] === Floor) floors.push({ x, y });
}
const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const inCage = (c: Cell): boolean => maze.tiles[c.y * maze.width + c.x] === CageInterior;
const rescuedCount = (s: GameState): number => s.captives.filter(Boolean).length;

type Step = { k: 'tick' | 'pickup' | 'levelEnd' | 'rescue'; n: number };
const stepArb: fc.Arbitrary<Step> = fc.record({
  k: fc.constantFrom('tick', 'tick', 'tick', 'pickup', 'levelEnd', 'rescue'),
  n: fc.integer({ min: 1, max: 30 }),
});
const scenarioArb = fc.record({
  rescued: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
  keys: fc.integer({ min: 0, max: 3 }),
  hunter: fc.integer({ min: 0, max: floors.length - 1 }),
  hunterRespawn: fc.constantFrom(0, 0, 30),
  steps: fc.array(stepArb, { minLength: 1, maxLength: 25 }),
  allowRescue: fc.boolean(),
});

function viewOf(s: GameState): GhostHuntView {
  return {
    walls: s.walls,
    doors: s.doors,
    derived: s.derived,
    hunter: s.hunter,
    playerCell: s.player.cell,
    cage: maze.cage,
    tick: s.tick,
    nav: { width: maze.width, height: maze.height, doors: maze.doors, wrapPairs: maze.wrapPairs },
    hunterStart: maze.hunterStart,
    rescued: [s.captives[0], s.captives[1], s.captives[2]],
  };
}

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

function initial(sc: Scenario): GameState {
  const base = buildState(maze);
  return {
    ...base,
    captives: [sc.rescued[0], sc.rescued[1], sc.rescued[2]],
    carriedKeys: sc.keys,
    // Player parked on the Cage entrance, never edible (collisions are not under test here).
    player: { ...base.player, cell: { ...entrance }, invulnerable: 1_000_000 },
    hunter: {
      ...base.hunter,
      cell: { ...floors[sc.hunter]! },
      respawnIn: sc.hunterRespawn,
      invulnerable: sc.hunterRespawn,
    },
  };
}

// Everything except hunter, score and ghostHunt (large static members are identity-checked elsewhere).
const restOf = (s: GameState): unknown => ({
  ...s,
  maze: null,
  walls: s.walls.version,
  items: null,
  doors: null,
  derived: null,
  hunter: null,
  score: null,
  ghostHunt: null,
});

function checkAllies(gh: GhostHuntState, s: GameState): void {
  gh.allies.forEach((a, i) => {
    if (!s.captives[i]) return;
    expect(a.mode).not.toBe('returning');
    expect(inCage(a.cell)).toBe(false);
    if (a.next) expect(inCage(a.next)).toBe(false);
  });
}

/** One simulation; returns the final state, whether the effect was cleaned up by levelEnd, and who returned. */
function simulate(sc: Scenario): { s: GameState; cleaned: boolean; returned: boolean[] } {
  let s = initial(sc);
  let cleaned = true;
  const returned = [false, false, false];

  const tickOnce = (cmd: GhostHuntCommand): void => {
    const keysBefore = s.carriedKeys;
    const capBefore = structuredClone(s.captives);
    const countBefore = rescuedCount(s);

    const r = stepGhostHunt(s.ghostHunt, viewOf(s), cfg, cmd);
    // (1) Ghost Hunt itself changes neither captives, rescued count nor carriedKeys.
    expect(s.captives).toEqual(capBefore);
    expect(rescuedCount(s)).toBe(countBefore);
    expect(s.carriedKeys).toBe(keysBefore);
    // Every GhostHuntEvent is a ghost-hunt event, never a Rescue.
    for (const e of r.events) expect(['GhostHuntStarted', 'GhostHuntEnded']).toContain(e.t);
    s = { ...s, ghostHunt: r.gh, tick: s.tick + 1 };
    r.gh.allies.forEach((a, i) => {
      if (a.mode === 'returning') returned[i] = true;
    });
    checkAllies(r.gh, s); // (2)

    // (4) Ally catches go through resolveCollisions: only hunter, score and events change.
    const preCollision = structuredClone(restOf(s));
    const cr = resolveCollisions(s, null, cfg, r.catches);
    expect(restOf(cr.state)).toEqual(preCollision);
    expect(cr.state.captives).toEqual(capBefore);
    expect(cr.state.carriedKeys).toBe(keysBefore);
    for (const e of cr.events) expect(e.t).not.toBe('CaptiveReleased');
    s = cr.state;
    s = { ...s, hunter: { ...s.hunter, respawnIn: Math.max(0, s.hunter.respawnIn - 1), invulnerable: Math.max(0, s.hunter.invulnerable - 1) } };
  };

  for (const st of sc.steps) {
    if (st.k === 'pickup') {
      cleaned = false;
      tickOnce({ pickup: true });
    } else if (st.k === 'levelEnd') {
      cleaned = true;
      tickOnce({ levelEnd: true });
    } else if (st.k === 'rescue') {
      if (sc.allowRescue) {
        const before = s.ghostHunt;
        const rr = resolveRescue(s, cfg);
        s = rr.state;
        expect(s.ghostHunt).toBe(before); // Rescue never touches Ghost Hunt state
        if (s.phase === 'levelEnd') {
          cleaned = true;
          tickOnce({ levelEnd: true });
          s = { ...s, phase: 'playing', outcome: null }; // next level begins; keep exercising
        }
      }
    } else {
      for (let i = 0; i < st.n; i++) tickOnce({});
    }
  }
  // Let any effect finish naturally (expiry, returning, leaving).
  for (let i = 0; i < 1000 && !cleaned; i++) {
    // A final Rescue changes the read-only view without changing Ghost Hunt state.
    // Let its owner observe that change once, even if the old allies were already inactive.
    if (i > 0 && s.ghostHunt.ticksLeft === 0 && s.ghostHunt.allies.every((a) => a.mode === 'inactive')) break;
    tickOnce({});
  }
  return { s, cleaned, returned };
}

// Property simulations are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Feature: kirobit-halloween-maze, Property 38: Ghost Hunt never changes Captives or Carried_Keys', () => {
  it.each([40, 700])('rescue after %i ticks cannot leave a returning or inactive ally inside the cage', (ticks) => {
    // Deterministic regression from fast-check seed -1398346137. Cover both a return in
    // progress and one already completed before the captive is rescued.
    simulate({ rescued: [false, false, false], keys: 1, hunter: 0, hunterRespawn: 0,
      allowRescue: true, steps: [{ k: 'pickup', n: 1 }, { k: 'tick', n: ticks },
        { k: 'rescue', n: 1 }, { k: 'tick', n: 1 }] });
  });

  it('observes a final rescue even when the old effect had already finished', () => {
    simulate({ rescued: [false, false, false], keys: 1, hunter: 0, hunterRespawn: 0,
      allowRescue: true, steps: [{ k: 'pickup', n: 1 }, { k: 'tick', n: 700 }, { k: 'rescue', n: 1 }] });
  });
  it('rescue state is preserved, rescued Kiros are never re-imprisoned, captives return to the cage', () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => {
        const { s, cleaned, returned } = simulate(sc);
        s.ghostHunt.allies.forEach((a, i) => {
          expect(a.mode).toBe('inactive'); // (3)
          if (s.captives[i]) {
            expect(inCage(a.cell)).toBe(false);
          } else if (!cleaned && returned[i]) {
            expect(inCage(a.cell)).toBe(true);
          }
        });
      }),
      { numRuns: 100 },
    );
  }, 120_000);

  it('without Rescue events the captives, count and carriedKeys end identical to the start', () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => {
        const start = initial({ ...sc, allowRescue: false });
        const { s } = simulate({ ...sc, allowRescue: false });
        expect(s.captives).toEqual(start.captives);
        expect(rescuedCount(s)).toBe(rescuedCount(start));
        expect(s.carriedKeys).toBe(start.carriedKeys);
      }),
      { numRuns: 60 },
    );
  }, 120_000);

  it('Rescue at the Cage entrance still works during Ghost Hunt', () => {
    let s = buildState(maze, { over: { carriedKeys: 2 } });
    s = { ...s, player: { ...s.player, cell: { ...entrance }, invulnerable: 1_000_000 } };
    const started = stepGhostHunt(s.ghostHunt, viewOf(s), cfg, { pickup: true });
    s = { ...s, ghostHunt: started.gh };
    for (let i = 0; i < 5; i++) {
      const r = stepGhostHunt(s.ghostHunt, viewOf(s), cfg);
      s = { ...s, ghostHunt: r.gh };
    }
    expect(s.ghostHunt.ticksLeft).toBeGreaterThan(0);
    const rr = resolveRescue(s, cfg);
    expect(rr.state.captives).toEqual([true, true, false]);
    expect(rr.state.carriedKeys).toBe(0);
    expect(rr.events.filter((e) => e.t === 'CaptiveReleased')).toHaveLength(2);
    s = rr.state;
    // Hunt continues; at expiry the newly rescued allies leave, the imprisoned one returns.
    let sawReturning = false;
    for (let i = 0; i < 800; i++) {
      const r = stepGhostHunt(s.ghostHunt, viewOf(s), cfg);
      s = { ...s, ghostHunt: r.gh };
      r.gh.allies.forEach((a, k) => {
        if (s.captives[k]) {
          expect(a.mode).not.toBe('returning');
          expect(inCage(a.cell)).toBe(false);
        } else if (a.mode === 'returning') sawReturning = true;
      });
    }
    expect(sawReturning).toBe(true);
    expect(s.captives).toEqual([true, true, false]);
    expect(inCage(s.ghostHunt.allies[2].cell)).toBe(true);
    expect(same(s.ghostHunt.allies[0].cell, entrance) || !inCage(s.ghostHunt.allies[0].cell)).toBe(true);
  });
});

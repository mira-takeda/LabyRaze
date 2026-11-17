// Selectable difficulty (task 40.1, Requirement 36): hunterSpeedPermille scales only Squareman's speed.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, validateConfig } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { unitsPerTick } from '../../src/core/progression';
import { createRun, hunterBaseUnits, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Dir, GameState, Input } from '../../src/core/types';

const IDLE: Input = { pressed: null, bomb: false, continue: false };
const DIRS: Dir[] = ['up', 'down', 'left', 'right'] as Dir[];
const withP = (permille: number, base: GameConfig = DEFAULT_CONFIG): GameConfig => ({ ...base, hunterSpeedPermille: permille });

function atLevel(run: Run, level: number): Run {
  return { ...run, progression: { ...run.progression, levelNumber: level }, state: { ...run.state, levelNumber: level } };
}

/** Squareman's progress after the first Tick in which he starts a step from a boundary (= units per Tick). */
function hunterUnitsMeasured(cfg: GameConfig, level: number): number {
  let run = atLevel(createRun(11, cfg), level);
  for (let i = 0; i < 300; i++) {
    run = step(run, IDLE).run;
    const h = run.state.hunter;
    if (h.next !== null && h.progress > 0) return h.progress;
  }
  throw new Error('Squareman never moved');
}

/** The Player's progress after the first Tick of a step from the start Cell. */
function playerUnitsMeasured(cfg: GameConfig, level: number): number {
  const base = atLevel(createRun(11, cfg), level);
  for (const d of DIRS) {
    const r = step(base, { ...IDLE, pressed: d }).run.state.player;
    if (r.next !== null) return r.progress;
  }
  throw new Error('Player could not move');
}

describe('hunterSpeedPermille config', () => {
  it('defaults to 1000 and validates as an integer in 500..2000', () => {
    expect(DEFAULT_CONFIG.hunterSpeedPermille).toBe(1000);
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
    for (const ok of [500, 1000, 1150, 1250, 2000]) {
      expect(validateConfig(withP(ok)).filter((p) => p.includes('hunterSpeedPermille'))).toEqual([]);
    }
    for (const bad of [499, 2001, 1000.5, Number.NaN, -1, 0]) {
      expect(validateConfig(withP(bad)).some((p) => p.includes('hunterSpeedPermille'))).toBe(true);
    }
  });
});

describe('Squareman speed multiplier', () => {
  it('exact units per Tick at levels 1, 5, 10, 20, 40 for 1000/1150/1250; the Player is unchanged', () => {
    for (const level of [1, 5, 10, 20, 40]) {
      const lu = unitsPerTick(level, DEFAULT_CONFIG);
      for (const p of [1000, 1150, 1250]) {
        const cfg = withP(p);
        const expected = Math.round((lu * p) / 1000);
        expect(hunterBaseUnits(lu, cfg)).toBe(expected);
        expect(hunterUnitsMeasured(cfg, level)).toBe(expected);
        expect(playerUnitsMeasured(cfg, level)).toBe(lu);
      }
    }
  });

  it('NORMAL (explicit 1000) is identical to the default config Tick by Tick, with random inputs', () => {
    // **Validates: Requirement 36 (NORMAL unchanged)**
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100000 }), fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 300, maxLength: 300 }), (seed, ins) => {
        let a = createRun(seed, DEFAULT_CONFIG);
        let b = createRun(seed, withP(1000));
        for (const i of ins) {
          const input: Input = { pressed: i === 4 ? null : DIRS[i]!, bomb: i === 3, continue: false };
          const ra = step(a, input);
          const rb = step(b, input);
          a = ra.run;
          b = rb.run;
          expect(rb.run.state).toEqual(ra.run.state);
          expect(rb.events).toEqual(ra.events);
        }
      }),
      { numRuns: 20 },
    );
  }, 120_000);

  it('a 1150 config really differs from the default', () => {
    let a = createRun(5, DEFAULT_CONFIG);
    let b = createRun(5, withP(1150));
    for (let i = 0; i < 240; i++) {
      a = step(a, IDLE).run;
      b = step(b, IDLE).run;
    }
    expect(b.state.hunter).not.toEqual(a.state.hunter);
  });
});

/** Puts a Wisp under the Player so the next Tick scores wispPoints, with the score just below 10000. */
function wispNearOneUp(run: Run): Run {
  const s = run.state;
  const kinds = s.items.kinds.slice();
  kinds[s.player.cell.y * s.maze.width + s.player.cell.x] = ItemKind.Wisp;
  const state: GameState = {
    ...s,
    items: { ...s.items, kinds, wispsRemaining: s.items.wispsRemaining + 1 },
    comboCount: 1,
    comboTicksLeft: 0,
    score: 9990,
  };
  return { ...run, state };
}

describe('cheat lives and 1UP at higher difficulties', () => {
  it('30 starting lives and a 1UP award work at 1150 and 1250', () => {
    for (const p of [1150, 1250]) {
      const normal = step(wispNearOneUp(createRun(6, withP(p))), IDLE);
      expect(normal.run.state.lives).toBe(DEFAULT_CONFIG.livesInitial + 1);
      expect(normal.events.filter((e) => e.t === 'ExtraLife')).toHaveLength(1);
      const cheatCfg = withP(p, { ...DEFAULT_CONFIG, livesInitial: 30 });
      const cheat = createRun(6, cheatCfg);
      expect(cheat.state.lives).toBe(30);
      const r = step(wispNearOneUp(cheat), IDLE);
      expect(r.run.state.lives).toBe(31);
      expect(r.run.state.oneUpsAwarded).toBe(1);
    }
  });
});

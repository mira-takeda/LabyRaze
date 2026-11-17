import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import { buildHud, type HudModel } from '../../src/core/hud';
import { levelSpeedFactor } from '../../src/core/progression';
import type { GameState } from '../../src/core/types';
import { cageState, corridorState } from '../helpers/fixtures';

function withOver(base: GameState, over: Partial<GameState>): GameState {
  return { ...base, ...over };
}

function withChars(base: GameState, p: Partial<GameState['player']>, h: Partial<GameState['hunter']>): GameState {
  return { ...base, player: { ...base.player, ...p }, hunter: { ...base.hunter, ...h } };
}

function fractions(h: HudModel): number[] {
  return [
    h.combo.windowFraction,
    h.player.powerFraction,
    h.player.speedFraction,
    h.hunter.powerFraction,
    h.hunter.speedFraction,
    h.ghostHunt.fraction,
    h.urgency,
  ];
}

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === 'object' && !ArrayBuffer.isView(o) && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

describe('buildHud values', () => {
  it('reports plain state values', () => {
    const base = cageState({ levelNumber: 4 });
    const s = withOver(base, {
      lives: 2,
      score: 750,
      carriedKeys: 2,
      captives: [true, false, true],
      comboCount: 3,
      comboTicksLeft: cfg.comboWindowTicks / 2,
    });
    const h = buildHud(s, cfg);
    expect(h.lives).toBe(2);
    expect(h.score).toBe(750);
    expect(h.level).toBe(4);
    expect(h.speedFactor).toBe(levelSpeedFactor(4, cfg));
    expect(h.carriedKeys).toBe(2);
    expect(h.rescued).toBe(2);
    expect(h.rescuedTotal).toBe(3);
    expect(h.pelletsRemaining).toBe(s.items.ordinaryRemaining);
    expect(h.pelletsTotal).toBe(s.maze.ordinary.length);
    expect(h.combo.multiplier).toBe(3);
    expect(h.combo.windowFraction).toBeCloseTo(0.5);
  });

  it('has no holder, no blink and no ghost hunt on a fresh state', () => {
    const h = buildHud(corridorState(), cfg);
    expect(h.powerHolder).toBeNull();
    expect(h.player.blink).toBe(false);
    expect(h.hunter.blink).toBe(false);
    expect(h.ghostHunt.active).toBe(false);
    expect(h.ghostHunt.secondsLeft).toBe(0);
    expect(h.combo.windowFraction).toBe(0);
  });

  it('converts ticks to seconds and fractions for power, speed and ghost hunt', () => {
    const base = cageState();
    const s = withChars(
      { ...base, ghostHunt: { ...base.ghostHunt, ticksLeft: cfg.ghostHuntTicks / 2 } },
      { power: cfg.powerTicks / 2, speed: cfg.speedDurationTicks },
      { speed: cfg.speedDurationTicks / 4 },
    );
    const h = buildHud(s, cfg);
    expect(h.player.powerSeconds).toBeCloseTo(cfg.powerTicks / 2 / cfg.tickRate);
    expect(h.player.powerFraction).toBeCloseTo(0.5);
    expect(h.player.speedFraction).toBe(1);
    expect(h.player.speedActive).toBe(true);
    expect(h.hunter.speedFraction).toBeCloseTo(0.25);
    expect(h.hunter.powerSeconds).toBe(0);
    expect(h.ghostHunt.active).toBe(true);
    expect(h.ghostHunt.secondsLeft).toBeCloseTo(cfg.ghostHuntTicks / 2 / cfg.tickRate);
    expect(h.ghostHunt.fraction).toBeCloseTo(0.5);
  });

  it.each([0, 1, 2, 3])('shows %i filled bomb slots', (n) => {
    const h = buildHud(withOver(cageState(), { bombs: n }), cfg);
    expect(h.bombs.filled).toEqual([n >= 1, n >= 2, n >= 3]);
    expect(h.bombs.filled.filter(Boolean)).toHaveLength(n);
  });

  it('keeps the rescued count unchanged during Ghost Hunt', () => {
    const base = withOver(cageState(), { captives: [true, false, false], carriedKeys: 1 });
    const before = buildHud(base, cfg);
    const hunting = { ...base, ghostHunt: { ...base.ghostHunt, ticksLeft: 300 } };
    const during = buildHud(hunting, cfg);
    expect(during.ghostHunt.active).toBe(true);
    expect(during.rescued).toBe(before.rescued);
    expect(during.rescued).toBe(1);
    expect(during.carriedKeys).toBe(before.carriedKeys);
  });

  it('blinks only the power holder', () => {
    const p = buildHud(withChars(cageState(), { power: 10 }, {}), cfg);
    expect(p.powerHolder).toBe('player');
    expect(p.player.blink).toBe(true);
    expect(p.hunter.blink).toBe(false);
    const q = buildHud(withChars(cageState(), {}, { power: 10 }), cfg);
    expect(q.powerHolder).toBe('hunter');
    expect(q.hunter.blink).toBe(true);
    expect(q.player.blink).toBe(false);
    // Speed alone never blinks.
    const r = buildHud(withChars(cageState(), { speed: 50 }, {}), cfg);
    expect(r.player.blink).toBe(false);
  });

  it('raises urgency with level and with fewer pellets remaining', () => {
    const lo = buildHud(cageState({ levelNumber: 1 }), cfg).urgency;
    const hiLevel = buildHud(cageState({ levelNumber: 40 }), cfg).urgency;
    expect(hiLevel).toBeGreaterThan(lo);
    const base = cageState();
    const total = base.maze.ordinary.length;
    if (total > 0) {
      const eaten = withOver(base, { items: { ...base.items, ordinaryRemaining: 0 } });
      expect(buildHud(eaten, cfg).urgency).toBeGreaterThan(lo);
    }
  });

  it('exposes wisp progress, combo tier, tier fraction and chain points', () => {
    const b0 = cageState();
    const total = 5;
    const base = withOver(b0, {
      maze: { ...b0.maze, wisps: Array.from({ length: total }, (_, i) => ({ x: i, y: 0 })) },
      items: { ...b0.items, wispsRemaining: total },
    });
    const s = withOver(base, {
      comboCount: 3,
      comboTicksLeft: 30,
      comboChainPoints: 120,
      items: { ...base.items, wispsRemaining: total - 2 },
    });
    const h = buildHud(s, cfg);
    expect(h.wisps).toEqual({ collected: 2, total });
    expect(h.combo.tier).toBe(3);
    expect(h.combo.cap).toBe(cfg.comboCap);
    expect(h.combo.tierFraction).toBeCloseTo(2 / (cfg.comboCap - 1));
    expect(h.combo.chainPoints).toBe(120);
    expect(h.pelletsRemaining).toBe(s.items.ordinaryRemaining);
    // No open window: chain points read 0.
    expect(buildHud({ ...s, comboTicksLeft: 0 }, cfg).combo.chainPoints).toBe(0);
  });

  it('is deterministic', () => {
    const s = withOver(cageState({ levelNumber: 7 }), { bombs: 2, comboCount: 2, comboTicksLeft: 40 });
    expect(buildHud(s, cfg)).toEqual(buildHud(s, cfg));
  });
});

describe('buildHud properties', () => {
  // **Validates: Requirements 7.7, 13.2, 13.3, 28.16**
  it('never mutates a frozen state and keeps every fraction in [0, 1]', () => {
    const arbState = fc
      .record({
        level: fc.integer({ min: 1, max: 500 }),
        bombs: fc.integer({ min: 0, max: 3 }),
        lives: fc.integer({ min: 0, max: 9 }),
        keys: fc.integer({ min: 0, max: 3 }),
        captives: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
        pPower: fc.integer({ min: 0, max: cfg.powerTicks }),
        hPower: fc.integer({ min: 0, max: cfg.powerTicks }),
        pSpeed: fc.integer({ min: 0, max: cfg.speedDurationTicks }),
        hSpeed: fc.integer({ min: 0, max: cfg.speedDurationTicks }),
        gh: fc.integer({ min: 0, max: cfg.ghostHuntTicks }),
        combo: fc.integer({ min: 1, max: cfg.comboCap }),
        comboLeft: fc.integer({ min: 0, max: cfg.comboWindowTicks }),
        remaining: fc.integer({ min: 0, max: 400 }),
        fixture: fc.boolean(),
      })
      .map((r) => {
        const base = r.fixture ? cageState({ levelNumber: r.level }) : corridorState({ levelNumber: r.level });
        const s = withChars(
          {
            ...base,
            bombs: r.bombs,
            lives: r.lives,
            carriedKeys: r.keys,
            captives: r.captives,
            comboCount: r.combo,
            comboTicksLeft: r.comboLeft,
            items: { ...base.items, ordinaryRemaining: Math.min(r.remaining, base.maze.ordinary.length) },
            ghostHunt: { ...base.ghostHunt, ticksLeft: r.gh },
          },
          { power: r.pPower, speed: r.pSpeed },
          { power: r.hPower, speed: r.hSpeed },
        );
        return s;
      });

    fc.assert(
      fc.property(arbState, (s) => {
        const before = JSON.stringify(s);
        const tilesBefore = Array.from(s.walls.tiles);
        deepFreeze(s);
        const h = buildHud(s, cfg);
        expect(JSON.stringify(s)).toBe(before);
        expect(Array.from(s.walls.tiles)).toEqual(tilesBefore);
        for (const f of fractions(h)) {
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThanOrEqual(1);
        }
        expect(h.rescued).toBe(s.captives.filter(Boolean).length);
        expect(h.bombs.filled.filter(Boolean)).toHaveLength(s.bombs);
        const blinking = [h.player.blink, h.hunter.blink].filter(Boolean).length;
        expect(blinking).toBe(h.powerHolder === null ? 0 : 1);
      }),
      { numRuns: 200 },
    );
  });
});

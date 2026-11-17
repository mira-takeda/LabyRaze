import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import { buildHud } from '../../src/core/hud';
import { ItemKind, type GameState } from '../../src/core/types';
import { cageState, corridorState } from '../helpers/fixtures';

const arbState = fc
  .record({
    level: fc.integer({ min: 1, max: 200 }),
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
  .map((r): GameState => {
    const base = r.fixture ? cageState({ levelNumber: r.level }) : corridorState({ levelNumber: r.level });
    return {
      ...base,
      bombs: r.bombs,
      lives: r.lives,
      carriedKeys: r.keys,
      captives: r.captives,
      comboCount: r.combo,
      comboTicksLeft: r.comboLeft,
      items: { ...base.items, ordinaryRemaining: Math.min(r.remaining, base.maze.ordinary.length) },
      ghostHunt: { ...base.ghostHunt, ticksLeft: r.gh },
      player: { ...base.player, power: r.pPower, speed: r.pSpeed },
      hunter: { ...base.hunter, power: r.hPower, speed: r.hSpeed },
    };
  });

describe('HUD view-model completeness', () => {
  // Feature: kirobit-halloween-maze, Property 23: HUD view-model completeness
  // **Validates: Requirements 7.7, 13.2, 13.3**
  it('Property 23: every required field is present and equals the state value', () => {
    fc.assert(
      fc.property(arbState, (s) => {
        const h = buildHud(s, cfg);
        expect(h.lives).toBe(s.lives);
        expect(h.level).toBe(s.levelNumber);
        expect(h.carriedKeys).toBe(s.carriedKeys);
        expect(h.rescued).toBe(s.captives.filter(Boolean).length);
        expect(h.rescuedTotal).toBe(3);
        expect(h.pelletsRemaining).toBe(s.items.ordinaryRemaining);
        expect(h.player.powerSeconds).toBeCloseTo(s.player.power / cfg.tickRate);
        expect(h.hunter.powerSeconds).toBeCloseTo(s.hunter.power / cfg.tickRate);
        expect(h.player.speedSeconds).toBeCloseTo(s.player.speed / cfg.tickRate);
        expect(h.hunter.speedSeconds).toBeCloseTo(s.hunter.speed / cfg.tickRate);
        expect(h.bombs.filled).toHaveLength(3);
        expect(h.bombs.filled.filter(Boolean)).toHaveLength(s.bombs);
        expect(h.ghostHunt.secondsLeft).toBeCloseTo(s.ghostHunt.ticksLeft / cfg.tickRate);
        expect(h.ghostHunt.active).toBe(s.ghostHunt.ticksLeft > 0);
        expect(h.combo.multiplier).toBe(s.comboCount);
        const wf = s.comboTicksLeft > 0 ? Math.min(1, s.comboTicksLeft / cfg.comboWindowTicks) : 0;
        expect(h.combo.windowFraction).toBeCloseTo(wf);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 23: pelletsRemaining never counts wisps', () => {
    fc.assert(
      fc.property(arbState, fc.integer({ min: 1, max: 12 }), (s, extra) => {
        const kinds = new Uint8Array(s.items.kinds);
        let added = 0;
        for (let i = 0; i < kinds.length && added < extra; i++) {
          if (kinds[i] === ItemKind.None) {
            kinds[i] = ItemKind.Wisp;
            added++;
          }
        }
        const withWisps: GameState = {
          ...s,
          items: { ...s.items, kinds, wispsRemaining: s.items.wispsRemaining + added },
        };
        expect(buildHud(withWisps, cfg).pelletsRemaining).toBe(buildHud(s, cfg).pelletsRemaining);
        expect(buildHud(withWisps, cfg).pelletsRemaining).toBe(s.items.ordinaryRemaining);
      }),
      { numRuns: 100 },
    );
  });
});

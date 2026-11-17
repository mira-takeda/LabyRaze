// Feature: kirobit-halloween-maze, Property 19: Eating rules
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { resolveCollisions } from '../../src/core/rules';
import type { PreviousCells } from '../../src/core/rules';
import { corridorState, makeCharacter } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const counts = { player: 0, hunter: 0, none: 0 };

describe('Feature: kirobit-halloween-maze, Property 19: Eating rules', () => {
  it('Property 19: outcome matches the eating decision table', () => {
    /**
     * **Validates: Requirements 9.2, 9.9, 9.10**
     */
    fc.assert(
      fc.property(
        fc.constantFrom<'none' | 'player' | 'hunter'>('none', 'player', 'hunter'),
        fc.integer({ min: 0, max: 5 }), // player invulnerable
        fc.constantFrom<'alive' | 'grace' | 'respawning'>('alive', 'grace', 'respawning'),
        fc.constantFrom<'sameCell' | 'swap' | 'adjacent'>('sameCell', 'swap', 'adjacent'),
        fc.integer({ min: 1, max: 6 }), // player x
        fc.constantFrom(-1, 1),
        fc.integer({ min: 1, max: 3 }), // lives
        (power, pInv, hState, geom, px, side, lives) => {
          const hx = geom === 'sameCell' ? px : px + side;
          const player = { x: px, y: 1 };
          const hunter = { x: hx, y: 1 };
          const prev: PreviousCells | null =
            geom === 'swap' ? { player: hunter, hunter: player } : geom === 'adjacent' ? { player, hunter } : null;
          const s = corridorState({
            over: {
              lives,
              player: makeCharacter('player', player, {
                power: power === 'player' ? 50 : 0,
                invulnerable: pInv,
              }),
              hunter: makeCharacter('hunter', hunter, {
                power: power === 'hunter' ? 50 : 0,
                invulnerable: hState === 'grace' ? 3 : hState === 'respawning' ? 7 : 0,
                respawnIn: hState === 'respawning' ? 4 : 0,
              }),
            },
          });
          const r = resolveCollisions(s, prev, cfg);
          const eatP = r.events.filter((e) => e.t === 'PlayerEaten').length;
          const eatH = r.events.filter((e) => e.t === 'HunterEaten').length;

          const collides = geom !== 'adjacent' && hState !== 'respawning';
          let expP = 0;
          let expH = 0;
          if (collides) {
            if (power === 'player') expH = hState === 'alive' ? 1 : 0;
            else expP = pInv <= 0 ? 1 : 0;
          }
          expect(eatP).toBe(expP);
          expect(eatH).toBe(expH);
          expect(eatP + eatH).toBeLessThanOrEqual(1);
          expect(r.state.lives).toBe(lives - eatP);
          if (eatP === 0) expect(r.state.player.cell).toEqual(player);
          if (eatH === 0) expect(r.state.hunter.cell).toEqual(hunter);
          counts[eatP ? 'player' : eatH ? 'hunter' : 'none']++;
        },
      ),
      { numRuns: 300 },
    );
    expect(counts.player).toBeGreaterThan(0);
    expect(counts.hunter).toBeGreaterThan(0);
    expect(counts.none).toBeGreaterThan(0);
  });

  it('ally catches never eat the player, whatever the power state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'none' | 'player' | 'hunter'>('none', 'player', 'hunter'),
        fc.integer({ min: 0, max: 5 }),
        fc.constantFrom<'alive' | 'grace' | 'respawning'>('alive', 'grace', 'respawning'),
        fc.array(fc.constantFrom<0 | 1 | 2>(0, 1, 2), { minLength: 1, maxLength: 3 }),
        (power, pInv, hState, ids) => {
          const s = corridorState({
            over: {
              player: makeCharacter('player', { x: 1, y: 1 }, { power: power === 'player' ? 50 : 0, invulnerable: pInv }),
              hunter: makeCharacter('hunter', { x: 7, y: 1 }, {
                power: power === 'hunter' ? 50 : 0,
                invulnerable: hState === 'grace' ? 3 : hState === 'respawning' ? 7 : 0,
                respawnIn: hState === 'respawning' ? 4 : 0,
              }),
            },
          });
          const r = resolveCollisions(s, null, cfg, ids.map((allyId) => ({ allyId, cell: { x: 7, y: 1 } })));
          expect(r.events.some((e) => e.t === 'PlayerEaten')).toBe(false);
          expect(r.state.lives).toBe(s.lives);
          const catches = r.events.filter((e) => e.t === 'HunterEaten').length;
          expect(catches).toBe(hState === 'alive' ? 1 : 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

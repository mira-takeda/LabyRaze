import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { consumeBomb, detonate, pickupBomb } from '../../src/core/bombs';
import type { Input, WallLayer } from '../../src/core/types';
import { cageMaze } from '../helpers/fixtures';

const CAP = DEFAULT_CONFIG.bombCapacity;

// Feature: kirobit-halloween-maze, Property 30: Bomb inventory accounting
describe('Property 30: Bomb inventory accounting', () => {
  // **Validates: Requirements 28.1, 28.2, 28.3, 28.4**
  it('keeps the inventory in 0..3 and matches a capped-pickup reference model', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: CAP }),
        fc.array(fc.constantFrom('pickup', 'activate'), { maxLength: 60 }),
        (start, ops) => {
          let inv = start;
          let model = start;
          for (const op of ops) {
            const before = inv;
            if (op === 'pickup') {
              const r = pickupBomb(inv, CAP);
              if (before >= CAP) {
                // Refused: the Bomb stays on its Cell.
                expect(r.collected).toBe(false);
                expect(r.inventory).toBe(before);
                model = before;
              } else {
                expect(r.collected).toBe(true);
                expect(r.inventory).toBe(before + 1);
                model = Math.min(CAP, model + 1);
              }
              inv = r.inventory;
            } else {
              const r = consumeBomb(inv);
              if (before > 0) {
                expect(r.consumed).toBe(true);
                expect(r.inventory).toBe(before - 1);
                model = Math.max(0, model - 1);
              } else {
                expect(r.consumed).toBe(false);
                expect(r.inventory).toBe(0);
              }
              inv = r.inventory;
            }
            expect(inv).toBeGreaterThanOrEqual(0);
            expect(inv).toBeLessThanOrEqual(CAP);
            expect(inv).toBe(model);
          }
          expect(inv).toBe(model);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Space bomb key mapping and press at 0 Bombs', () => {
  // The input layer does not exist yet; the input task extends this keyboard mapping test.
  it('defaults the bomb key to Space', () => {
    expect(DEFAULT_CONFIG.bombKey).toBe('Space');
  });

  it('an Input with bomb:true at 0 Bombs changes neither the inventory nor the wall layer', () => {
    const maze = cageMaze();
    const walls: WallLayer = { tiles: maze.tiles.slice(), version: 0, destroyed: 0 };
    const snapshot = Array.from(walls.tiles);
    const input: Input = { pressed: null, bomb: true, continue: false };
    const inv = 0;
    const r = input.bomb ? consumeBomb(inv) : { inventory: inv, consumed: false };
    expect(r).toEqual({ inventory: 0, consumed: false });
    // Nothing was consumed, so no detonation happens and the layer is untouched.
    const after = r.consumed
      ? detonate(walls, maze.width, maze.height, { cell: { x: 1, y: 1 }, next: null, progress: 0 }, 2).walls
      : walls;
    expect(after).toBe(walls);
    expect(Array.from(after.tiles)).toEqual(snapshot);
    expect(after.version).toBe(0);
    expect(after.destroyed).toBe(0);
  });
});

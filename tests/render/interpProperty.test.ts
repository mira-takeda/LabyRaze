import fc from 'fast-check';
import { describe, it } from 'vitest';
import { CELL_UNITS } from '../../src/core/config';
import { interpolate } from '../../src/render/interp';

const EPS = 1e-9;
const dirs = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const cellArb = fc.record({ x: fc.integer({ min: 0, max: 40 }), y: fc.integer({ min: 0, max: 40 }) });
const progressArb = fc.double({ min: 0, max: CELL_UNITS * 2, noNaN: true });
const alphaArb = fc.double({ min: -10, max: 10, noNaN: true });
const unitsArb = fc.double({ min: 0, max: CELL_UNITS * 2, noNaN: true });

describe('Feature: kirobit-halloween-maze, Property 6: Interpolated position lies between Cells', () => {
  it('adjacent next: result is on the segment cell->next', () => {
    fc.assert(
      fc.property(cellArb, fc.constantFrom(...dirs), progressArb, alphaArb, unitsArb, (cell, d, progress, alpha, u) => {
        const next = { x: cell.x + d.dx, y: cell.y + d.dy };
        const p = interpolate({ cell, next, progress }, alpha, u);
        const inX = p.x >= Math.min(cell.x, next.x) - EPS && p.x <= Math.max(cell.x, next.x) + EPS;
        const inY = p.y >= Math.min(cell.y, next.y) - EPS && p.y <= Math.max(cell.y, next.y) + EPS;
        // Collinear: cross product of (next-cell) and (p-cell) is zero.
        const cross = d.dx * (p.y - cell.y) - d.dy * (p.x - cell.x);
        return inX && inY && Math.abs(cross) <= EPS;
      }),
    );
  });

  it('non-adjacent or null next snaps to cell', () => {
    fc.assert(
      fc.property(
        cellArb,
        fc.option(cellArb, { nil: null }),
        progressArb,
        alphaArb,
        unitsArb,
        (cell, maybeNext, progress, alpha, u) => {
          const next =
            maybeNext && Math.abs(maybeNext.x - cell.x) + Math.abs(maybeNext.y - cell.y) !== 1 ? maybeNext : null;
          const p = interpolate({ cell, next, progress }, alpha, u);
          return p.x === cell.x && p.y === cell.y;
        },
      ),
    );
  });
});

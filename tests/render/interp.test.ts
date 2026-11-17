import { describe, expect, it } from 'vitest';
import { CELL_UNITS } from '../../src/core/config';
import { interpolate } from '../../src/render/interp';

const ch = (cell: { x: number; y: number }, next: { x: number; y: number } | null, progress: number) => ({
  cell,
  next,
  progress,
});

describe('interpolate', () => {
  it('returns the endpoints', () => {
    expect(interpolate(ch({ x: 2, y: 3 }, { x: 3, y: 3 }, 0), 0)).toEqual({ x: 2, y: 3 });
    expect(interpolate(ch({ x: 2, y: 3 }, { x: 3, y: 3 }, 0), 1, CELL_UNITS)).toEqual({ x: 3, y: 3 });
  });

  it('returns the midpoint', () => {
    expect(interpolate(ch({ x: 2, y: 3 }, { x: 2, y: 4 }, 0), 0.5, CELL_UNITS)).toEqual({ x: 2, y: 3.5 });
    expect(interpolate(ch({ x: 2, y: 3 }, { x: 3, y: 3 }, CELL_UNITS / 2), 0)).toEqual({ x: 2.5, y: 3 });
  });

  it('clamps alpha and overshoot to the segment', () => {
    const c = ch({ x: 2, y: 3 }, { x: 3, y: 3 }, 900);
    expect(interpolate(c, 5, 500)).toEqual({ x: 3, y: 3 });
    expect(interpolate(c, -5, 500)).toEqual(interpolate(c, 0, 500));
  });

  it('snaps on a wrap pair (non-adjacent cells) and when idle', () => {
    expect(interpolate(ch({ x: 0, y: 5 }, { x: 20, y: 5 }, 500), 0.5, 100)).toEqual({ x: 0, y: 5 });
    expect(interpolate(ch({ x: 4, y: 4 }, null, 0), 1, 100)).toEqual({ x: 4, y: 4 });
  });
});

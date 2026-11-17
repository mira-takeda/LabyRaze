// Regression (task 36.5): adding ice must leave generation output for non-snow levels
// byte-identical. The hash below was captured BEFORE the generation code was touched:
// seeds 1..20 at levels 1, 5, 10, 20, 40 (tiles + every other Maze field).
// Task 36.8 deliberately changed Key placement (greedy Key route bounded to
// keyRouteMin..keyRouteMax by resampling the Key set from the same `items` stream, and repair
// relocating a Key prefers cells that keep the route in band), so the expected hash moved
// from '631bd64e' (pre-36.8, still ice-independent) to '92d59cc2'.
// Ice independence is unaffected: the hash still excludes the `ice` mask.
// The partition repair oscillation fix (seed 15 level 5 regression) changed only the Wisp /
// Ordinary_Pellet split in 3% of Mazes (tiles, Doors, Keys, specials and starts identical, see
// open-decisions.md), so the hash moved from '92d59cc2' to '18c489b7'.
import { describe, expect, it } from 'vitest';
import { mazeHash } from '../helpers/mazeHash';

describe('non-snow generation is unchanged by the ice feature', () => {
  it('matches the post-partition-fix hash for seeds 1..20 at levels 1, 5, 10, 20, 40', () => {
    expect(mazeHash()).toBe('18c489b7');
  }, 600_000);
});

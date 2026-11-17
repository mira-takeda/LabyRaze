// Spawn locator and death sequencing (second playtest).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { DEATH_MS, LEVEL_LOCATOR_MS, LOCATOR_MS, REVEAL_AT, SpawnFx } from '../../src/render/spawnFx';
import { mockCtx } from '../helpers/mockCanvas';

const s0 = createRun(3, DEFAULT_CONFIG).state;
const eaten = { t: 'PlayerEaten' as const, cell: { x: 1, y: 1 }, keysDropped: 0 };

describe('SpawnFx', () => {
  it('plays a contracting locator at every level start and holds the Simulation meanwhile', () => {
    const fx = new SpawnFx();
    fx.sync(s0, 1000);
    expect(fx.holding(1000)).toBe(true);
    expect(fx.progress(1000 + LEVEL_LOCATOR_MS / 2)).toBeCloseTo(0.5);
    const m = mockCtx();
    fx.draw(m.ctx, 1000 + 100);
    expect(m.calls.filter((c) => c.op === 'arc').length).toBeGreaterThan(2);
    expect(fx.holding(1000 + LEVEL_LOCATOR_MS + 1)).toBe(false);
    // Same Maze again: no new locator.
    fx.sync(s0, 5000);
    expect(fx.holding(5000)).toBe(false);
    // A new Maze (next level or new run) starts it again.
    fx.sync({ ...s0, maze: { ...s0.maze } }, 6000);
    expect(fx.holding(6000)).toBe(true);
  });

  it('after a death: hides the Player, waits DEATH_MS, then closes the locator on the respawn Cell', () => {
    const fx = new SpawnFx();
    fx.sync(s0, 0);
    fx.handle([eaten], 2000);
    expect(fx.holding(2000)).toBe(true);
    expect(fx.hidePlayer(2000)).toBe(true);
    fx.sync(s0, 2016);
    expect(fx.progress(2016)).toBeNull(); // still the death animation
    expect(fx.holding(2000 + DEATH_MS - 1)).toBe(true);
    const mid = 2000 + DEATH_MS + LOCATOR_MS / 2;
    expect(fx.progress(mid)).toBeCloseTo(0.5);
    expect(fx.hidePlayer(2000 + DEATH_MS + LOCATOR_MS * (REVEAL_AT - 0.05))).toBe(true);
    expect(fx.hidePlayer(2000 + DEATH_MS + LOCATOR_MS * (REVEAL_AT + 0.05))).toBe(false);
    expect(fx.holding(2000 + DEATH_MS + LOCATOR_MS + 1)).toBe(false);
  });

  it('a game over does not start a locator or keep holding', () => {
    const fx = new SpawnFx();
    fx.sync(s0, 0);
    fx.handle([eaten, { t: 'GameOver', score: 10 }], 3000);
    fx.sync({ ...s0, phase: 'gameOver' }, 3016);
    expect(fx.holding(3016)).toBe(false);
    expect(fx.progress(3000 + DEATH_MS + 10)).toBeNull();
  });
});

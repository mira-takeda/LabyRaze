// Event bus to particle emitters (task 26.2).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { createRun } from '../../src/core/sim';
import { ParticleBindings } from '../../src/render/particleBindings';
import { Emitters, ParticlePool } from '../../src/render/particles';

describe('particle bindings', () => {
  it('maps pickups, eaten characters, rescues and explosions to bursts', () => {
    const s = createRun(1, DEFAULT_CONFIG).state;
    const pool = new ParticlePool(500);
    const b = new ParticleBindings(new Emitters(pool), () => s);
    const cell = { x: 2, y: 2 };
    const counts: number[] = [];
    for (const e of [
      { t: 'PelletCollected', kind: 'ordinary', by: 'hunter', cell },
      { t: 'WispCollected', cell, combo: 2, points: 40, bonus: 0 },
      { t: 'KeyCollected', cell },
      { t: 'CaptiveReleased', index: 1 },
      { t: 'PlayerEaten', cell, keysDropped: 0 },
      { t: 'HunterEaten', cell, by: 'ally', allyId: 0 },
      { t: 'WallsDestroyed', cells: [cell, { x: 3, y: 2 }] },
      { t: 'RoleReversed', to: 'player' },
    ] as GameEvent[]) {
      pool.clear();
      b.handle([e]);
      counts.push(pool.active);
    }
    expect(counts.every((c) => c > 0)).toBe(true);
    pool.clear();
    b.handle([{ t: 'DoorWarning', doorIndex: 0, open: false }]);
    expect(pool.active).toBe(0);
  });

  it('emits trails only for Speed_State and hunting allies, rate-limited and off at trailEvery 0', () => {
    const s0 = createRun(1, DEFAULT_CONFIG).state;
    const pool = new ParticlePool(100);
    const b = new ParticleBindings(new Emitters(pool), () => s0);
    b.frame(s0, 0, 2);
    expect(pool.active).toBe(0);
    const fast = { ...s0, player: { ...s0.player, speed: 100 } };
    b.frame(fast, 1, 2);
    expect(pool.active).toBe(0);
    b.frame(fast, 2, 2);
    expect(pool.active).toBe(1);
    b.frame(fast, 4, 0);
    expect(pool.active).toBe(1);
  });
});

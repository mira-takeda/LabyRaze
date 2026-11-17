// Camera shake strength (second playtest: the shake was not noticeable).
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/core/events';
import { FeedbackLayer, MAX_SHAKE_PX, SHAKE_MS } from '../../src/render/feedback';
import { ParticlePool } from '../../src/render/particles';

const cell = { x: 3, y: 3 };
const peak = (e: GameEvent, from: number, to: number): number => {
  const fb = new FeedbackLayer(new ParticlePool(400));
  fb.handle([e], 0, null);
  let m = 0;
  for (let t = from; t <= to; t += 4) {
    const o = fb.shake(t);
    m = Math.max(m, Math.abs(o.x), Math.abs(o.y));
  }
  return m;
};
const death: GameEvent = { t: 'PlayerEaten', cell, keysDropped: 0 };

describe('camera shake', () => {
  it('a death shakes the viewport by at least 14 px and stays visible for about half a second', () => {
    expect(MAX_SHAKE_PX).toBeGreaterThanOrEqual(18);
    expect(peak(death, 0, 150)).toBeGreaterThanOrEqual(14);
    expect(peak(death, 300, 450)).toBeGreaterThanOrEqual(4);
    expect(peak(death, SHAKE_MS + 10, SHAKE_MS + 200)).toBe(0);
  });

  it('deaths and big bombs shake harder than a Key pickup', () => {
    const key: GameEvent = { t: 'KeyCollected', cell, carried: 1 } as GameEvent;
    const bomb: GameEvent = { t: 'BombDetonated', cell, radius: 3, destroyed: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 1 })) };
    const k = peak(key, 0, 150);
    expect(k).toBeGreaterThan(0);
    expect(peak(death, 0, 150)).toBeGreaterThan(k);
    expect(peak(bomb, 0, 150)).toBeGreaterThan(k);
  });

  it('moves back and forth instead of sitting at one offset', () => {
    const fb = new FeedbackLayer(new ParticlePool(400));
    fb.handle([death], 0, null);
    const xs = new Set<number>();
    for (let t = 0; t < 200; t += 16) xs.add(fb.shake(t).x);
    expect(xs.size).toBeGreaterThan(4);
    expect([...xs].some((x) => x > 0) && [...xs].some((x) => x < 0)).toBe(true);
  });
});

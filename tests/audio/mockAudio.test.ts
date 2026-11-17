// The mock audio context records nodes, edges and automation (task 29.1).
import { describe, expect, it } from 'vitest';
import { ManualTimers, MemoryStorage, MockAudioContext, MockParam } from './mockAudio';

describe('MockAudioContext', () => {
  it('records nodes, connection edges and AudioParam automation', () => {
    const ctx = new MockAudioContext();
    const g = ctx.createGain();
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.5, 0.1);
    g.gain.linearRampToValueAtTime(1, 0.2);
    g.gain.setTargetAtTime(0, 0.3, 0.05);
    g.gain.cancelScheduledValues(0.4);
    expect(ctx.findNodes('gain')).toHaveLength(1);
    expect(ctx.edges).toHaveLength(1);
    expect(ctx.automation().map((a) => a.op)).toEqual(['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']);
    expect((g.gain as MockParam).lastTarget).toBe(0);
    ctx.advance(1.5);
    expect(ctx.currentTime).toBe(1.5);
  });

  it('timers and storage fakes behave deterministically', () => {
    const t = new ManualTimers();
    let fired = 0;
    t.set(() => fired++, 100);
    t.advance(99);
    expect(fired).toBe(0);
    t.advance(1);
    expect(fired).toBe(1);
    const s = new MemoryStorage();
    s.setItem('a', 'b');
    expect(s.getItem('a')).toBe('b');
    s.throwOnGet = true;
    expect(() => s.getItem('a')).toThrow();
  });
});

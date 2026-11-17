// Buses and limiter (task 29.2).
import { describe, expect, it } from 'vitest';
import { AUDIO_DEFAULTS, createBuses } from '../../src/audio/buses';
import { MockAudioContext } from './mockAudio';
import type { MockNode, MockParam } from './mockAudio';

describe('audio buses', () => {
  it('music and sfx feed master, then a -6 dB ratio-12 limiter, then the destination', () => {
    const ctx = new MockAudioContext();
    const b = createBuses(ctx);
    const edge = (from: unknown, to: unknown): boolean => ctx.edges.some((e) => e.from === from && e.to === to);
    expect(edge(b.music, b.master)).toBe(true);
    expect(edge(b.sfx, b.master)).toBe(true);
    expect(edge(b.master, b.limiter)).toBe(true);
    expect(edge(b.limiter, ctx.destination)).toBe(true);
    expect(b.limiter.threshold.value).toBe(-6);
    expect(b.limiter.ratio.value).toBe(12);
  });

  it('applies the defaults master 0.8, music 0.55, sfx 0.9', () => {
    const b = createBuses(new MockAudioContext());
    expect(AUDIO_DEFAULTS).toEqual({ master: 0.8, music: 0.55, sfx: 0.9 });
    expect(b.master.gain.value).toBe(0.8);
    expect(b.music.gain.value).toBe(0.55);
    expect(b.sfx.gain.value).toBe(0.9);
  });

  it('volume and mute use setTargetAtTime and unmute restores the volume', () => {
    const ctx = new MockAudioContext();
    const b = createBuses(ctx);
    b.setVolume('music', 0.3);
    const p = b.music.gain as unknown as MockParam;
    expect(p.calls.at(-1)).toMatchObject({ op: 'setTargetAtTime', value: 0.3, timeConstant: 0.01 });
    b.setMuted('music', true);
    expect(p.calls.at(-1)!.value).toBe(0);
    b.setMuted('music', false);
    expect(p.calls.at(-1)!.value).toBe(0.3);
    b.setVolume('sfx', 7);
    expect(b.volume.sfx).toBe(1);
    void (b.master as unknown as MockNode);
  });
});

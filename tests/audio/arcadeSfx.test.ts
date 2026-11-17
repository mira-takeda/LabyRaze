// Task 37.3: procedural 1UP and fanfare sound effects (mock AudioContext, no files, no Simulation access).
import { describe, expect, it } from 'vitest';
import { createAudioEngine } from '../../src/audio/audioEngine';
import type { AudioEngineDeps } from '../../src/audio/audioPort';
import { RECIPES, SFX_IDS, sfxForEvent } from '../../src/audio/sfx';
import { VoicePlayer } from '../../src/audio/voices';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { ManualTimers, MemoryStorage, MockAudioContext, MockElement } from './mockAudio';

const opts = { wispStepSemitones: 2 };

function engineDeps(): { d: AudioEngineDeps; ctx: MockAudioContext; fetched: string[] } {
  const ctx = new MockAudioContext();
  const timers = new ManualTimers();
  const fetched: string[] = [];
  const d: AudioEngineDeps = {
    createContext: () => ctx,
    fetchBytes: (url) => {
      fetched.push(url);
      return Promise.resolve(new ArrayBuffer(16));
    },
    createElement: () => new MockElement(),
    storage: new MemoryStorage(),
    now: () => timers.now,
    setTimer: timers.set,
    clearTimer: timers.clear,
    cfg: DEFAULT_CONFIG.audio,
    baseUrl: 'http://localhost:5173/',
    warn: () => undefined,
  };
  return { d, ctx, fetched };
}

describe('1UP and fanfare sound effects', () => {
  it('are registered ids with synthesized layers only', () => {
    for (const id of ['oneUp', 'fanfare'] as const) {
      expect(SFX_IDS).toContain(id);
      expect(RECIPES[id].layers.length).toBeGreaterThan(0);
      for (const l of RECIPES[id].layers) expect(['sine', 'square', 'sawtooth', 'triangle', 'noise']).toContain(l.wave);
    }
  });

  it('events map to the new cues and the recipes differ from every other sound', () => {
    expect(sfxForEvent({ t: 'ExtraLife', lives: 4, milestone: 10000 }, opts)?.id).toBe('oneUp');
    expect(sfxForEvent({ t: 'LevelMilestone', level: 100 }, opts)?.id).toBe('fanfare');
    const keys = SFX_IDS.map((id) => JSON.stringify(RECIPES[id].layers));
    expect(new Set(keys).size).toBe(SFX_IDS.length);
  });

  it('the 1UP arpeggio rises and the fanfare lasts about 1.5 s', () => {
    const square = RECIPES.oneUp.layers.filter((l) => l.wave === 'square');
    for (let i = 1; i < square.length; i++) expect(square[i]!.freq[0]).toBeGreaterThan(square[i - 1]!.freq[0]);
    const end = Math.max(...RECIPES.oneUp.layers.map((l) => l.at + l.durationMs));
    expect(end).toBeLessThan(600);
    const fan = Math.max(...RECIPES.fanfare.layers.map((l) => l.at + l.durationMs));
    expect(fan).toBeGreaterThanOrEqual(1400);
    expect(fan).toBeLessThanOrEqual(1600);
  });

  it('the voice player schedules oscillators for both sounds on the mock context', () => {
    for (const id of ['oneUp', 'fanfare'] as const) {
      const ctx = new MockAudioContext();
      const v = new VoicePlayer(ctx, ctx.createGain(), 16);
      v.play({ id, pitch: 1, gain: 1, delayMs: 0 });
      const osc = ctx.findNodes('oscillator');
      expect(osc.length).toBeGreaterThan(0);
      expect(osc.every((o) => o.started !== null && o.stopped !== null)).toBe(true);
      expect(v.played).toBe(1);
    }
  });

  it('the engine plays them on the events, fetches only the Soundtrack and leaves the Simulation alone', async () => {
    const t = engineDeps();
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.unlock();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const before = structuredClone(createRun(1, DEFAULT_CONFIG).state);
    const run = createRun(1, DEFAULT_CONFIG);
    const events = Object.freeze([
      Object.freeze({ t: 'ExtraLife' as const, lives: 4, milestone: 10000 }),
      Object.freeze({ t: 'LevelMilestone' as const, level: 100 }),
    ]);
    expect(() => e.handleEvents(events)).not.toThrow();
    expect(e.internals.cueCounts.oneUp).toBe(1);
    expect(e.internals.cueCounts.fanfare).toBe(1);
    expect(t.fetched).toEqual(['http://localhost:5173/audio/Pixel%20Pulse.opus']);
    expect(run.state).toEqual(before);
  });
});

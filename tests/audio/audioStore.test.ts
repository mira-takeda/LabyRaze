// Volume and mute persistence (task 29.2).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AUDIO_KEY, AudioStore, SAVE_DEBOUNCE_MS, defaultSettings, parseSettings } from '../../src/audio/audioStore';
import { arbAudioBlob } from '../helpers/arbitraries';
import { ManualTimers, MemoryStorage } from './mockAudio';

describe('audio store', () => {
  it('round-trips settings and keeps mutes separate from volumes', () => {
    const s = new MemoryStorage();
    const store = new AudioStore(s);
    const v = { master: 0.4, music: 0.2, sfx: 1, muted: { master: false, music: true, sfx: false } };
    store.saveNow(v);
    expect(JSON.parse(s.map.get(AUDIO_KEY)!)).toMatchObject({ v: 1, music: 0.2, muted: { music: true } });
    expect(store.load()).toEqual(v);
  });

  it('debounces saves by 250 ms and flushes on demand', () => {
    const s = new MemoryStorage();
    const t = new ManualTimers();
    const store = new AudioStore(s, { set: t.set, clear: t.clear });
    store.save({ ...defaultSettings(), master: 0.1 });
    store.save({ ...defaultSettings(), master: 0.2 });
    expect(s.map.size).toBe(0);
    t.advance(SAVE_DEBOUNCE_MS);
    expect(JSON.parse(s.map.get(AUDIO_KEY)!).master).toBe(0.2);
    store.save({ ...defaultSettings(), master: 0.3 });
    store.flush();
    expect(JSON.parse(s.map.get(AUDIO_KEY)!).master).toBe(0.3);
  });

  it('missing, corrupt or throwing storage yields valid settings and never throws', () => {
    expect(new AudioStore(new MemoryStorage()).load()).toEqual(defaultSettings());
    const bad = new MemoryStorage();
    bad.map.set(AUDIO_KEY, '{not json');
    expect(new AudioStore(bad).load()).toEqual(defaultSettings());
    const t = new MemoryStorage();
    t.throwOnGet = true;
    t.throwOnSet = true;
    const store = new AudioStore(t);
    expect(() => store.saveNow({ ...defaultSettings(), sfx: 0.5 })).not.toThrow();
    expect(store.load().sfx).toBe(0.5); // memory fallback
  });

  it('any stored string loads as settings in range with boolean mutes', () => {
    fc.assert(
      fc.property(arbAudioBlob, (raw) => {
        const s = parseSettings(raw);
        for (const k of ['master', 'music', 'sfx'] as const) {
          expect(s[k]).toBeGreaterThanOrEqual(0);
          expect(s[k]).toBeLessThanOrEqual(1);
          expect(typeof s.muted[k]).toBe('boolean');
        }
      }),
      { numRuns: 300 },
    );
  });
});

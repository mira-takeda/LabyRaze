import { describe, expect, it } from 'vitest';
import { Soundtrack } from '../../src/audio/soundtrack';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { SoundtrackDeps } from '../../src/audio/soundtrack';
import { ManualTimers, MockAudioContext, MockElement } from './mockAudio';

function fixture(method: 'auto' | 'buffer' | 'stream', overrides: Partial<SoundtrackDeps> = {}) {
  const ctx = new MockAudioContext();
  const timers = new ManualTimers();
  const urls: string[] = [];
  const elements: MockElement[] = [];
  const st = new Soundtrack({ ctx, output: ctx.createGain(),
    fetchBytes: async (url) => { urls.push(url); return new ArrayBuffer(8); },
    createElement: () => { const el = new MockElement(); elements.push(el); return el; },
    setTimer: timers.set, clearTimer: timers.clear,
    cfg: { ...DEFAULT_CONFIG.audio, soundtrackMethod: method, soundtrackLoadTimeoutMs: 100 },
    baseUrl: 'https://example.org/game/', warn: () => undefined, ...overrides });
  return { st, ctx, timers, urls, elements };
}
async function settle(p: Promise<unknown>, timers: ManualTimers) {
  let done = false;
  void p.then(() => { done = true; });
  for (let i = 0; i < 20 && !done; i++) {
    for (let j = 0; j < 50 && !done; j++) await Promise.resolve();
    if (!done) timers.advance(100);
  }
  await p;
}

describe('soundtrack codec fallback and abandonment', () => {
  it.each(['buffer', 'stream'] as const)('%s skips unsupported Opus and plays MP3', async (method) => {
    const t = fixture(method, { canPlayType: (mime) => mime === 'audio/mpeg' ? 'probably' : '' });
    await t.st.load();
    if (method === 'buffer') {
      expect(t.urls).toEqual(['https://example.org/game/audio/Pixel%20Pulse.mp3']);
      expect(t.st.source?.loop).toBe(true);
    } else {
      expect(t.st.element?.src).toContain('Pixel%20Pulse.mp3');
      expect(t.st.element?.loop).toBe(true);
    }
    expect(t.st.state.status).toBe(method === 'buffer' ? 'ready' : 'streaming');
  });

  it('buffer decode failure tries the other codec without enabling streaming', async () => {
    const t = fixture('buffer');
    const decode = t.ctx.decodeAudioData.bind(t.ctx);
    let n = 0;
    t.ctx.decodeAudioData = () => ++n === 1 ? Promise.reject(new Error('unsupported codec')) : decode();
    await t.st.load();
    expect(t.urls.map((u) => u.split('.').at(-1))).toEqual(['opus', 'mp3']);
    expect(t.elements).toHaveLength(0);
    expect(t.st.state.status).toBe('ready');
  });

  it('stream load failure disconnects Opus before successfully playing MP3', async () => {
    let n = 0;
    const els: MockElement[] = [];
    const t = fixture('stream', { createElement: () => {
      const el = new MockElement();
      if (n++ === 0) el.playResult = 'fail';
      els.push(el); return el;
    } });
    await t.st.load();
    expect(els[0]).toMatchObject({ src: '', pauses: 1, loads: 1 });
    expect(t.ctx.findNodes('mediaElementSource')[0]?.out).toEqual([]);
    expect(t.st.element).toBe(els[1]);
    expect(t.st.state.status).toBe('streaming');
  });

  it('timeout cancels and disconnects a stream, including a late play resolution', async () => {
    let late!: () => void;
    const el = new MockElement();
    el.play = () => new Promise<void>((resolve) => { late = resolve; });
    const t = fixture('stream', { createElement: () => el, canPlayType: (m) => m === 'audio/mpeg' ? '' : 'probably' });
    await settle(t.st.load(), t.timers);
    expect(t.st.state.status).toBe('failed');
    expect(t.st.element).toBeNull();
    expect(el).toMatchObject({ src: '', pauses: 1, loads: 1 });
    expect(t.ctx.nodes.filter((n) => n.nodeType === 'mediaElementSource').every((n) => n.out.length === 0)).toBe(true);
    late(); await Promise.resolve(); await Promise.resolve();
    expect(el.pauses).toBe(2);
    expect(t.st.state.status).toBe('failed');
  });

  it('aborts a timed-out fetch and ignores its late progress', async () => {
    const signals: AbortSignal[] = [];
    const progress: Array<(f: number) => void> = [];
    const t = fixture('buffer', { fetchBytes: (_url, onProgress, signal) => {
      signals.push(signal!); progress.push(onProgress); return new Promise(() => undefined);
    } });
    await settle(t.st.load(), t.timers);
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
    const before = { ...t.st.state };
    progress[0]!(0.8);
    expect(t.st.state).toEqual(before);
  });

  it('an error after streaming started cleans up and tries the remaining codec', async () => {
    const t = fixture('stream');
    await t.st.load();
    t.elements[0]!.emit('error');
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(t.elements[0]!.src).toBe('');
    expect(t.st.element?.src).toContain('.mp3');
    expect(t.st.state.status).toBe('streaming');
  });
});

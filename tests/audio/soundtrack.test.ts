// Soundtrack loader (task 29.3) and Property 45 (part of task 29.7).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { AudioConfig } from '../../src/core/config';
import { Soundtrack, soundtrackUrl } from '../../src/audio/soundtrack';
import type { SoundtrackStatus } from '../../src/audio/soundtrack';
import { arbLoadOutcome } from '../helpers/arbitraries';
import type { LoadOutcome } from '../helpers/arbitraries';
import { ManualTimers, MockAudioContext, MockElement } from './mockAudio';

function setup(outcome: LoadOutcome, cfg: Partial<AudioConfig> = {}): { st: Soundtrack; ctx: MockAudioContext; timers: ManualTimers; el: MockElement; statuses: SoundtrackStatus[]; warns: string[]; urls: string[] } {
  const ctx = new MockAudioContext();
  const timers = new ManualTimers();
  const el = new MockElement();
  const statuses: SoundtrackStatus[] = [];
  const warns: string[] = [];
  const urls: string[] = [];
  if (outcome === 'decodeFail') ctx.decodeResult = 'fail';
  if (outcome === 'streamFail' || outcome === 'fetchFail' || outcome === 'timeout') el.playResult = outcome === 'streamFail' ? 'fail' : 'ok';
  const output = ctx.createGain();
  const st = new Soundtrack({
    ctx,
    output,
    fetchBytes: (url, onProgress) => {
      urls.push(url);
      if (outcome === 'fetchFail' || outcome === 'streamFail') return Promise.reject(new Error('network'));
      if (outcome === 'timeout') return new Promise(() => undefined);
      onProgress(0.5);
      onProgress(1);
      return Promise.resolve(new ArrayBuffer(8));
    },
    createElement: () => el,
    setTimer: timers.set,
    clearTimer: timers.clear,
    cfg: { ...DEFAULT_CONFIG.audio, ...cfg },
    baseUrl: 'http://localhost:5173/',
    warn: (m) => warns.push(m),
  });
  st.subscribe((s) => statuses.push(s.status));
  return { st, ctx, timers, el, statuses, warns, urls };
}

/** Drains microtasks; only when loading is still pending does time move on (timeouts). */
async function settle(p: Promise<unknown>, timers: ManualTimers): Promise<void> {
  let done = false;
  void p.then(() => {
    done = true;
  });
  for (let i = 0; i < 10 && !done; i++) {
    for (let k = 0; k < 50 && !done; k++) await Promise.resolve();
    if (!done) timers.advance(DEFAULT_CONFIG.audio.soundtrackLoadTimeoutMs);
  }
  await p;
}

describe('Soundtrack URL', () => {
  it('encodes the space as %20 and contains no raw space', () => {
    const u = soundtrackUrl('http://localhost:5173/', 'audio/Pixel Pulse.wav');
    expect(u).toBe('http://localhost:5173/audio/Pixel%20Pulse.wav');
    expect(u).not.toContain(' ');
    expect(soundtrackUrl('https://example.org/game/', DEFAULT_CONFIG.audio.soundtrackUrl)).toBe('https://example.org/game/audio/Pixel%20Pulse.opus');
  });
});

describe('Soundtrack loader', () => {
  it('success: buffer path with loop = true, progress reported, ready', async () => {
    const t = setup('ok');
    const p = t.st.load();
    await settle(p, t.timers);
    expect(t.st.state).toEqual({ status: 'ready', progress: 1, method: 'buffer' });
    const src = t.ctx.findNodes('bufferSource')[0]!;
    expect(src.loop).toBe(true);
    expect(src.started).toBe(0);
    expect(t.statuses.slice(0, 3)).toEqual(['idle', 'loading', 'loading']);
    expect(t.statuses).toContain('decoding');
    expect(t.urls[0]).toContain('%20');
  });

  it('decode failure falls back to the stream element with loop and preservesPitch false', async () => {
    const t = setup('decodeFail');
    await settle(t.st.load(), t.timers);
    expect(t.st.state.status).toBe('streaming');
    expect(t.el.loop).toBe(true);
    expect(t.el.preservesPitch).toBe(false);
    expect(t.el.src).toContain('Pixel%20Pulse.opus');
  });

  it('stream failure ends silent (failed) with exactly one warning and no throw', async () => {
    const t = setup('streamFail');
    await settle(t.st.load(), t.timers);
    expect(t.st.state).toMatchObject({ status: 'failed', method: 'none' });
    expect(t.warns).toHaveLength(1);
  });

  it('a stream that never answers times out instead of hanging load() forever', async () => {
    const t = setup('decodeFail');
    t.el.play = () => new Promise(() => undefined); // stalls with no error event
    await settle(t.st.load(), t.timers);
    expect(t.st.state).toMatchObject({ status: 'failed', method: 'none' });
    expect(t.warns).toHaveLength(1);
  }, 15_000);

  it('a fetch that never answers times out and falls back', async () => {
    const t = setup('timeout');
    await settle(t.st.load(), t.timers);
    expect(t.st.state.status).toBe('streaming');
  });

  it('Property 45: every load outcome ends in ready, streaming or failed after passing through loading', async () => {
    await fc.assert(
      fc.asyncProperty(arbLoadOutcome, fc.constantFrom<'auto' | 'buffer' | 'stream'>('auto', 'buffer', 'stream'), async (outcome, method) => {
        const t = setup(outcome, { soundtrackMethod: method });
        let threw = false;
        try {
          await settle(t.st.load(), t.timers);
        } catch {
          threw = true;
        }
        expect(threw).toBe(false);
        expect(['ready', 'streaming', 'failed']).toContain(t.st.state.status);
        expect(t.statuses[1]).toBe('loading');
        if (t.st.state.status === 'ready') {
          expect(t.st.state.method).toBe('buffer');
          expect(t.ctx.findNodes('bufferSource')[0]!.loop).toBe(true);
        }
        expect(t.warns.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});

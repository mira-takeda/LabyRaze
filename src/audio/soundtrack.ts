// Soundtrack loader (task 29.3). Plays the user's `public/audio/Pixel Pulse.opus` read-only.
// Primary: fetch with byte progress, decodeAudioData, AudioBufferSourceNode with loop = true.
// Each codec tries buffer then stream; Opus is preferred, MP3 is the codec fallback. One warning
// on failure; the state always ends in 'ready', 'streaming' or 'failed'.

import type { AudioConfig } from '../core/config';
import type { AudioBufferLike, AudioContextLike, AudioNodeLike, BufferSourceNodeLike, HTMLMediaElementLike } from './audioPort';

export type SoundtrackStatus = 'idle' | 'loading' | 'decoding' | 'ready' | 'streaming' | 'failed';
export type SoundtrackMethod = 'buffer' | 'stream' | 'none';

export interface SoundtrackState {
  status: SoundtrackStatus;
  progress: number; // 0..1 download progress
  method: SoundtrackMethod;
}

/** URL with the space encoded as %20, resolved against the base URL (never a raw space). */
export function soundtrackUrl(baseUrl: string, path = 'audio/Pixel Pulse.opus'): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  try {
    return new URL(encoded, baseUrl).href;
  } catch {
    const b = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${b}${encoded}`;
  }
}

export interface SoundtrackDeps {
  ctx: AudioContextLike;
  /** Node the source feeds into (the urgency shelf of the effects chain). */
  output: AudioNodeLike;
  fetchBytes: (url: string, onProgress: (f: number) => void, signal?: AbortSignal) => Promise<ArrayBuffer>;
  createElement: () => HTMLMediaElementLike;
  canPlayType?: (mime: string) => string;
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  cfg: AudioConfig;
  baseUrl: string;
  warn?: (msg: string) => void;
}

function withTimeout<T>(p: Promise<T>, ms: number, deps: SoundtrackDeps): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = deps.setTimer(() => reject(new Error(`timeout after ${ms} ms`)), ms);
    p.then(
      (v) => {
        deps.clearTimer(h);
        resolve(v);
      },
      (e: unknown) => {
        deps.clearTimer(h);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export class Soundtrack {
  private st: SoundtrackState = { status: 'idle', progress: 0, method: 'none' };
  private readonly listeners: Array<(s: SoundtrackState) => void> = [];
  source: BufferSourceNodeLike | null = null;
  element: HTMLMediaElementLike | null = null;
  buffer: AudioBufferLike | null = null;
  private started = false;
  private warned = false;
  private attempt = 0;

  constructor(private readonly deps: SoundtrackDeps) {}

  get state(): Readonly<SoundtrackState> {
    return this.st;
  }

  subscribe(l: (s: SoundtrackState) => void): () => void {
    this.listeners.push(l);
    l(this.st);
    return () => {
      const i = this.listeners.indexOf(l);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private set(p: Partial<SoundtrackState>): void {
    this.st = { ...this.st, ...p };
    for (const l of [...this.listeners]) {
      try {
        l(this.st);
      } catch {
        // listeners never break loading
      }
    }
  }

  private warn(msg: string): void {
    if (this.warned) return;
    this.warned = true;
    (this.deps.warn ?? ((m: string) => console.warn(m)))(msg);
  }

  /** Loads and starts the Soundtrack. Resolves when a terminal state is reached; never rejects. */
  async load(): Promise<SoundtrackState> {
    if (this.st.status !== 'idle') return this.st;
    const path = this.deps.cfg.soundtrackUrl;
    const paths = path.endsWith('.opus') ? [path, path.replace(/\.opus$/, '.mp3')] : [path];
    return this.loadPaths(paths);
  }

  private async loadPaths(paths: string[]): Promise<SoundtrackState> {
    const { cfg } = this.deps;
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i]!;
      const mime = path.endsWith('.opus') ? 'audio/ogg; codecs="opus"' : path.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
      if (this.deps.canPlayType?.(mime) === '') continue;
      const url = soundtrackUrl(this.deps.baseUrl, path);
      this.set({ status: 'loading', progress: 0, method: 'none' });
      if (cfg.soundtrackMethod !== 'stream') {
        const controller = new AbortController();
        const token = ++this.attempt;
        try {
          const bytes = await withTimeout(
            this.deps.fetchBytes(url, (f) => {
              if (token === this.attempt) this.set({ progress: Math.max(0, Math.min(1, f)) });
            }, controller.signal), cfg.soundtrackLoadTimeoutMs, this.deps,
          );
          this.set({ status: 'decoding', progress: 1 });
          this.buffer = await withTimeout(this.deps.ctx.decodeAudioData(bytes), cfg.soundtrackLoadTimeoutMs, this.deps);
          this.startBuffer();
          this.set({ status: 'ready', method: 'buffer' });
          return this.st;
        } catch {
          this.buffer = null;
          if (this.source) {
            try { this.source.stop(); } catch { /* source never started */ }
            try { this.source.disconnect(); } catch { /* already disconnected */ }
            this.source = null;
          }
          this.started = false;
        } finally {
          ++this.attempt; // ignore progress from an abandoned download
          controller.abort();
        }
      }
      if (cfg.soundtrackMethod !== 'buffer' && await this.startStream(url, paths.slice(i + 1))) return this.st;
    }
    this.warn('Soundtrack unavailable in all supported codecs; continuing without music.');
    this.set({ status: 'failed', method: 'none' });
    return this.st;
  }

  private async startStream(url: string, remaining: string[]): Promise<boolean> {
    let el: HTMLMediaElementLike | null = null;
    let node: AudioNodeLike | null = null;
    let abandoned = false;
    let onError: () => void = () => undefined;
    const cleanup = (): void => {
      abandoned = true;
      // Each cleanup step is independent: a media error must not prevent disconnecting.
      try { el?.pause(); } catch { /* already stopped */ }
      try { el?.removeEventListener?.('error', onError); } catch { /* detached */ }
      try {
        if (el?.removeAttribute) el.removeAttribute('src');
        else if (el) el.src = '';
        el?.load?.(); // cancel pending play/download, not just the timeout promise
      } catch { /* detached */ }
      try { node?.disconnect(); } catch { /* disconnected */ }
      if (this.element === el) this.element = null;
      this.started = false;
    };
    try {
      el = this.deps.createElement();
      el.src = url;
      el.loop = true;
      el.preload = 'auto';
      el.preservesPitch = false;
      const failed = new Promise<never>((_, reject) => {
        onError = () => {
          reject(new Error('stream error'));
          if (!abandoned && this.st.status === 'streaming' && this.element === el) {
            cleanup();
            void this.loadPaths(remaining);
          }
        };
        el!.addEventListener('error', onError);
      });
      node = this.deps.ctx.createMediaElementSource(el);
      node.connect(this.deps.output);
      this.element = el;
      const media = el;
      const playing = media.play().then(() => {
        if (abandoned) media.pause(); // a late play resolution cannot resurrect a timed-out source
      });
      await withTimeout(Promise.race([playing, failed]), this.deps.cfg.soundtrackLoadTimeoutMs, this.deps);
      this.started = true;
      this.set({ status: 'streaming', method: 'stream' });
    } catch (e) {
      const msg = String(e);
      if (this.element && /NotAllowed|gesture|autoplay/i.test(msg)) {
        // Autoplay block: keep the element; it starts on the next gesture via resume().
        this.set({ status: 'streaming', method: 'stream' });
        return true;
      }
      cleanup();
      return false;
    }
    return true;
  }

  private startBuffer(): void {
    if (!this.buffer || this.started) return;
    const src = this.deps.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true; // gapless loop
    src.connect(this.deps.output);
    this.source = src;
    src.start(this.deps.ctx.currentTime, 0);
    this.started = true;
  }

  /** Retry playback of a blocked stream (called on a user gesture). */
  resumeStream(): void {
    if (this.element && this.st.method === 'stream') {
      this.element.play().catch(() => undefined);
    }
  }

  /** Sets the playback rate (AudioParam ramp for the buffer path, once for the stream path). */
  setRate(rate: number, timeConstant = 1): void {
    if (this.source) this.source.playbackRate.setTargetAtTime(rate, this.deps.ctx.currentTime, timeConstant);
    else if (this.element) this.element.playbackRate = rate;
  }
}

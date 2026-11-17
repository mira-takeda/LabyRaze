// Audio engine facade (task 29.6). Lazy context on the first keydown/pointerdown with resume()
// inside the gesture, retry on later gestures, a no-op engine when Web Audio is unavailable,
// visibility suspend/resume, and event dispatch. It never references Simulation state and no
// public method throws.

import type { GameEvent } from '../core/events';
import type { AudioContextLike, AudioEngineDeps } from './audioPort';
import { AudioStore } from './audioStore';
import type { AudioSettings } from './audioStore';
import { createBuses } from './buses';
import type { AudioBusSet, BusName } from './buses';
import { MusicEffects } from './effects';
import { sfxForEvent } from './sfx';
import type { SfxCue, SfxId } from './sfx';
import { Soundtrack } from './soundtrack';
import type { SoundtrackState } from './soundtrack';
import { VoicePlayer } from './voices';

export type EngineStatus = 'locked' | 'running' | 'suspended' | 'unavailable';

export interface AudioEngine {
  readonly status: EngineStatus;
  readonly soundtrack: Readonly<SoundtrackState>;
  /** Call from a user gesture (keydown / pointerdown). Creates or resumes the context. */
  unlock(): void;
  handleEvents(events: ReadonlyArray<GameEvent>): void;
  playUi(): void;
  setVolume(bus: BusName, v: number): void;
  setMuted(bus: BusName, m: boolean): void;
  settings(): AudioSettings;
  onSoundtrack(l: (s: SoundtrackState) => void): () => void;
  setVisible(visible: boolean): void;
  flush(): void;
}

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

export interface EngineInternals {
  ctx: AudioContextLike | null;
  buses: AudioBusSet | null;
  effects: MusicEffects | null;
  voices: VoicePlayer | null;
  soundtrack: Soundtrack | null;
  /** The 64 most recent cues (diagnostics). */
  cues: SfxCue[];
  /** Count of every cue played this session. */
  cueCounts: Partial<Record<SfxId, number>>;
}

export function createAudioEngine(deps: AudioEngineDeps, speedCap: number): AudioEngine & { internals: EngineInternals } {
  const store = new AudioStore(deps.storage, { set: deps.setTimer, clear: deps.clearTimer }, deps.cfg.defaults);
  let settings = store.load();
  let status: EngineStatus = 'locked';
  let pelletParity = 0;
  const pendingListeners: Array<(s: SoundtrackState) => void> = [];
  const internals: EngineInternals = { ctx: null, buses: null, effects: null, voices: null, soundtrack: null, cues: [], cueCounts: {} };
  let idleState: SoundtrackState = { status: 'idle', progress: 0, method: 'none' };
  let ducked = false;

  const create = (): void => {
    let ctx: AudioContextLike;
    try {
      ctx = deps.createContext();
    } catch {
      status = 'unavailable';
      return;
    }
    internals.ctx = ctx;
    const buses = createBuses(ctx, {
      volume: { master: settings.master, music: settings.music, sfx: settings.sfx },
      muted: settings.muted,
    });
    internals.buses = buses;
    internals.effects = new MusicEffects(ctx, buses.music, deps.cfg);
    internals.voices = new VoicePlayer(ctx, buses.sfx, deps.cfg.maxVoices);
    const st = new Soundtrack({
      ctx,
      output: internals.effects.input,
      fetchBytes: deps.fetchBytes,
      createElement: deps.createElement,
      ...(deps.canPlayType ? { canPlayType: deps.canPlayType } : {}),
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer,
      cfg: deps.cfg,
      baseUrl: deps.baseUrl,
      ...(deps.warn ? { warn: deps.warn } : {}),
    });
    internals.soundtrack = st;
    for (const l of pendingListeners) st.subscribe(l);
    void st.load();
    status = ctx.state === 'running' ? 'running' : 'suspended';
  };

  const resume = (): void => {
    const ctx = internals.ctx;
    if (!ctx) return;
    ctx.resume().then(
      () => {
        status = 'running';
      },
      () => {
        status = 'suspended'; // retry on the next gesture
      },
    );
    internals.soundtrack?.resumeStream();
  };

  const play = (cue: SfxCue | null): void => {
    if (!cue || !internals.voices || status === 'unavailable') return;
    internals.cues.push(cue);
    if (internals.cues.length > 64) internals.cues.shift();
    internals.cueCounts[cue.id] = (internals.cueCounts[cue.id] ?? 0) + 1;
    internals.voices.play(cue);
  };

  const duck = (on: boolean): void => {
    const b = internals.buses;
    const ctx = internals.ctx;
    if (!b || !ctx || ducked === on) return;
    ducked = on;
    const target = b.muted.music ? 0 : b.volume.music * (on ? deps.cfg.levelEndMusicDuck : 1);
    b.music.gain.cancelScheduledValues(ctx.currentTime);
    b.music.gain.setTargetAtTime(target, ctx.currentTime, 0.4 / 3);
  };

  const engine = {
    internals,
    get status(): EngineStatus {
      return status;
    },
    get soundtrack(): Readonly<SoundtrackState> {
      return internals.soundtrack?.state ?? idleState;
    },
    unlock(): void {
      safe(() => {
        if (status === 'unavailable') return;
        if (!internals.ctx) create();
        resume();
      }, undefined);
    },
    handleEvents(events: ReadonlyArray<GameEvent>): void {
      safe(() => {
        if (!internals.ctx) return; // before the first gesture: dropped silently
        for (const e of events) {
          if (e.t === 'PelletCollected' && e.kind === 'ordinary') pelletParity++;
          play(sfxForEvent(e, { wispStepSemitones: deps.cfg.wispPitchStepSemitones, pelletParity }));
          if (e.t === 'KeyCollected') internals.effects?.triggerCrush();
          if (e.t === 'LevelStarted') {
            const t = internals.effects?.setUrgency(e.speedFactor, speedCap);
            if (t) internals.soundtrack?.setRate(t.rate);
            duck(false);
          }
          if (e.t === 'LevelEnded' || e.t === 'GameOver') duck(true);
        }
      }, undefined);
    },
    playUi(): void {
      safe(() => play({ id: 'ui' as SfxId, pitch: 1, gain: 1, delayMs: 0 }), undefined);
    },
    setVolume(bus: BusName, v: number): void {
      safe(() => {
        settings = { ...settings, [bus]: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) };
        internals.buses?.setVolume(bus, settings[bus]);
        store.save(settings);
      }, undefined);
    },
    setMuted(bus: BusName, m: boolean): void {
      safe(() => {
        settings = { ...settings, muted: { ...settings.muted, [bus]: m } };
        internals.buses?.setMuted(bus, m);
        store.save(settings);
      }, undefined);
    },
    settings(): AudioSettings {
      return { ...settings, muted: { ...settings.muted } };
    },
    onSoundtrack(l: (s: SoundtrackState) => void): () => void {
      return safe(() => {
        if (internals.soundtrack) return internals.soundtrack.subscribe(l);
        pendingListeners.push(l);
        l(idleState);
        return () => {
          const i = pendingListeners.indexOf(l);
          if (i >= 0) pendingListeners.splice(i, 1);
        };
      }, () => undefined);
    },
    setVisible(visible: boolean): void {
      safe(() => {
        const ctx = internals.ctx;
        if (!ctx || !deps.cfg.pauseOnHidden) return;
        if (visible) resume();
        else
          ctx.suspend().then(
            () => {
              status = 'suspended';
            },
            () => undefined,
          );
      }, undefined);
    },
    flush(): void {
      safe(() => store.flush(), undefined);
    },
  };
  void idleState;
  idleState = { status: 'idle', progress: 0, method: 'none' };
  return engine;
}

/** Real browser dependencies. */
export function browserAudioDeps(cfg: AudioEngineDeps['cfg'], baseUrl: string): AudioEngineDeps {
  return {
    createContext: () => {
      const C = (globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }).AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext;
      if (!C) throw new Error('Web Audio unavailable');
      return new C();
    },
    fetchBytes: async (url, onProgress, signal) => {
      const res = await fetch(url, signal ? { signal } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('Content-Length') ?? 0);
      if (!res.body || !total) {
        const b = await res.arrayBuffer();
        onProgress(1);
        return b;
      }
      const reader = res.body.getReader();
      const out = new Uint8Array(total);
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (got + value.length > out.length) {
          // Content-Length lied: fall back to a growable copy.
          const bigger = new Uint8Array(Math.max(out.length * 2, got + value.length));
          bigger.set(out.subarray(0, got));
          bigger.set(value, got);
          got += value.length;
          return bigger.buffer.slice(0, got);
        }
        out.set(value, got);
        got += value.length;
        onProgress(got / total);
      }
      return out.buffer.slice(0, got);
    },
    createElement: () => new Audio() as unknown as ReturnType<AudioEngineDeps['createElement']>,
    canPlayType: (mime) => new Audio().canPlayType(mime),
    storage: (() => {
      try {
        return globalThis.localStorage ?? null;
      } catch {
        return null;
      }
    })(),
    now: () => performance.now(),
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    cfg,
    baseUrl,
    warn: (m) => console.warn(m),
  };
}

// Property 3: Views never mutate the Simulation (task 22.10, Renderer part).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { freezeEvents } from '../../src/core/events';
import { createRun, step } from '../../src/core/sim';
import type { GameState } from '../../src/core/types';
import { Renderer } from '../../src/render/renderer';
import { arbInput, arbSeed } from '../helpers/arbitraries';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v) && !ArrayBuffer.isView(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

describe('Property 3: the Renderer never mutates the Simulation', () => {
  it('drawing frames and handling events leaves state and events unchanged', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbInput, { minLength: 1, maxLength: 120 }), fc.double({ min: 0, max: 1, noNaN: true }), (seed, inputs, alpha) => {
        const cfg = DEFAULT_CONFIG;
        let run = createRun(seed, cfg);
        const r = new Renderer(mockCtx().ctx, cfg, mockFactory().factory);
        for (const input of inputs) {
          const out = step(run, input);
          run = out.run;
          const snapshot: GameState = structuredClone(run.state);
          const evSnap = structuredClone(out.events);
          const frozen = deepFreeze(run.state);
          r.onEvents(freezeEvents(out.events));
          r.draw(frozen, { alpha, timeMs: run.state.tick * 16 });
          expect(run.state).toEqual(snapshot);
          expect(out.events).toEqual(evSnap);
        }
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});

// Task 30.2: Particle_System and Audio_Engine handlers are read-only too.
import { createAudioEngine } from '../../src/audio/audioEngine';
import { ParticleBindings } from '../../src/render/particleBindings';
import { Emitters, ParticlePool } from '../../src/render/particles';
import { ManualTimers, MemoryStorage, MockAudioContext, MockElement } from '../audio/mockAudio';

describe('Property 3 (completed): particle and audio handlers never mutate the Simulation', () => {
  it('deep-frozen state and events survive particle bindings and the audio engine unchanged', async () => {
    const cfg = DEFAULT_CONFIG;
    const timers = new ManualTimers();
    const audio = createAudioEngine(
      {
        createContext: () => new MockAudioContext(),
        fetchBytes: () => Promise.resolve(new ArrayBuffer(8)),
        createElement: () => new MockElement(),
        storage: new MemoryStorage(),
        now: () => 0,
        setTimer: timers.set,
        clearTimer: timers.clear,
        cfg: cfg.audio,
        baseUrl: 'http://localhost/',
      },
      cfg.speedCap,
    );
    audio.unlock();
    await Promise.resolve();
    await fc.assert(
      fc.asyncProperty(arbSeed, fc.array(arbInput, { minLength: 1, maxLength: 150 }), async (seed, inputs) => {
        let run = createRun(seed, cfg);
        let frozenState: GameState = run.state;
        const pool = new ParticlePool(cfg.particleCap);
        const bindings = new ParticleBindings(new Emitters(pool), () => frozenState);
        for (const input of inputs) {
          const out = step(run, input);
          run = out.run;
          const snapshot: GameState = structuredClone(run.state);
          const evSnap = structuredClone(out.events);
          frozenState = deepFreeze(run.state);
          const frozenEvents = freezeEvents(out.events);
          expect(() => {
            bindings.handle(frozenEvents);
            bindings.frame(frozenState, run.state.tick, 1);
            audio.handleEvents(frozenEvents);
          }).not.toThrow();
          expect(run.state).toEqual(snapshot);
          expect(out.events).toEqual(evSnap);
        }
      }),
      { numRuns: 25 },
    );
  }, 180_000);
});

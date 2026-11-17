// Audio engine facade (task 29.6) and engine / gameplay-triggered audio tests (task 29.9).
import { describe, expect, it } from 'vitest';
import { createAudioEngine } from '../../src/audio/audioEngine';
import type { AudioEngineDeps } from '../../src/audio/audioPort';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { freezeEvents } from '../../src/core/events';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { makePolicy } from '../../tools/balance/policies';
import { ManualTimers, MemoryStorage, MockAudioContext, MockElement } from './mockAudio';
import type { MockParam } from './mockAudio';

function deps(over: Partial<AudioEngineDeps> = {}): { d: AudioEngineDeps; ctx: MockAudioContext; timers: ManualTimers; fetched: string[]; created: number } {
  const ctx = new MockAudioContext();
  const timers = new ManualTimers();
  const fetched: string[] = [];
  const box = { created: 0 };
  const d: AudioEngineDeps = {
    createContext: () => {
      box.created++;
      return ctx;
    },
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
    ...over,
  };
  return { d, ctx, timers, fetched, get created() { return box.created; } };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('audio engine', () => {
  it('creates no context and plays nothing before the first gesture; unlocking creates and resumes it', async () => {
    const t = deps();
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    expect(() => e.handleEvents([{ t: 'KeyCollected', cell: { x: 1, y: 1 } }])).not.toThrow();
    expect(t.created).toBe(0);
    e.unlock();
    expect(t.created).toBe(1);
    await flush();
    expect(t.ctx.resumes).toBe(1);
    expect(e.status).toBe('running');
    e.unlock();
    expect(t.created).toBe(1);
  });

  it('builds the graph music+sfx -> master -> limiter -> destination and fetches only the Soundtrack', async () => {
    const t = deps();
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.unlock();
    await flush();
    const b = e.internals.buses!;
    const edge = (x: unknown, y: unknown): boolean => t.ctx.edges.some((q) => q.from === x && q.to === y);
    expect(edge(b.music, b.master) && edge(b.sfx, b.master) && edge(b.master, b.limiter) && edge(b.limiter, t.ctx.destination)).toBe(true);
    e.handleEvents([{ t: 'PelletCollected', kind: 'power', by: 'player', cell: { x: 1, y: 1 } }]);
    expect(t.fetched).toEqual(['http://localhost:5173/audio/Pixel%20Pulse.opus']);
  });

  it('an unavailable or throwing context yields a silent engine that never throws', () => {
    const t = deps({ createContext: () => { throw new Error('no audio'); } });
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    expect(() => {
      e.unlock();
      e.handleEvents([{ t: 'GameOver', score: 1 }]);
      e.setVolume('music', 0.2);
      e.setVisible(false);
      e.playUi();
    }).not.toThrow();
    expect(e.status).toBe('unavailable');
  });

  it('a rejected resume() is retried on the next gesture', async () => {
    const t = deps();
    t.ctx.resumeResult = 'fail';
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.unlock();
    await flush();
    expect(e.status).toBe('suspended');
    t.ctx.resumeResult = 'ok';
    e.unlock();
    await flush();
    expect(t.ctx.resumes).toBe(2);
    expect(e.status).toBe('running');
  });

  it('suspends when hidden and resumes when visible', async () => {
    const t = deps();
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.unlock();
    await flush();
    e.setVisible(false);
    await flush();
    expect(t.ctx.suspends).toBe(1);
    e.setVisible(true);
    await flush();
    expect(t.ctx.resumes).toBe(2);
  });

  it('volume changes persist through the store and mutes are independent', () => {
    const storage = new MemoryStorage();
    const t = deps({ storage });
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.setVolume('sfx', 0.25);
    e.setMuted('music', true);
    e.flush();
    const again = createAudioEngine(deps({ storage }).d, DEFAULT_CONFIG.speedCap);
    expect(again.settings().sfx).toBe(0.25);
    expect(again.settings().muted.music).toBe(true);
    expect(again.settings().music).toBe(DEFAULT_CONFIG.audio.defaults.music);
  });

  it('LevelEnded and GameOver duck the music; LevelStarted restores it and sets the urgency', async () => {
    const t = deps();
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.unlock();
    await flush();
    const music = e.internals.buses!.music.gain as unknown as MockParam;
    e.handleEvents([{ t: 'LevelEnded', outcome: 'playerWin', level: 1 }]);
    expect(music.lastTarget).toBeCloseTo(DEFAULT_CONFIG.audio.defaults.music * DEFAULT_CONFIG.audio.levelEndMusicDuck, 9);
    e.handleEvents([{ t: 'LevelStarted', level: 2, speedFactor: 1.03 }]);
    expect(music.lastTarget).toBeCloseTo(DEFAULT_CONFIG.audio.defaults.music, 9);
    const shelf = e.internals.effects!.input.gain as unknown as MockParam;
    expect(shelf.lastTarget).toBeGreaterThan(0);
  });
});

describe('gameplay-triggered audio through real step runs', () => {
  it('Key pickups, Bombs, Ghost Hunt, Wisps, rescues, Doors and level ends produce their cues', async () => {
    const t = deps();
    const e = createAudioEngine(t.d, DEFAULT_CONFIG.speedCap);
    e.unlock();
    await flush();
    const cfg = DEFAULT_CONFIG;
    const seen = new Set<string>();
    const allEvents: GameEvent[] = [];
    for (const [name, seed] of [['ghostHuntOpportunistic', 1], ['bombAggressive', 2], ['wispSweep', 3]] as const) {
      const p = makePolicy(name, { bombRadius: cfg.bombRadius });
      let run: Run = createRun(seed, cfg);
      run = { ...run, state: { ...run.state, lives: 1_000_000 } };
      for (let i = 0; i < 5000 && run.state.levelNumber < 3; i++) {
        const before = structuredClone(run.state);
        const r = step(run, p(run.state));
        const frozen = freezeEvents(r.events);
        e.handleEvents(frozen);
        allEvents.push(...r.events);
        // Audio handlers never change the Simulation state.
        expect(run.state).toEqual(before);
        run = r.run;
      }
    }
    for (const id of Object.keys(e.internals.cueCounts)) seen.add(id);
    for (const id of ['key', 'rescue', 'levelComplete', 'doorOpen', 'doorClose', 'wisp', 'pellet']) expect(seen, id).toContain(id);
    if (allEvents.some((x) => x.t === 'BombDetonated')) expect(seen).toContain('bombExplode');
    if (allEvents.some((x) => x.t === 'GhostHuntStarted')) expect(seen).toContain('ghostHuntStart');
    // Key pickups triggered the Soundtrack bitcrush automation on the wet path.
    const wet = e.internals.effects!.wet.gain as unknown as MockParam;
    expect(wet.calls.some((c) => c.op === 'linearRampToValueAtTime' && c.value > 0)).toBe(true);
    // Only the Soundtrack was fetched; every sound effect was synthesized.
    expect(t.fetched).toHaveLength(1);
  }, 180_000);
});

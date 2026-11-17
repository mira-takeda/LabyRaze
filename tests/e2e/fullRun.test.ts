// End-to-end simulation run (task 33.1): a headless scripted multi-level run through the real
// createRun, step, event bus, particle bindings, mock audio engine and high score store.
import { describe, expect, it } from 'vitest';
import { createAudioEngine } from '../../src/audio/audioEngine';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { findInvariantViolations } from '../../src/core/invariants';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ParticleBindings } from '../../src/render/particleBindings';
import { Emitters, ParticlePool } from '../../src/render/particles';
import { HighScoreStore } from '../../src/shell/highScores';
import { EventBus } from '../../src/shell/loop';
import { makePolicy } from '../../tools/balance/policies';
import type { PolicyName } from '../../tools/balance/policies';
import { ManualTimers, MemoryStorage, MockAudioContext, MockElement } from '../audio/mockAudio';

const cfg = DEFAULT_CONFIG;
/** Policy per level: rescue strategies, Bombs, Ghost Hunt, Wisp Combos; then idle levels the Hunter wins. */
/**
 * One entry per level attempt. 'idle' = the Player stands still and cannot be eaten, so Squareman
 * clears the pellets (a Hunter win). During scripted attempts the Player is protected so the whole
 * script runs; after it the Player idles unprotected and is eaten until game over.
 */
const SCRIPT: Array<PolicyName | 'idle'> = ['oneKey', 'idle', 'bombAggressive', 'ghostHuntOpportunistic', 'wispSweep', 'twoKey', 'threeKey'];

interface Trace {
  events: GameEvent[];
  levels: number;
  final: Run;
  digest: string[];
  particles: number;
  cues: number;
  scores: number[];
}

async function fullRun(seed: number): Promise<Trace> {
  const ctx = new MockAudioContext();
  const timers = new ManualTimers();
  const audio = createAudioEngine(
    {
      createContext: () => ctx,
      fetchBytes: () => Promise.resolve(new ArrayBuffer(8)),
      createElement: () => new MockElement(),
      storage: new MemoryStorage(),
      now: () => timers.now,
      setTimer: timers.set,
      clearTimer: timers.clear,
      cfg: cfg.audio,
      baseUrl: 'http://localhost/',
      warn: () => undefined,
    },
    cfg.speedCap,
  );
  audio.unlock();
  for (let i = 0; i < 10; i++) await Promise.resolve();

  let run = createRun(seed, cfg);
  const pool = new ParticlePool(cfg.particleCap);
  const bindings = new ParticleBindings(new Emitters(pool), () => run.state);
  const bus = new EventBus();
  const events: GameEvent[] = [];
  let particles = 0;
  bus.subscribe((ev) => {
    events.push(...ev);
    bindings.handle(ev);
    particles = Math.max(particles, pool.active);
    pool.update(1 / 60);
    audio.handleEvents(ev);
  });
  const store = new HighScoreStore(new MemoryStorage());
  const digest: string[] = [];
  let lastLevel = run.state.levelNumber;
  let attemptKey = '';
  let attempt = -1;
  let current: PolicyName | 'idle' = 'idle';
  let policy = makePolicy('threeKey', { bombRadius: cfg.bombRadius });
  const idle = { pressed: null, bomb: false, continue: false };

  for (let t = 0; t < 150_000 && run.state.phase !== 'gameOver'; t++) {
    let s = run.state;
    const key = `${s.levelNumber}:${run.progression.retryIndex}`;
    if (key !== attemptKey) {
      attemptKey = key;
      attempt++;
      current = attempt < SCRIPT.length ? SCRIPT[attempt]! : 'idle';
      if (current !== 'idle') policy = makePolicy(current, { bombRadius: cfg.bombRadius });
    }
    const scripted = attempt < SCRIPT.length;
    // Protect the Player during the script (idle attempt included); unprotected afterwards.
    if (scripted && s.phase === 'playing' && s.player.invulnerable < 1000) {
      run = { ...run, state: { ...s, player: { ...s.player, invulnerable: 1_000_000 } } };
      s = run.state;
    }
    let input = s.phase === 'levelEnd' ? { ...idle, continue: true } : current === 'idle' ? idle : policy(s);
    // The Bomb attempt also fires a scripted Bomb now and then, so a detonation is covered even
    // when the policy finds no blast that saves enough Cells.
    if (current === 'bombAggressive' && s.phase === 'playing' && t % 300 === 150) {
      run = { ...run, state: { ...s, bombs: Math.max(1, s.bombs) } };
      input = { ...input, bomb: true };
    }
    const r = step(run, input);
    bus.publish(r.events);
    run = r.run;
    if (run.state.phase === 'playing' && t % 500 === 0) {
      const v = findInvariantViolations(run.state, cfg);
      expect(v, `tick ${t}`).toEqual([]);
    }
    if (run.state.levelNumber !== lastLevel) {
      lastLevel = run.state.levelNumber;
      digest.push(`${run.state.levelNumber}:${run.state.score}:${run.state.lives}`);
    }
  }
  const final = run;
  const scores = store.submit({ score: final.state.score, level: final.state.levelNumber, date: 0 }).map((e) => e.score);
  return { events, levels: final.state.levelNumber, final, digest, particles, cues: Object.values(audio.internals.cueCounts).reduce((a, b) => a + (b ?? 0), 0), scores };
}

describe('end-to-end run', () => {
  it('plays scripted levels to game over with every mechanic, deterministically', async () => {
    const a = await fullRun(4242);
    const b = await fullRun(4242);
    const kinds = new Set(a.events.map((e) => e.t));
    for (const k of ['KeyCollected', 'CaptiveReleased', 'BombCollected', 'BombDetonated', 'GhostHuntStarted', 'WispCollected', 'DoorChanged', 'LevelStarted', 'PlayerEaten', 'GameOver'] as const) {
      expect(kinds, k).toContain(k);
    }
    const ends = a.events.filter((e): e is Extract<GameEvent, { t: 'LevelEnded' }> => e.t === 'LevelEnded');
    expect(ends.some((e) => e.outcome === 'playerWin')).toBe(true);
    expect(ends.some((e) => e.outcome === 'hunterWin')).toBe(true);
    expect(a.events.some((e) => e.t === 'WispCollected' && e.combo > 1)).toBe(true);
    // Endless: no victory phase, several levels completed, game over is the only terminal phase.
    expect(a.levels).toBeGreaterThanOrEqual(4);
    expect(a.final.state.phase).toBe('gameOver');
    expect(a.final.state.lives).toBe(0);
    // Views reacted and the high score store holds the final score.
    expect(a.particles).toBeGreaterThan(0);
    expect(a.cues).toBeGreaterThan(50);
    expect(a.scores).toEqual([a.final.state.score]);
    // Determinism across two complete runs.
    expect(b.digest).toEqual(a.digest);
    expect(b.final.state).toEqual(a.final.state);
    expect(b.events).toEqual(a.events);
  }, 600_000);
});

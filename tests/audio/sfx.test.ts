// Procedural SFX and the event mapping (task 29.5) and Property 47 (part of task 29.7).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RECIPES, SFX_IDS, WISP_MAX_HZ, sfxForEvent, wispPitch } from '../../src/audio/sfx';
import { VoicePlayer } from '../../src/audio/voices';
import type { GameEvent } from '../../src/core/events';
import { arbEvent } from '../helpers/arbitraries';
import { MockAudioContext } from './mockAudio';

const opts = { wispStepSemitones: 2 };

describe('sfx recipes', () => {
  it('every SfxId has a recipe of synthesized layers only', () => {
    for (const id of SFX_IDS) {
      const r = RECIPES[id];
      expect(r.id).toBe(id);
      expect(r.layers.length).toBeGreaterThan(0);
      for (const l of r.layers) expect(['sine', 'square', 'sawtooth', 'triangle', 'noise']).toContain(l.wave);
    }
  });

  it('pellet, door, bomb, Ghost Hunt, ally and wisp recipes are pairwise distinct', () => {
    const ids = ['pellet', 'powerPellet', 'speedPellet', 'doorOpen', 'doorClose', 'bombPickup', 'bombActivate', 'bombExplode', 'ghostHuntStart', 'ghostHuntEnd', 'allyAttack', 'wisp'] as const;
    const keys = ids.map((id) => JSON.stringify(RECIPES[id].layers));
    expect(new Set(keys).size).toBe(ids.length);
  });

  it('the voice player synthesizes oscillators and noise, capped at maxVoices, low priority dropped first', () => {
    const ctx = new MockAudioContext();
    const v = new VoicePlayer(ctx, ctx.createGain(), 4);
    for (let i = 0; i < 6; i++) v.play({ id: 'rescue', pitch: 1, gain: 1, delayMs: 0 });
    expect(v.active).toBeLessThanOrEqual(4);
    // The voices are full of high-priority rescue layers: a low-priority pellet is dropped.
    v.play({ id: 'pellet', pitch: 1, gain: 1, delayMs: 0 });
    expect(v.dropped).toBeGreaterThan(0);
    expect(v.active).toBeLessThanOrEqual(4);
    expect(ctx.findNodes('oscillator').length).toBeGreaterThan(0);
    expect(ctx.findNodes('bufferSource').length).toBeGreaterThan(0);
  });
});

describe('Property 47: events map to the right sound effects', () => {
  it('the mapping is total (never throws) and returns known ids', () => {
    fc.assert(
      fc.property(arbEvent, (e) => {
        const cue = sfxForEvent(e, opts);
        if (cue) expect(SFX_IDS).toContain(cue.id);
      }),
      { numRuns: 500 },
    );
  });

  it('gameplay events get their distinct cues', () => {
    const c = (e: GameEvent): string | undefined => sfxForEvent(e, opts)?.id;
    const cell = { x: 1, y: 1 };
    expect(c({ t: 'PelletCollected', kind: 'ordinary', by: 'hunter', cell })).toBe('pellet');
    expect(c({ t: 'PelletCollected', kind: 'power', by: 'player', cell })).toBe('powerPellet');
    expect(c({ t: 'PelletCollected', kind: 'speed', by: 'player', cell })).toBe('speedPellet');
    expect(c({ t: 'DoorChanged', doorIndex: 0, open: true })).toBe('doorOpen');
    expect(c({ t: 'DoorChanged', doorIndex: 0, open: false })).toBe('doorClose');
    expect(c({ t: 'BombCollected', cell, inventory: 1 })).toBe('bombPickup');
    expect(c({ t: 'BombActivated', cell })).toBe('bombActivate');
    expect(c({ t: 'BombDetonated', cell, radius: 2.5, destroyed: [] })).toBe('bombExplode');
    expect(c({ t: 'GhostHuntStarted', refresh: false, ticks: 480 })).toBe('ghostHuntStart');
    expect(c({ t: 'GhostHuntEnded', reason: 'expired' })).toBe('ghostHuntEnd');
    expect(c({ t: 'HunterEaten', cell, by: 'ally', allyId: 1 })).toBe('allyAttack');
    expect(c({ t: 'HunterEaten', cell, by: 'player' })).toBe('hunterEaten');
    expect(c({ t: 'WispCollected', cell, combo: 2, points: 40, bonus: 0 })).toBe('wisp');
    expect(c({ t: 'KeyCollected', cell })).toBe('key');
    expect(c({ t: 'CaptiveReleased', index: 0 })).toBe('rescue');
    expect(c({ t: 'LevelEnded', outcome: 'playerWin', level: 1 })).toBe('levelComplete');
    expect(c({ t: 'LevelEnded', outcome: 'hunterWin', level: 1 })).toBe('hunterWin');
    expect(c({ t: 'GameOver', score: 1 })).toBe('gameOver');
    expect(c({ t: 'PlayerEaten', cell, keysDropped: 0 })).toBe('playerDefeat');
  });

  it('a bigger blast is louder and the explosion follows the activation by a short stagger', () => {
    const cell = { x: 1, y: 1 };
    const small = sfxForEvent({ t: 'BombDetonated', cell, radius: 2.5, destroyed: [] }, opts)!;
    const big = sfxForEvent({ t: 'BombDetonated', cell, radius: 2.5, destroyed: Array.from({ length: 8 }, () => cell) }, opts)!;
    expect(big.gain).toBeGreaterThan(small.gain);
    expect(small.delayMs).toBeGreaterThan(0);
    expect(small.delayMs).toBeLessThanOrEqual(20);
  });

  it('Wisp pitch is non-decreasing in the Combo and clamped at 4 kHz', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 40 }), fc.integer({ min: 0, max: 7 }), (a0, b0, step) => {
        const [a, b] = a0 <= b0 ? [a0, b0] : [b0, a0];
        expect(wispPitch(a, step)).toBeLessThanOrEqual(wispPitch(b, step) + 1e-12);
        expect(wispPitch(b, step) * RECIPES.wisp.layers[0]!.freq[0]).toBeLessThanOrEqual(WISP_MAX_HZ + 1e-9);
      }),
      { numRuns: 200 },
    );
  });
});

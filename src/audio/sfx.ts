// Procedural SFX recipes and the pure event mapping (task 29.5). Every sound is synthesized from
// oscillators and noise; no recorded file is loaded. All motifs are original (see ASSETS.md).

import type { GameEvent } from '../core/events';

export type SfxId =
  | 'pellet'
  | 'wisp'
  | 'powerPellet'
  | 'speedPellet'
  | 'roleReversal'
  | 'ghostHuntStart'
  | 'ghostHuntEnd'
  | 'bombPickup'
  | 'bombActivate'
  | 'bombExplode'
  | 'doorOpen'
  | 'doorClose'
  | 'key'
  | 'rescue'
  | 'allyAttack'
  | 'hunterEaten'
  | 'playerDefeat'
  | 'levelComplete'
  | 'levelTransition'
  | 'hunterWin'
  | 'gameOver'
  | 'oneUp'
  | 'fanfare'
  | 'ui';

export const SFX_IDS: readonly SfxId[] = [
  'pellet', 'wisp', 'powerPellet', 'speedPellet', 'roleReversal', 'ghostHuntStart', 'ghostHuntEnd', 'bombPickup',
  'bombActivate', 'bombExplode', 'doorOpen', 'doorClose', 'key', 'rescue', 'allyAttack', 'hunterEaten',
  'playerDefeat', 'levelComplete', 'levelTransition', 'hunterWin', 'gameOver', 'ui', 'oneUp', 'fanfare',
];

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface SfxLayer {
  wave: Wave;
  /** Start delay (ms). */
  at: number;
  durationMs: number;
  /** Frequency envelope: [startHz, endHz] (noise: filter cutoff). */
  freq: [number, number];
  /** Peak gain 0..1. */
  gain: number;
  /** Optional filter. */
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; hz: [number, number]; q?: number };
}

export interface SfxRecipe {
  id: SfxId;
  priority: number; // higher survives voice stealing
  layers: SfxLayer[];
}

const n = (wave: Wave, at: number, durationMs: number, f0: number, f1: number, gain: number, filter?: SfxLayer['filter']): SfxLayer => ({
  wave,
  at,
  durationMs,
  freq: [f0, f1],
  gain,
  ...(filter ? { filter } : {}),
});

export const RECIPES: Readonly<Record<SfxId, SfxRecipe>> = {
  pellet: { id: 'pellet', priority: 1, layers: [n('square', 0, 45, 660, 700, 0.12)] },
  wisp: { id: 'wisp', priority: 2, layers: [n('sine', 0, 220, 880, 880, 0.2), n('triangle', 10, 180, 1320, 1320, 0.08)] },
  powerPellet: { id: 'powerPellet', priority: 4, layers: [n('sawtooth', 0, 420, 180, 900, 0.16, { type: 'lowpass', hz: [800, 3000] }), n('square', 0, 420, 90, 90, 0.08)] },
  speedPellet: { id: 'speedPellet', priority: 3, layers: [n('triangle', 0, 60, 523, 523, 0.18), n('triangle', 60, 60, 659, 659, 0.18), n('triangle', 120, 80, 784, 784, 0.18)] },
  roleReversal: { id: 'roleReversal', priority: 4, layers: [n('sawtooth', 0, 160, 740, 370, 0.14), n('sawtooth', 160, 200, 370, 740, 0.14)] },
  ghostHuntStart: {
    id: 'ghostHuntStart',
    priority: 5,
    layers: [n('sine', 0, 700, 110, 165, 0.18), n('sine', 120, 260, 988, 988, 0.12), n('sine', 260, 260, 1175, 1175, 0.12), n('sine', 400, 260, 1319, 1319, 0.12), n('noise', 300, 500, 400, 4000, 0.08, { type: 'bandpass', hz: [400, 4000], q: 1.2 })],
  },
  ghostHuntEnd: {
    id: 'ghostHuntEnd',
    priority: 4,
    layers: [n('sine', 0, 240, 1319, 1319, 0.1), n('sine', 140, 240, 1175, 1175, 0.1), n('sine', 280, 300, 988, 988, 0.1), n('noise', 0, 600, 3000, 300, 0.06, { type: 'lowpass', hz: [3000, 300] })],
  },
  bombPickup: { id: 'bombPickup', priority: 3, layers: [n('noise', 0, 25, 6000, 6000, 0.14, { type: 'highpass', hz: [5000, 5000] }), n('square', 30, 60, 440, 440, 0.12), n('square', 90, 70, 660, 660, 0.12)] },
  bombActivate: { id: 'bombActivate', priority: 5, layers: [n('square', 0, 30, 1200, 1200, 0.1), n('square', 50, 30, 1200, 1200, 0.1), n('square', 100, 90, 600, 1600, 0.12)] },
  bombExplode: {
    id: 'bombExplode',
    priority: 6,
    layers: [n('sine', 0, 450, 140, 40, 0.5), n('noise', 0, 600, 5000, 200, 0.4, { type: 'lowpass', hz: [6000, 300] }), n('noise', 40, 160, 8000, 8000, 0.08, { type: 'highpass', hz: [6000, 6000] })],
  },
  doorOpen: { id: 'doorOpen', priority: 2, layers: [n('noise', 0, 220, 1800, 600, 0.12, { type: 'bandpass', hz: [1800, 600], q: 4 }), n('sawtooth', 0, 220, 320, 180, 0.05)] },
  doorClose: { id: 'doorClose', priority: 2, layers: [n('noise', 0, 140, 900, 200, 0.16, { type: 'lowpass', hz: [900, 200] }), n('sine', 0, 160, 90, 60, 0.25)] },
  key: { id: 'key', priority: 5, layers: [n('sine', 0, 260, 1046, 1046, 0.2), n('sine', 110, 320, 1568, 1568, 0.18)] },
  rescue: { id: 'rescue', priority: 6, layers: [n('square', 0, 110, 523, 523, 0.13), n('square', 100, 110, 659, 659, 0.13), n('square', 200, 200, 784, 784, 0.13), n('noise', 150, 300, 7000, 7000, 0.05, { type: 'highpass', hz: [6000, 6000] })] },
  allyAttack: { id: 'allyAttack', priority: 5, layers: [n('sawtooth', 0, 180, 300, 120, 0.16, { type: 'bandpass', hz: [500, 1500], q: 6 }), n('square', 0, 60, 200, 140, 0.1)] },
  hunterEaten: { id: 'hunterEaten', priority: 5, layers: [n('square', 0, 90, 988, 659, 0.15), n('square', 90, 120, 784, 494, 0.15)] },
  playerDefeat: { id: 'playerDefeat', priority: 7, layers: [n('sawtooth', 0, 700, 660, 110, 0.18, { type: 'lowpass', hz: [4000, 600] })] },
  levelComplete: { id: 'levelComplete', priority: 7, layers: [n('square', 0, 140, 440, 440, 0.12), n('square', 140, 140, 523, 523, 0.12), n('square', 280, 140, 494, 494, 0.12), n('square', 420, 360, 554, 554, 0.14)] },
  levelTransition: { id: 'levelTransition', priority: 4, layers: [n('noise', 0, 600, 300, 5000, 0.08, { type: 'bandpass', hz: [300, 5000], q: 1 }), n('triangle', 200, 140, 392, 392, 0.1), n('triangle', 340, 140, 494, 494, 0.1), n('triangle', 480, 220, 587, 587, 0.1)] },
  hunterWin: { id: 'hunterWin', priority: 7, layers: [n('square', 0, 260, 392, 392, 0.12), n('square', 260, 420, 370, 370, 0.12), n('sine', 0, 700, 65, 65, 0.2)] },
  gameOver: { id: 'gameOver', priority: 8, layers: [n('sawtooth', 0, 1400, 440, 55, 0.18, { type: 'lowpass', hz: [3000, 300] }), n('sine', 1300, 400, 60, 40, 0.4)] },
  // 1UP: quick rising C6-E6-G6-C7 square arpeggio over a sine shimmer (original motif).
  oneUp: {
    id: 'oneUp',
    priority: 7,
    layers: [
      n('square', 0, 70, 1047, 1047, 0.13),
      n('square', 70, 70, 1319, 1319, 0.13),
      n('square', 140, 70, 1568, 1568, 0.13),
      n('square', 210, 260, 2093, 2093, 0.14),
      n('sine', 210, 260, 3136, 3136, 0.06),
    ],
  },
  // Celebration fanfare (about 1.5 s): rising call, answer, then a held major chord (original motif).
  fanfare: {
    id: 'fanfare',
    priority: 8,
    layers: [
      n('square', 0, 120, 392, 392, 0.12),
      n('square', 140, 120, 523, 523, 0.12),
      n('square', 280, 120, 659, 659, 0.12),
      n('square', 420, 200, 784, 784, 0.13),
      n('square', 660, 120, 659, 659, 0.12),
      n('square', 800, 120, 784, 784, 0.12),
      n('square', 940, 560, 1047, 1047, 0.13),
      n('triangle', 940, 560, 523, 523, 0.14),
      n('triangle', 940, 560, 659, 659, 0.1),
      n('sine', 0, 1500, 131, 131, 0.14),
      n('noise', 940, 300, 7000, 7000, 0.04, { type: 'highpass', hz: [6000, 6000] }),
    ],
  },
  ui: { id: 'ui', priority: 1, layers: [n('triangle', 0, 30, 1200, 1200, 0.1)] },
};

export interface SfxCue {
  id: SfxId;
  /** Frequency multiplier (Wisp Combo pitch, pellet alternation). */
  pitch: number;
  /** Gain multiplier (Bomb size). */
  gain: number;
  /** Extra delay in ms (Bomb activate then explode stagger). */
  delayMs: number;
}

export const WISP_MAX_HZ = 4000;

/** Wisp pitch multiplier for a Combo count (non-decreasing, clamped at 4 kHz). */
export function wispPitch(combo: number, stepSemitones: number, baseHz = RECIPES.wisp.layers[0]!.freq[0]): number {
  const c = Math.max(1, Math.floor(Number.isFinite(combo) ? combo : 1));
  const f = baseHz * 2 ** ((stepSemitones * (c - 1)) / 12);
  return Math.min(WISP_MAX_HZ, f) / baseHz;
}

/** Pure mapping from a Simulation event to a sound cue (or null). */
export function sfxForEvent(e: GameEvent, opts: { wispStepSemitones: number; pelletParity?: number } = { wispStepSemitones: 2 }): SfxCue | null {
  const cue = (id: SfxId, pitch = 1, gain = 1, delayMs = 0): SfxCue => ({ id, pitch, gain, delayMs });
  switch (e.t) {
    case 'PelletCollected':
      if (e.kind === 'power') return cue('powerPellet');
      if (e.kind === 'speed') return cue('speedPellet');
      // Only the Hunter collects Ordinary_Pellets: alternate two pitches per pickup.
      return cue('pellet', (opts.pelletParity ?? 0) % 2 === 0 ? 1 : 1.12, 0.7);
    case 'WispCollected':
      return cue('wisp', wispPitch(e.combo, opts.wispStepSemitones), e.bonus > 0 ? 1.3 : 1);
    case 'RoleReversed':
      return cue('roleReversal');
    case 'GhostHuntStarted':
      return cue('ghostHuntStart', 1, e.refresh ? 0.7 : 1);
    case 'GhostHuntEnded':
      return cue('ghostHuntEnd');
    case 'BombCollected':
      return cue('bombPickup');
    case 'BombActivated':
      return cue('bombActivate');
    case 'BombDetonated':
      return cue('bombExplode', 1, Math.min(1.6, 0.8 + e.destroyed.length * 0.08), 20);
    case 'DoorChanged':
      return cue(e.open ? 'doorOpen' : 'doorClose');
    case 'KeyCollected':
      return cue('key');
    case 'CaptiveReleased':
      return cue('rescue', 1 + e.index * 0.12);
    case 'HunterEaten':
      return cue(e.by === 'ally' ? 'allyAttack' : 'hunterEaten');
    case 'PlayerEaten':
      return cue('playerDefeat');
    case 'LevelEnded':
      return cue(e.outcome === 'playerWin' ? 'levelComplete' : 'hunterWin');
    case 'LevelStarted':
      return e.level > 1 ? cue('levelTransition') : null;
    case 'ExtraLife':
      return cue('oneUp');
    case 'LevelMilestone':
      return cue('fanfare');
    case 'GameOver':
      return cue('gameOver');
    default:
      return null; // ComboReset, DoorWarning, WallsDestroyed, Power/Speed timers: no sound
  }
}

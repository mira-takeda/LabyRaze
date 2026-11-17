// Reactive music effects chain (task 29.4): urgency high-shelf, an equal-power dry/wet
// crossfade, a WaveShaper bitcrush (2^bits staircase, oversample 'none') followed by a low-pass.
// Key pickups trigger a short crush that returns smoothly; Level_Speed raises playback rate and
// shelf gain within strict bounds.

import type { AudioConfig } from '../core/config';
import type { AudioContextLike, AudioNodeLike, BiquadFilterNodeLike, GainNodeLike, WaveShaperNodeLike } from './audioPort';

export const CRUSH_ATTACK_S = 0.015;
export const CRUSH_HOLD_S = 0.06;
export const RATE_HARD_CAP = 0.08;
const LP_OPEN_HZ = 18_000;

/** Quantisation staircase with 2^bits steps over [-1, 1]. */
export function crushCurve(bits: number, n = 4096): Float32Array {
  const steps = Math.max(2, 2 ** Math.max(1, Math.min(16, Math.round(bits))));
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(((x + 1) / 2) * (steps - 1)) / (steps - 1) * 2 - 1;
  }
  return c;
}

/** Equal-power crossfade gains for mix in [0, 1]. */
export function equalPower(mix: number): { dry: number; wet: number } {
  const m = Math.min(1, Math.max(0, Number.isFinite(mix) ? mix : 0));
  return { dry: Math.cos((m * Math.PI) / 2), wet: Math.sin((m * Math.PI) / 2) };
}

/** Urgency targets for a level speed factor (Property 25). */
export function urgencyTargets(
  speedFactor: number,
  speedCap: number,
  cfg: Pick<AudioConfig, 'soundtrackMaxRateShift' | 'soundtrackUrgency' | 'soundtrackUrgencyShelfDb'>,
): { rate: number; shelfDb: number } {
  if (cfg.soundtrackUrgency === 'off') return { rate: 1, shelfDb: 0 };
  const span = speedCap - 1;
  const u = span > 0 && Number.isFinite(speedFactor) ? Math.min(1, Math.max(0, (speedFactor - 1) / span)) : 0;
  const shift = Math.min(RATE_HARD_CAP, Math.max(0, cfg.soundtrackMaxRateShift));
  const rate = 1 + shift * u;
  const shelfDb = cfg.soundtrackUrgency === 'rate+filter' ? Math.max(0, cfg.soundtrackUrgencyShelfDb) * u : 0;
  return { rate, shelfDb };
}

export class MusicEffects {
  readonly input: BiquadFilterNodeLike; // urgency shelf: sources connect here
  readonly dry: GainNodeLike;
  readonly wet: GainNodeLike;
  readonly crusher: WaveShaperNodeLike;
  readonly lowpass: BiquadFilterNodeLike;
  /** Current crush mix (tracked so a retrigger starts from the current value). */
  private mix = 0;
  private mixAt = 0;
  private mixTarget = 0;

  constructor(
    private readonly ctx: AudioContextLike,
    output: AudioNodeLike,
    private readonly cfg: AudioConfig,
  ) {
    this.input = ctx.createBiquadFilter();
    this.input.type = 'highshelf';
    this.input.frequency.value = 4000;
    this.input.gain.value = 0;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.crusher = ctx.createWaveShaper();
    this.crusher.curve = crushCurve(cfg.soundtrackCrushBits);
    this.crusher.oversample = 'none';
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = LP_OPEN_HZ;
    const g = equalPower(0);
    this.dry.gain.value = g.dry;
    this.wet.gain.value = g.wet;
    this.input.connect(this.dry);
    this.input.connect(this.crusher);
    this.crusher.connect(this.lowpass);
    this.lowpass.connect(this.wet);
    this.dry.connect(output);
    this.wet.connect(output);
  }

  /** Estimated current mix (for retrigger from the current value). */
  currentMix(now = this.ctx.currentTime): number {
    const total = this.cfg.soundtrackDistortionMs / 1000;
    const dt = now - this.mixAt;
    if (this.mixTarget <= 0 || dt >= total) return 0;
    if (dt < CRUSH_ATTACK_S) return this.mix + (this.mixTarget - this.mix) * (dt / CRUSH_ATTACK_S);
    if (dt < CRUSH_ATTACK_S + CRUSH_HOLD_S) return this.mixTarget;
    const release = Math.max(0.01, total - CRUSH_ATTACK_S - CRUSH_HOLD_S);
    return this.mixTarget * Math.exp(-(dt - CRUSH_ATTACK_S - CRUSH_HOLD_S) / (release / 4));
  }

  /** Key pickup bitcrush: attack, hold, smooth release; retrigger ramps from the current mix. */
  triggerCrush(): void {
    const t0 = this.ctx.currentTime;
    const cur = Math.min(1, Math.max(0, this.currentMix(t0)));
    const peak = Math.min(1, Math.max(0, this.cfg.soundtrackDistortionIntensity));
    const total = Math.min(1, Math.max(0.05, this.cfg.soundtrackDistortionMs / 1000));
    const release = Math.max(0.01, total - CRUSH_ATTACK_S - CRUSH_HOLD_S);
    const a = equalPower(cur);
    const p = equalPower(peak);
    for (const [param, from, to, rest] of [
      [this.dry.gain, a.dry, p.dry, 1],
      [this.wet.gain, a.wet, p.wet, 0],
    ] as const) {
      param.cancelScheduledValues(t0);
      param.setValueAtTime(from, t0);
      param.linearRampToValueAtTime(to, t0 + CRUSH_ATTACK_S);
      param.setTargetAtTime(rest, t0 + CRUSH_ATTACK_S + CRUSH_HOLD_S, release / 4);
    }
    const f = this.lowpass.frequency;
    f.cancelScheduledValues(t0);
    f.setValueAtTime(this.mix > 0 ? f.value : LP_OPEN_HZ, t0);
    f.linearRampToValueAtTime(this.cfg.soundtrackCrushLowpassHz, t0 + CRUSH_ATTACK_S);
    f.setTargetAtTime(LP_OPEN_HZ, t0 + CRUSH_ATTACK_S + CRUSH_HOLD_S, release / 4);
    this.mix = cur;
    this.mixTarget = peak;
    this.mixAt = t0;
  }

  /** Urgency from Level_Speed: shelf ramps here; the caller applies the rate to the source. */
  setUrgency(speedFactor: number, speedCap: number): { rate: number; shelfDb: number } {
    const t = urgencyTargets(speedFactor, speedCap, this.cfg);
    const now = this.ctx.currentTime;
    this.input.gain.cancelScheduledValues(now);
    this.input.gain.setTargetAtTime(t.shelfDb, now, 1.0);
    return t;
  }
}

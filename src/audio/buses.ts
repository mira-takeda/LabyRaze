// Audio buses (task 29.2): music and sfx gains into master, a limiter, then the destination.
// Volume and mute changes use setTargetAtTime (10 ms) to avoid zipper noise. A mute is kept
// separately from the volume, so unmuting restores the previous level.

import type { AudioContextLike, CompressorNodeLike, GainNodeLike } from './audioPort';

export type BusName = 'master' | 'music' | 'sfx';
export const BUS_NAMES: readonly BusName[] = ['master', 'music', 'sfx'];
export const AUDIO_DEFAULTS: Readonly<Record<BusName, number>> = { master: 0.8, music: 0.55, sfx: 0.9 };
const RAMP = 0.01;

export interface AudioBusSet {
  readonly master: GainNodeLike;
  readonly music: GainNodeLike;
  readonly sfx: GainNodeLike;
  readonly limiter: CompressorNodeLike;
  readonly volume: Record<BusName, number>;
  readonly muted: Record<BusName, boolean>;
  setVolume(bus: BusName, v: number): void;
  setMuted(bus: BusName, m: boolean): void;
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

export function createBuses(
  ctx: AudioContextLike,
  initial: { volume?: Partial<Record<BusName, number>>; muted?: Partial<Record<BusName, boolean>> } = {},
): AudioBusSet {
  const master = ctx.createGain();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.knee.value = 0;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  music.connect(master);
  sfx.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const volume: Record<BusName, number> = { ...AUDIO_DEFAULTS };
  const muted: Record<BusName, boolean> = { master: false, music: false, sfx: false };
  for (const b of BUS_NAMES) {
    const v = initial.volume?.[b];
    if (v !== undefined) volume[b] = clamp01(v);
    const m = initial.muted?.[b];
    if (m !== undefined) muted[b] = m === true;
  }
  const nodes: Record<BusName, GainNodeLike> = { master, music, sfx };
  const apply = (b: BusName, ramp: boolean): void => {
    const target = muted[b] ? 0 : volume[b];
    const g = nodes[b].gain;
    if (ramp) g.setTargetAtTime(target, ctx.currentTime, RAMP);
    else g.value = target;
  };
  for (const b of BUS_NAMES) apply(b, false);

  return {
    master,
    music,
    sfx,
    limiter,
    volume,
    muted,
    setVolume(b, v) {
      volume[b] = clamp01(v);
      apply(b, true);
    },
    setMuted(b, m) {
      muted[b] = m;
      apply(b, true);
    },
  };
}

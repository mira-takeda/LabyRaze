// Testable Web Audio abstraction (task 29.1). The engine only depends on these interfaces, so a
// MockAudioContext can record nodes, connections and every AudioParam automation call.

import type { AudioConfig } from '../core/config';

export interface AudioParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  setTargetAtTime(v: number, t: number, timeConstant: number): unknown;
  cancelScheduledValues(t: number): unknown;
}

export interface AudioNodeLike {
  connect(dest: AudioNodeLike | AudioParamLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  detune: AudioParamLike;
  start(t?: number): void;
  stop(t?: number): void;
  onended: (() => void) | null;
}

export interface AudioBufferLike {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(ch: number): Float32Array;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  playbackRate: AudioParamLike;
  start(t?: number, offset?: number): void;
  stop(t?: number): void;
  onended: (() => void) | null;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  Q: AudioParamLike;
  gain: AudioParamLike;
}

export interface WaveShaperNodeLike extends AudioNodeLike {
  curve: Float32Array | null;
  oversample: string;
}

export interface CompressorNodeLike extends AudioNodeLike {
  threshold: AudioParamLike;
  ratio: AudioParamLike;
  knee: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
}

export interface HTMLMediaElementLike {
  src: string;
  loop: boolean;
  preload: string;
  preservesPitch?: boolean;
  playbackRate: number;
  crossOrigin?: string | null;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener?(type: string, cb: () => void): void;
  removeAttribute?(name: string): void;
  load?(): void;
  canPlayType?(type: string): string;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createWaveShaper(): WaveShaperNodeLike;
  createDynamicsCompressor(): CompressorNodeLike;
  createMediaElementSource(el: HTMLMediaElementLike): AudioNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioEngineDeps {
  createContext: () => AudioContextLike;
  fetchBytes: (url: string, onProgress: (f: number) => void, signal?: AbortSignal) => Promise<ArrayBuffer>;
  createElement: () => HTMLMediaElementLike;
  canPlayType?: (mime: string) => string;
  storage: StorageLike | null;
  /** Wall clock for debounce and timeouts only (never the Simulation). */
  now: () => number;
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  cfg: AudioConfig;
  /** Base URL of the site (import.meta.env.BASE_URL resolved against location). */
  baseUrl: string;
  warn?: (msg: string) => void;
}

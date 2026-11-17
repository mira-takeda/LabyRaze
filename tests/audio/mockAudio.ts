// MockAudioContext (task 29.1): records every created node with its type, every connection
// edge, and every AudioParam automation call with times and values. `advance(seconds)` moves
// currentTime; `findNodes(type)` filters nodes. Fetch and element factories are injectable.

import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  CompressorNodeLike,
  GainNodeLike,
  HTMLMediaElementLike,
  OscillatorNodeLike,
  // (HTMLMediaElementLike is used by MockElement below)
  WaveShaperNodeLike,
} from '../../src/audio/audioPort';

export interface Automation {
  param: string;
  op: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime' | 'setTargetAtTime' | 'cancelScheduledValues';
  value: number;
  time: number;
  timeConstant?: number;
}

export class MockParam implements AudioParamLike {
  readonly calls: Automation[] = [];
  constructor(
    readonly name: string,
    public value: number,
  ) {}
  setValueAtTime(v: number, t: number): this {
    this.calls.push({ param: this.name, op: 'setValueAtTime', value: v, time: t });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.calls.push({ param: this.name, op: 'linearRampToValueAtTime', value: v, time: t });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.calls.push({ param: this.name, op: 'exponentialRampToValueAtTime', value: v, time: t });
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    this.calls.push({ param: this.name, op: 'setTargetAtTime', value: v, time: t, timeConstant: tc });
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.calls.push({ param: this.name, op: 'cancelScheduledValues', value: Number.NaN, time: t });
    return this;
  }
  /** The last value scheduled (target or ramp end). */
  get lastTarget(): number {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i]!;
      if (c.op !== 'cancelScheduledValues') return c.value;
    }
    return this.value;
  }
}

let nextId = 0;

export class MockNode implements AudioNodeLike {
  readonly id = nextId++;
  readonly out: Array<MockNode | MockParam> = [];
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  [k: string]: unknown;
  /** Node kind ('gain', 'oscillator', ...). Separate from `type`, which oscillators and filters use. */
  readonly nodeType: string;
  constructor(
    readonly ctx: MockAudioContext,
    nodeType: string,
  ) {
    this.nodeType = nodeType;
    ctx.nodes.push(this);
  }
  connect(dest: AudioNodeLike | AudioParamLike): unknown {
    this.out.push(dest as MockNode | MockParam);
    this.ctx.edges.push({ from: this, to: dest as MockNode | MockParam });
    return dest;
  }
  disconnect(): void {
    this.out.length = 0;
  }
  start(t?: number): void {
    this.started = t ?? this.ctx.currentTime;
  }
  stop(t?: number): void {
    this.stopped = t ?? this.ctx.currentTime;
  }
}

export class MockBuffer implements AudioBufferLike {
  readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch]!;
  }
}

export class MockAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 48_000;
  state = 'suspended';
  readonly nodes: MockNode[] = [];
  readonly edges: Array<{ from: MockNode; to: MockNode | MockParam }> = [];
  readonly destination: MockNode;
  decodeResult: 'ok' | 'fail' = 'ok';
  resumeResult: 'ok' | 'fail' = 'ok';
  resumes = 0;
  suspends = 0;

  constructor() {
    this.destination = new MockNode(this, 'destination');
  }

  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  findNodes(nodeType: string): MockNode[] {
    return this.nodes.filter((n) => n.nodeType === nodeType);
  }

  /** Every automation call on every param of every node. */
  automation(): Automation[] {
    const out: Automation[] = [];
    for (const n of this.nodes) for (const v of Object.values(n)) if (v instanceof MockParam) out.push(...v.calls);
    return out;
  }

  createGain(): GainNodeLike {
    const n = new MockNode(this, 'gain');
    n.gain = new MockParam('gain', 1);
    return n as unknown as GainNodeLike;
  }
  createOscillator(): OscillatorNodeLike {
    const n = new MockNode(this, 'oscillator');
    n.frequency = new MockParam('frequency', 440);
    n.detune = new MockParam('detune', 0);
    n.type = 'sine';
    return n as unknown as OscillatorNodeLike;
  }
  createBufferSource(): BufferSourceNodeLike {
    const n = new MockNode(this, 'bufferSource');
    n.playbackRate = new MockParam('playbackRate', 1);
    n.buffer = null;
    n.loop = false;
    return n as unknown as BufferSourceNodeLike;
  }
  createBiquadFilter(): BiquadFilterNodeLike {
    const n = new MockNode(this, 'biquad');
    n.frequency = new MockParam('frequency', 350);
    n.Q = new MockParam('Q', 1);
    n.gain = new MockParam('gain', 0);
    n.type = 'lowpass';
    return n as unknown as BiquadFilterNodeLike;
  }
  createWaveShaper(): WaveShaperNodeLike {
    const n = new MockNode(this, 'waveShaper');
    n.curve = null;
    n.oversample = 'none';
    return n as unknown as WaveShaperNodeLike;
  }
  createDynamicsCompressor(): CompressorNodeLike {
    const n = new MockNode(this, 'compressor');
    for (const p of ['threshold', 'ratio', 'knee', 'attack', 'release']) n[p] = new MockParam(p, 0);
    return n as unknown as CompressorNodeLike;
  }
  createMediaElementSource(): AudioNodeLike {
    return new MockNode(this, 'mediaElementSource');
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike {
    return new MockBuffer(channels, length, sampleRate);
  }
  decodeAudioData(): Promise<AudioBufferLike> {
    if (this.decodeResult === 'fail') return Promise.reject(new Error('EncodingError'));
    return Promise.resolve(new MockBuffer(2, 48_000 * 2, 48_000));
  }
  resume(): Promise<void> {
    this.resumes++;
    if (this.resumeResult === 'fail') return Promise.reject(new Error('NotAllowedError'));
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }
}

export class MockElement implements HTMLMediaElementLike {
  src = '';
  loop = false;
  preload = '';
  preservesPitch = true;
  playbackRate = 1;
  playResult: 'ok' | 'fail' | 'blocked' = 'ok';
  private readonly listeners = new Map<string, Array<() => void>>();
  plays = 0;
  pauses = 0;
  loads = 0;
  play(): Promise<void> {
    this.plays++;
    if (this.playResult === 'fail') {
      queueMicrotask(() => this.emit('error'));
      return new Promise(() => undefined);
    }
    if (this.playResult === 'blocked') return Promise.reject(new Error('NotAllowedError: autoplay'));
    return Promise.resolve();
  }
  pause(): void { this.pauses++; }
  load(): void { this.loads++; }
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
  removeEventListener(type: string, cb: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== cb));
  }
  addEventListener(type: string, cb: () => void): void {
    const l = this.listeners.get(type) ?? [];
    l.push(cb);
    this.listeners.set(type, l);
  }
  emit(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }
}

/** Manual timers so timeouts are deterministic in tests. */
export class ManualTimers {
  private seq = 0;
  readonly pending = new Map<number, { cb: () => void; at: number }>();
  now = 0;
  set = (cb: () => void, ms: number): number => {
    const id = ++this.seq;
    this.pending.set(id, { cb, at: this.now + ms });
    return id;
  };
  clear = (h: unknown): void => {
    this.pending.delete(h as number);
  };
  advance(ms: number): void {
    this.now += ms;
    for (const [id, t] of [...this.pending]) {
      if (t.at <= this.now) {
        this.pending.delete(id);
        t.cb();
      }
    }
  }
}

export class MemoryStorage {
  readonly map = new Map<string, string>();
  throwOnGet = false;
  throwOnSet = false;
  getItem(k: string): string | null {
    if (this.throwOnGet) throw new Error('SecurityError');
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
}

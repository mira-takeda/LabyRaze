// Recipe interpreter (task 29.5): oscillators, a shared noise buffer, filters and gain envelopes.
// At most `maxVoices` concurrent layers; when full the lowest-priority voice is dropped.

import type { AudioBufferLike, AudioContextLike, AudioNodeLike, BufferSourceNodeLike, OscillatorNodeLike } from './audioPort';
import { RECIPES } from './sfx';
import type { SfxCue, SfxRecipe } from './sfx';

interface Voice {
  priority: number;
  end: number;
  stop: () => void;
}

export class VoicePlayer {
  private readonly voices: Voice[] = [];
  private noise: AudioBufferLike | null = null;
  played = 0;
  dropped = 0;

  constructor(
    private readonly ctx: AudioContextLike,
    private readonly out: AudioNodeLike,
    private readonly maxVoices = 16,
  ) {}

  private noiseBuffer(): AudioBufferLike {
    if (this.noise) return this.noise;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * 1));
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    // Deterministic noise (render-side; never the Simulation PRNG).
    let s = 0x1234567;
    for (let i = 0; i < len; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }
    this.noise = b;
    return b;
  }

  private prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i]!.end <= now) this.voices.splice(i, 1);
  }

  get active(): number {
    this.prune(this.ctx.currentTime);
    return this.voices.length;
  }

  /** Makes room for one voice of `priority`; returns false when it must be dropped. */
  private admit(priority: number): boolean {
    this.prune(this.ctx.currentTime);
    if (this.voices.length < this.maxVoices) return true;
    let low = 0;
    for (let i = 1; i < this.voices.length; i++) if (this.voices[i]!.priority < this.voices[low]!.priority) low = i;
    if (this.voices[low]!.priority > priority) return false;
    const [v] = this.voices.splice(low, 1);
    v!.stop();
    return true;
  }

  play(cue: SfxCue): void {
    const r: SfxRecipe = RECIPES[cue.id];
    const t0 = this.ctx.currentTime + cue.delayMs / 1000;
    let any = false;
    for (const L of r.layers) {
      if (!this.admit(r.priority)) {
        this.dropped++;
        continue;
      }
      const start = t0 + L.at / 1000;
      const end = start + L.durationMs / 1000;
      const g = this.ctx.createGain();
      const peak = Math.min(1, L.gain * cue.gain);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + Math.min(0.01, L.durationMs / 4000));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      let node: OscillatorNodeLike | BufferSourceNodeLike;
      if (L.wave === 'noise') {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer();
        src.loop = true;
        node = src;
      } else {
        const osc = this.ctx.createOscillator();
        osc.type = L.wave;
        osc.frequency.setValueAtTime(L.freq[0] * cue.pitch, start);
        osc.frequency.linearRampToValueAtTime(Math.max(1, L.freq[1] * cue.pitch), end);
        node = osc;
      }
      let head: AudioNodeLike = node;
      if (L.filter) {
        const f = this.ctx.createBiquadFilter();
        f.type = L.filter.type;
        f.Q.value = L.filter.q ?? 0.8;
        f.frequency.setValueAtTime(L.filter.hz[0], start);
        f.frequency.linearRampToValueAtTime(L.filter.hz[1], end);
        node.connect(f);
        head = f;
      }
      head.connect(g);
      g.connect(this.out);
      node.start(start);
      node.stop(end + 0.02);
      this.voices.push({
        priority: r.priority,
        end: end + 0.02,
        stop: () => {
          try {
            node.stop();
          } catch {
            // already stopped
          }
        },
      });
      any = true;
    }
    if (any) this.played++;
  }
}

---
inclusion: fileMatch
fileMatchPattern:
  - "src/audio/**"
  - "public/audio/**"
---

# Audio Rules

## Soundtrack file

`public/audio/Pixel Pulse.wav` is user-owned. NEVER edit, re-encode, move, rename, overwrite or delete it. Only read-only checks (size, SHA-256, header bytes, HTTP GET). No script or test writes to `public/audio`. Quote the path in PowerShell. In URLs use `/audio/Pixel%20Pulse.wav` (built from `import.meta.env.BASE_URL`, no raw space).

## Playback

- Primary: fetch, `decodeAudioData`, `AudioBufferSourceNode` with `loop = true` (gapless).
- Fallback chain (`soundtrackMethod: auto`): buffer, then `HTMLAudioElement` stream with `loop = true` and `preservesPitch = false`, then silent. Load timeout `soundtrackLoadTimeoutMs` 30,000.
- Loading is non-blocking, SFX keep working, and state ends in `ready`, `streaming` or `failed` without throwing.
- Create the AudioContext lazily on the first user gesture and `resume()` there. Suspend when the page is hidden.
- The Audio_Engine only listens to the event bus and never touches Simulation state. All public calls are wrapped so nothing throws.

## Bus layout

Source, urgency high-shelf, dry path plus wet path (bitcrush WaveShaper, low-pass), music gain; SFX voices, sfx gain; both into master gain, then a limiter (`DynamicsCompressor`, -6 dB, ratio 12), then destination. Dry/wet is an equal-power crossfade. Defaults: master 0.8, music 0.55, sfx 0.9.

## Bitcrush and urgency limits

- Key pickup bitcrush: `soundtrackDistortionMs` 250 (validated 50 to 1000), peak wet mix `soundtrackDistortionIntensity` 0.35, 5 bits, low-pass 3500 Hz. Retrigger ramps from the current value; always `cancelScheduledValues` first.
- Urgency with Level_Speed: `playbackRate` shift `soundtrackMaxRateShift` default 0.05, hard cap 0.08; high-shelf at most about +2 dB. Mapping is monotone and bounded. `soundtrackUrgency: off` leaves rate 1 and shelf 0 dB.

## Sound effects

All procedural (oscillators, noise, filters), `maxVoices` 16, low priority dropped first. No recorded effect files. SfxIds: `pellet`, `wisp` (pitch rises with Combo, 2 semitones per step, clamped 4 kHz), `powerPellet`, `speedPellet`, `roleReversal`, `ghostHuntStart`, `ghostHuntEnd`, `bombPickup`, `bombActivate`, `bombExplode`, `doorOpen`, `doorClose`, `key`, `rescue`, `allyAttack`, `hunterEaten`, `playerDefeat`, `levelComplete`, `levelTransition`, `hunterWin`, `gameOver`, `ui`. Recipes for pellets, doors, bombs, Ghost_Hunt, `allyAttack` and `wisp` stay pairwise distinct.

## Volume persistence

`audioStore.ts`, key `kirobit.audio.v1`, JSON `{ v, master, music, sfx, muted }`. Strict validation, volumes clamped 0..1, mutes boolean and independent of volume. Missing, corrupt or throwing storage falls back to defaults or memory and never throws. Saves debounced 250 ms, flushed on `pagehide`.

---
inclusion: always
---

# Art and Audio

## Art

- All art is original pixel art created for the project. No Pac-Man sprites, ghost designs, palettes, audio, melodies or samples.
- The Player is a rounded white ghost with two oval black eyes. Captives and Allied_Ghosts are distinct-colour variants sharing the Player silhouette. Squareman is a yellow square in every frame and state.
- Keep an `ASSETS.md` notice with the source and license of every asset category.

## Audio

- Every sound effect is synthesized procedurally with the Web Audio API. No recorded sound-effect files.
- Background music is the Soundtrack only. Generate no replacement music.
- The Audio_Engine never changes Simulation state. Resume the AudioContext on the first user gesture.

## Soundtrack ownership

- `public/audio/Pixel Pulse.wav` is user-owned. NEVER edit, re-encode, move, rename, overwrite or delete it.
- Only read-only operations are allowed: size, SHA-256, header bytes, HTTP GET. No script may write to `public/audio`.
- Quote the path in PowerShell because the file name contains a space.

# Assets

Asset provenance and permissions are scoped in LICENSE-SCOPE.md. No Pac-Man material was identified in the source review. All fifteen LABYRAZE characters are original pixel art defined in code. Artwork and recorded music are not covered by the software GPL grant.

| Category | Source | Owner / licence | Size (bytes) | SHA-256 | Status |
| --- | --- | --- | --- | --- | --- |
| Soundtrack | public/audio/Pixel Pulse.opus | owner-supplied; redistribution permission pending | 3,548,469 | 33A527904CFE23F497B38FAA912BC5C6DDFD36A686068895DA68B77C380C776C | present, never modified |
| Sprites | src/render/sprites/*.ts (code-defined palette pixel art) | original, part of this project | n/a | n/a | complete |
| Tiles and decoration | src/render/sprites/world.ts (code-defined) | original, part of this project | n/a | n/a | complete |
| Biome themes | src/render/biomes.ts (code-defined palettes, tiles, decoration, ice tile) | original, part of this project | n/a | n/a | complete |
| Sound effects | src/audio/sfx.ts (procedurally synthesized recipes) | original, part of this project | n/a | n/a | complete |
| Mazes | src/core/maze/* (procedurally generated from a seed) | original, part of this project | n/a | n/a | complete |
| Fonts | browser monospace system font | system | n/a | n/a | no font files shipped |
| Player skins | Character Workshop (title menu), saved in the browser's localStorage | made by the player | n/a | n/a | optional, cosmetic only, never shipped |

## Soundtrack

The owner reports generating the music with Flow. Exact provider/model and redistribution terms still need documentation. It is shipped privately for verification as `public/audio/Pixel Pulse.opus` (Opus 160 kbps VBR, 2 channels, 48,000 Hz, 171.16 s, gapless). It is loaded read-only at runtime from `/audio/Pixel%20Pulse.opus` and looped gaplessly. It is never edited, moved, renamed or deleted. Only read-only checks (size, SHA-256, header bytes) are allowed: `npm run check:soundtrack`. The reactive effects (Key pickup bitcrush, urgency rate and high-shelf) are applied in the Web Audio graph at playback time; the file itself is untouched. The uncompressed master recording `Pixel Pulse.wav` (RIFF/WAVE PCM, 2 channels, 48,000 Hz, 16-bit, 33,926,694 bytes, SHA-256 `137D2DF0ABD3C5ED079D0B1B80858D7F14C4D0AE1E9C4DC43A2F5BBC7AE13147`) is never edited or overwritten and lives outside `public/`; verify any copy of it against that size and hash.

## Sprites

All items and tiles are 12x12 palette-indexed pixel art written as string arrays in code and rasterized once into an atlas at startup. Antagonists are 24x24 art drawn 1:1 into the 24 px tile. Protagonists (Player, Captives and Allied_Ghosts) are 18x24 art drawn 1:1. All character art is original, drawn for LABYRAZE from internal concept sheets.
Skins made in the Character Workshop use a fixed 20-colour palette, are validated on save and import (size, colours, at least 60 pixels for a protagonist, at least 80 for an antagonist) and only change how the characters are drawn.

- Protagonists (8, `protagonists.ts`): Maze Spirit (the default: a curious sheet-ghost with a top tuft, big black oval eyes with cyan glints and a wavy hem), Maze Spirit Classic (the previous default: a ribbon-wrapped wisp), Lantern Wisp, Rune Ghost, Mask Wisp, Lab Lantern, Neon Sprite and Blob Spirit. Two animation frames each; eyes adapt to the facing (left is mirrored) plus a gentle rendered bob.
- Captives and Allied_Ghosts: the Maze Spirit silhouette in pink `#ff6fb5`, teal (`#2fb3a5` body, `#3fd6c6` highlight) and orange `#ff9f43`. Caged captives drift and glance around on render time (purely visual).
- Antagonists (7, `antagonists.ts`): Shadow Bite (the default: a shade cube with a flame-licked rim, slanted amber eyes and a blocky grin; chase narrows the eyes, scared turns them cyan, defeated crosses them out), Shadow Bite Classic (the previous default: a smoky cube), Lantern Maw, Cursed Mask, Pumpkin Tech, Grave Wisp and Night Idol. Two animation frames each; only the face, colours and glow change with the state (normal, power, speed, respawn, fleeing).
- The previous Kiro-derived ghost and yellow-square art was replaced wholesale; no mascot tracing remains (`ghost.ts` and `squareman.ts` now re-export the Maze Spirit and Shadow Bite defaults).
- Items: warm amber square Ordinary_Pellets, cool cyan/violet round Spirit_Wisps that bob, Power and Speed pellets, Key, Bomb, Ghost_Hunt lantern (`items.ts`).
- World: brick walls, riveted indestructible walls, floor variants, rubble, Cage, Doors (open / closed / warning), and Halloween decoration (pumpkin, candle, cobweb) (`world.ts`).
- Biomes: the environment changes every 5 levels, `floor((level - 1) / 5) mod 6`: haunted purple (the original look), red brick (bricks with mortar, torches, cracks), jungle (moss, vines, flowers), metal (rivets, pipes, hazard stripes, grates), snow (snow caps, icicles, drifts, a light-blue glossy ice floor tile) and neon (glowing grid, signs, nodes). Each biome has its own wall, indestructible wall, floor, rubble, Cage and gate palettes, an ambient light tint, and ambient particle flavour (dust, embers, fireflies, sparks, snowflakes, neon dust). Pickups are never recoloured: Ordinary_Pellets stay warm amber squares and Spirit_Wisps stay cool round orbs in every biome. All pixel art is original, defined in code (`biomes.ts`), and rasterized once into the atlas under names such as `wall@redBrick`.

## Sound effects

Every sound effect is synthesized at runtime from oscillators, a generated noise buffer, filters and gain envelopes (`src/audio/sfx.ts`, `src/audio/voices.ts`). No recorded effect file is shipped or requested. The melodic figures are short original motifs:

| Sound | Motif |
| --- | --- |
| pellet | square blip alternating 660 Hz and 739 Hz |
| wisp | sine chime at 880 Hz rising 2 semitones per Combo step (clamped at 4 kHz) |
| key | two-note sine bell, C6 then G6 |
| rescue | rising C5-E5-G5 square arpeggio with sparkle noise |
| levelComplete | A4-C5-B4 then a held C#5 (minor turn resolving to major) |
| hunterWin | G4 falling a minor second to F#4 over a low pulse |
| ghostHuntStart | low organ swell, three bells B5-D6-E6, rising noise whoosh |
| ghostHuntEnd | the same bells descending with a filtered noise fade |
| bombExplode | sine thump 140 Hz to 40 Hz, falling low-pass noise burst, high crackle |
| oneUp | quick rising C6-E6-G6-C7 square arpeggio over a high sine shimmer (original) |
| fanfare | about 1.5 s: G4-C5-E5-G5 call, E5-G5 answer, then a held C6 square with a C5/E5 triangle chord (original) |
| gameOver | long descending sawtooth glide from A4 to A1 with a low thud |

## Mazes

Mazes are generated deterministically from the Run Seed and Level_Number (recursive carving with loops, Cage, Doors, item placement and validity checks). No maze layout is copied from any game.

## MP3 compatibility fallback

`public/audio/Pixel Pulse.mp3`: 2,739,456 bytes, SHA-256 `03168C4CD278417399A9048DA9C756E15F7E5D4C9D0AF5A2F0A2641C165EC5BA`. MPEG-1 Layer III, stereo, 48,000 Hz, 128 kbps. The distribution copy contains the original MPEG frames without re-encoding; ID3 cover art and auxiliary metadata were removed. The downloaded original and WAV master remain untouched. Opus is preferred when supported; both buffer and stream loading try MP3 after codec/loading failure. Buffer looping is sample based; MP3 encoder padding and streaming loop seams require listening checks.

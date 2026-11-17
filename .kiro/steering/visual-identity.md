---
inclusion: fileMatch
fileMatchPattern:
  - "src/render/**"
  - "public/**"
---

# Visual Identity

## Look

Modern indie pixel art with a Halloween mood: crisp low-resolution sprites (no smoothing) over dark maze floors, with soft additive glow, dynamic lighting around characters and items, and particles for pickups, explosions and ghost trails. It is not primitive Atari-style graphics: use palette depth, light falloff, small animations and screen-space polish, within the performance budgets and quality tiers.

All art is original and defined in code as palette-indexed arrays. No Pac-Man material. Keep `ASSETS.md` current.

## Characters

- Player: Kiro-style rounded white ghost, two oval black eyes, wavy hem.
- Captives and Allied_Ghosts share the Player silhouette with distinct colours. One atlas builds all tinted variants.
- Squareman: a yellow square in every frame and state. The square silhouette never changes; only face, glow and effects change with state.

## Captive and Ally palettes (provisional, from design.md)

| Index | Colour | Hex |
|-------|--------|-----|
| 0 | pink | `#ff6fb5` |
| 1 | cyan-teal | `#3fd6c6` (darker teal body and two-colour trail so it differs from wisp glow) |
| 2 | orange | `#ff9f43` |

An ally matches its Captive's colour. Ally trails and particles use the ally colour at reduced alpha. The Player stays white.

## Items

- Ordinary_Pellets: warm amber squares.
- Spirit_Wisps: cool cyan and violet glowing orbs, slow bob, soft additive glow, round shape. Warm square versus cool round must stay readable at the lowest quality tier.
- Bombs, Ghost_Hunt items, Keys and Power/Speed pellets get distinct shapes and hues; Power_State and invulnerability blinks must look different.

## Rules

- Renderer reads state and events only and never changes the Simulation.
- Effects use the particle pool and respect the active quality tier.

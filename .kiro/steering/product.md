---
inclusion: always
---

# KiroBit Product

KiroBit is an original, endless, Halloween-themed arcade maze game for Kiroween 2026. The Player is a Kiro-style ghost. Squareman, an autonomous yellow square hunter, competes for the same resources. There is no final level and no victory outcome.

## Phases

- Phase 1: core loop with placeholder graphics. Maze generation, grid movement with Buffered_Turns and Interpolation, Squareman AI, pellets, Keys, Cage, Doors, Power_Pellets, Speed_Pellets, Lives, endless levels, minimal HUD.
- Phase 2: polish. Pixel-art sprites, lighting, particles, the user's Soundtrack with reactive audio, procedural sound effects, Bombs, Ghost_Hunt, Spirit_Wisps, menus, transitions, HUD polish, high scores (top 10 in local storage).
- Phase 2 tasks start only after the Phase 1 gate passes.
- The headless Simulation rules of Bombs, Ghost_Hunt, Spirit_Wisps and Combo may be built before the Phase 1 shell (Requirement 13.5). Their visuals and sounds stay in Phase 2.

## Glossary

- Simulation: deterministic game-state logic, independent of rendering and audio.
- Tick / Tick_Rate: fixed simulation step / 60 per second.
- Seed / PRNG: integer seed / the only source of randomness.
- Player: the Kiro-style ghost. Squareman: the yellow square hunter, square silhouette in every frame and state.
- Captive: one of three ghosts in the Cage. Rescue: delivering one Carried Key to the Cage entrance releases one Captive. Rescued_Captive stays released for the level.
- Key: collectible that releases one Captive. Carried_Keys: Keys held by the Player (1 to 3).
- Ordinary_Pellet: collected only by Squareman, counts toward his win. Power_Pellet: grants Power_State (default 5 s, one holder at a time). Speed_Pellet: grants Speed_State.
- Door: opens and closes on a PRNG schedule; no character controls it.
- Bomb: Player-only collectible stored in the Bomb_Inventory (max 3); the bomb key (default Space) detonates it at the Player location and destroys Destructible_Walls within the Blast_Radius (bombRadius, 2.5 Cells). Indestructible_Walls (Cage, gate, outer boundary) never break.
- Ghost_Hunt: Player-only collectible, activated immediately on collection, never stored. All three Allied_Ghosts leave the Cage and chase Squareman for ghostHuntTicks.
- Allied_Ghost: a Captive (rescued or imprisoned) temporarily moving in the Maze during Ghost_Hunt, as a distinct-colour variant of the Player.
- Spirit_Wisp: Player-only collectible worth wispPoints, excluded from the Squareman clear condition. Builds the Combo.
- Combo: score multiplier raised by 1 per Spirit_Wisp collected within comboWindowTicks, capped at comboCap. Affects score only.
- Lives: start at 3. Run: from level 1 until Lives reach 0.
- Game_Config: single module of all configurable values.
- Balance_Simulator / Balance_Baseline: headless seeded policy runner / committed record of measured ratios and bands.
- Soundtrack: the user-owned file `public/audio/Pixel Pulse.wav`.

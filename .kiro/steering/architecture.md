---
inclusion: always
---

# Architecture

## Determinism

- The Simulation advances in fixed Ticks at a Tick_Rate of 60 Hz. The browser uses an accumulator to match elapsed time.
- Every random value comes from the seeded PRNG. No `Math.random`, no unseeded source.
- No wall clock in the Simulation: no `Date`, `performance`, `requestAnimationFrame`, `setTimeout`, `setInterval`, `crypto.getRandomValues`.
- Same Seed, Game_Config and input sequence produce identical state after every Tick.

## Layering

- `src/core/**` (Simulation, maze, rules, hunter AI, progression) never imports DOM, render, audio, input or shell code.
- `src/render`, `src/audio`, `src/shell` consume Simulation state and events and never mutate Simulation state.
- Renderer, Particle_System and Audio_Engine are read-only observers of events.
- Shared files (`types.ts`, `events.ts`, `config.ts`, `sim.ts`, `rules.ts`, `renderer.ts`, `main.ts`): make only minimal additive edits and rerun `npx tsc --noEmit`.

## Ghost Hunt and rescue separation

- Ghost Hunt is never a Rescue. It never changes `captives`, the Rescued_Captive count, any Captive flag, or `carriedKeys`. The `ghostHunt` state slice has no access to those fields.
- Allied_Ghosts never block the Cage entrance, so Rescue works during Ghost Hunt.
- Allied_Ghosts grant no Power_State and do not cancel or replace it.
- Bomb explosions update collision, connectivity, Door gates and pathfinding caches, and Squareman routes are recomputed on the same Tick.

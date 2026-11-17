---
inclusion: fileMatch
fileMatchPattern:
  - "src/render/**"
  - "src/core/**"
---

# Performance Budgets (Requirement 21)

## Reference modest hardware

Browser (Edge or Chrome) on Windows, laptop-class CPU with integrated graphics and no discrete GPU. Exact device: record the CPU model, browser version and display refresh rate here when task 32.2 measures it.

Manual check status: pending.

## Budgets

- Frame_Time p95 at most 16.7 ms during a level.
- Input reflected in the Simulation no later than the next Tick (60 Hz).
- Simulation Tick p95 at most 2 ms, asserted over at least 10,000 Ticks including scripted Bomb and Ghost Hunt events.
- Maze generation under 50 ms.
- If Frame_Time p95 exceeds 16.7 ms for 2 consecutive seconds, step the quality tier down (high, medium, low) without touching the Simulation. Up-tier only after a 10 s hysteresis.

## Rendering rules

- Maze drawn once into an offscreen static layer; per frame draw only dynamic elements. Patch tiles after `WallsDestroyed` (under 100 tile blits per explosion).
- Sprites rasterized once into an atlas; per-frame `drawImage`, smoothing off, integer coordinates.
- Particles come from a fixed pool (`particleCap` 500) with no per-frame allocation. Effects use a separate non-simulation PRNG.
- Glow: small pre-rendered radial sprites, additive, half-resolution canvas, skipped at the low tier. HUD redraws only when its view-model changes.

## Effect budgets

- Explosion: at most `explosionParticleMax` 60 particles from the shared pool, cut by the active cap; at most 3 concurrent flashes; screen shake is one `translate` per frame.
- Allies: at most `allyTrailMax` 12 trail particles per ally per second, reduced by tier.
- Spirit_Wisp pickup sparkle: 4 particles.

## Core rules

- Typed arrays for tiles; distance fields cached by Door mask and wall version; no per-Tick allocation in hot paths beyond the new state object.
- Verify with `npm run test:perf` and `npm run perf:browser` (`?perf=1`). A missing browser prints `SKIPPED` with manual steps; record the result here and never download a browser.

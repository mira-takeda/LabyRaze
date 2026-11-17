---
inclusion: always
---

# Product Rules

## Win conditions

- The Player wins a level by releasing all three Captives (one Key per Captive).
- Squareman wins a level by collecting every Ordinary_Pellet first.
- Each level generates a new seeded Maze. Both characters get the same small Level_Speed increase per win. No final level, no victory outcome.
- Power_State: at most one holder. A Squareman Power_Pellet cancels the Player's power on the same Tick, and vice versa. Speed_State may coexist with Power_State. No other abilities exist.

## Approved decisions

- Requirement 13.5 is approved: headless mechanics are built and verified before the playable presentation.
- The lives, respawn, dropped-key and level-loss rules from the Open Design Questions are configurable initial defaults, not permanent rules.
- The combo window (120 ticks), bomb radius, Ghost Hunt duration and balance thresholds are provisional and are tuned by reproducible simulations.
- Critical gameplay tests are mandatory. Missing, skipped or unmatched tests are never reported as passing.
- Scientific simulations get no arbitrary short time limits. Record their duration and results.

## Bomb rules

- Only the Player collects Bombs. Inventory max 3; pickup is refused at 3 and the Bomb stays on its Cell. Default 3 per Level (`bombsPerLevel`).
- The bomb key (default Space) consumes one Bomb at the Player location. With 0 Bombs nothing changes.
- Destroys every Destructible_Wall whose Cell center lies within `bombRadius` (2.5 Cells, provisional), including walls behind walls. Indestructible_Walls stay. Destroyed walls stay destroyed until the level ends.
- By default the explosion does not harm Squareman or destroy pellets.
- After an explosion the Maze stays valid: Cage intact, items present, every Key and pellet reachable.

## Ghost Hunt rules

- Player-only, activates on the same Tick as collection, never stored. Collecting another restarts the duration. 1 per Level by default; `ghostHuntTicks` default 480 (provisional).
- Allied_Ghosts chase Squareman using current Doors and destroyed walls, never phase through walls, and never harm the Player. Squareman flees them. A catch applies the Squareman eaten rule and scores for the Player.
- During Ghost Hunt, previously rescued Kiros temporarily return to chase Squareman and then leave again. They NEVER become imprisoned again. Captive Kiros return to their cage. Ghost Hunt never alters rescue progress.
- Ghost Hunt never changes Captives, the Rescued_Captive count or Carried_Keys, and is never a Rescue.

## Spirit_Wisp design decision

- Wisps sit on seeded floor Cells that do not overlap Ordinary_Pellet Cells, so every corridor holds items for both characters.
- Only the Player collects them. They award `wispPoints` times the Combo multiplier and build the Combo (`comboWindowTicks` 120, `comboCap` 5, both provisional).
- The Combo resets when the window elapses or Squareman eats the Player. The Combo affects score only, never win conditions or fairness.
- Wisps are cool-coloured orbs; Ordinary_Pellets are warm yellow-orange.

## Pellet accounting rule

- Spirit_Wisps NEVER count as Ordinary_Pellets. The remaining Ordinary_Pellet count excludes wisps, Keys, Bombs and all other items, and collecting any number of wisps never changes it.

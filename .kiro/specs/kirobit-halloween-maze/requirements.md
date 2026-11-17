# Requirements Document

## Introduction

KiroBit is an original, endless, Halloween-themed arcade maze game built for Kiroween 2026. The Player controls an original 8-bit-inspired ghost based on the Kiro mascot. The roles of a classic maze chase are reversed: the Player is the ghost, and an autonomous yellow square hunter named Squareman competes for the same resources.

The Player wins a level by rescuing three captive ghosts from a central cage using keys found in the maze. Squareman wins a level by collecting every ordinary pellet before the Player completes the rescue. Power pellets let the collector eat the opponent for about 5 seconds, and a Squareman power pellet immediately cancels a Player power. Speed pellets temporarily speed up the collector. Dynamic doors open and close at random during play, and neither character controls them. Every level generates a new seeded maze, and progression is endless: no final level and no victory outcome exist. Each level won slightly raises the movement speed of both characters.

The technology is decided: TypeScript, Vite, Canvas 2D, Vitest, and fast-check. The Game runs locally in a browser, uses no paid APIs or online services, and runs smoothly on modest hardware.

Development is phased. Phase 1 delivers the core loop with placeholder graphics. Phase 2 delivers polish: pixel-art visuals, lighting, particles, the user's original soundtrack with reactive audio processing, procedural sound effects, bombs, Ghost Hunt, Spirit Wisps, menus, transitions, HUD polish, and high scores. The Simulation is deterministic, runs at a fixed 60 Hz, and is independent of rendering and audio, so seeded balance simulations and property-based tests can verify behavior.

This document also covers Kiro steering files, Kiro hooks, an automated task execution plan, and performance targets. This is a planning document. No implementation is part of this deliverable.

## Glossary

- **Game**: The KiroBit application running in a browser.
- **Simulation**: The deterministic game-state update logic, independent of rendering and audio.
- **Renderer**: The Canvas 2D component that draws the Simulation state without modifying the Simulation state.
- **Audio_Engine**: The Web Audio component that plays the Soundtrack, processes the Soundtrack, and synthesizes sound effects from Simulation events without modifying the Simulation state.
- **Soundtrack**: The user-owned original music file at `public/audio/Pixel Pulse.wav`, used as the looping background music and never modified by the project.
- **Audio_Bus**: A Web Audio gain stage for a sound category. The Audio_Engine provides a master bus, a music bus, and an sfx bus.
- **Bomb**: A collectible item that the Player stores and activates manually to destroy Destructible_Walls.
- **Bomb_Inventory**: The Bombs stored by the Player, with a maximum of 3.
- **Blast_Radius**: The radius in Cells, configured as bombRadius, of the circular area that a Bomb explosion affects, centered on the Player position at activation.
- **Destructible_Wall**: A Maze wall Cell that a Bomb explosion can permanently remove for the current Level.
- **Indestructible_Wall**: A Maze wall Cell that no Bomb explosion can remove, namely the Cage walls, the Cage gate, the Cage interior, and the Maze outer boundary.
- **Ghost_Hunt**: A special collectible, activated immediately by the Player on collection, that sends all three Allied_Ghosts into the Maze to chase Squareman for the Ghost_Hunt duration, as defined in Requirement 29.
- **Allied_Ghost**: A Captive, rescued or imprisoned, that temporarily moves through the Maze during Ghost_Hunt as a distinct-colour variant of the Player character.
- **Spirit_Wisp**: A collectible that only the Player can collect, that is excluded from the Squareman clear condition, and that awards points and builds the Combo.
- **Combo**: A score multiplier built by collecting Spirit_Wisps within the configured combo window, capped at the configured maximum.
- **Particle_System**: The component that spawns and draws visual particles from Simulation events without modifying the Simulation state.
- **Tick**: One fixed-duration step of the Simulation.
- **Tick_Rate**: The number of Ticks per second, defined as 60.
- **Seed**: An integer that initializes the Simulation pseudo-random number generator.
- **PRNG**: The seeded pseudo-random number generator used by every random decision in the Simulation.
- **Player**: The Kiro-style ghost controlled by the user.
- **Squareman**: The autonomous yellow square hunter. Squareman has a square silhouette at all times.
- **Captive**: One of three ghosts held in the Cage. Each Captive is a color variation of the Player character and shares the Player silhouette and animation style.
- **Cage**: The central enclosure in the Maze that holds the three Captives.
- **Key**: A collectible placed on a floor Cell. Each Key releases one Captive.
- **Carried_Keys**: The Keys currently held by the Player.
- **Rescue**: The release of one Captive from the Cage by the Player delivering one Carried Key to the Cage.
- **Rescued_Captive**: A Captive that has been released; the Captive remains released for the rest of the level.
- **Ordinary_Pellet**: A collectible on a floor Cell that only Squareman collects and that counts toward the Squareman win condition. The remaining Ordinary_Pellet count includes only Ordinary_Pellets and excludes Spirit_Wisps, Keys, Bombs, and other items.
- **Power_Pellet**: A collectible that grants the collector the Power_State.
- **Power_State**: The state in which one character can eat the other character. At most one character holds the Power_State at a time.
- **Power_Duration**: The duration of the Power_State, with a default of 5 seconds.
- **Speed_Pellet**: A collectible, separate from the Power_Pellet, that grants the collector the Speed_State.
- **Speed_State**: The state in which the collector moves faster than the base speed of the level for the Speed_Duration.
- **Speed_Duration**: The duration of the Speed_State, configurable.
- **Door**: A Maze element that alternates between open and closed during play on a schedule drawn from the PRNG. Neither character controls a Door.
- **Maze**: A rectangular grid of Cells generated from a Seed for one level.
- **Cell**: One square of the Maze grid.
- **Maze_Generator**: The seeded component that produces a valid Maze, including all items and Doors, for one level.
- **Level**: One generated Maze with its items, plus the movement speed for the level number.
- **Level_Number**: The count of levels started in the current run, beginning at 1.
- **Level_Speed**: The movement speed shared as a base by the Player and Squareman for a given Level_Number.
- **Lives**: The number of remaining Player attempts in a run, with an initial value of 3.
- **Run**: One play session from the first level until Lives are exhausted.
- **Start_Cell**: The Cell where a character begins a level.
- **Buffered_Turn**: A direction input stored while the character cannot yet turn, applied at the first Tick when the turn is possible.
- **Interpolation**: Rendering of a character at a position between two Cells based on movement progress.
- **Balance_Simulator**: A headless tool that runs the Simulation across many Seeds with automated Player and Squareman policies and reports statistics.
- **Balance_Band**: A configurable range for the ratio of Squareman pellet-clear time to Player rescue-completion time, set from measured evidence and recorded in the Balance_Baseline.
- **Balance_Baseline**: A committed file that records the measured ratio distributions and the Balance_Bands derived from them.
- **Game_Config**: The single module of configurable values, including every default marked as configurable in this document.
- **Property_Test**: A property-based test written with fast-check that checks an invariant over many generated inputs.
- **Steering_File**: A Markdown file in the workspace `.kiro/steering` folder that guides Kiro.
- **Hook_File**: A valid Kiro hook JSON file in the workspace `.kiro/hooks` folder.
- **Frame_Time**: The elapsed wall-clock time to render one displayed frame.
- **High_Score_Store**: The browser local storage entry holding the top 10 scores.
- **Open_Design_Question**: A decision not yet made, listed with a proposed default that is a configurable value and not a permanent rule.

## Requirements

### Requirement 1: Technology and Local Execution

**User Story:** As a developer, I want a fixed local technology stack, so that the Game builds and runs without external services.

#### Acceptance Criteria

1. THE Game SHALL be implemented in TypeScript using Vite as the build tool and Canvas 2D for rendering.
2. THE Game SHALL use Vitest as the test runner and fast-check for Property_Tests.
3. THE Game SHALL run in a browser from a local Vite server or local static build without network access.
4. THE Game SHALL operate without paid APIs or online services.
5. THE Game SHALL keep every project file and every Kiro artifact inside the workspace folder.

### Requirement 2: Deterministic Fixed-Rate Simulation

**User Story:** As a developer, I want a deterministic simulation, so that tests and balance runs are reproducible.

#### Acceptance Criteria

1. THE Simulation SHALL advance in fixed Ticks at the Tick_Rate of 60 Ticks per second.
2. THE Simulation SHALL obtain every random value from the PRNG initialized by the Seed.
3. WHEN the Simulation runs twice with the same Seed and the same input sequence, THE Simulation SHALL produce identical state after every Tick.
4. THE Simulation SHALL read no wall-clock time, no frame timing, and no unseeded random source.
5. WHILE the browser frame rate differs from the Tick_Rate, THE Game SHALL advance the Simulation by the number of Ticks that matches elapsed time using an accumulator.
6. THE Simulation SHALL execute independently of the Renderer, the Particle_System, and the Audio_Engine.
7. WHEN the Renderer, the Particle_System, or the Audio_Engine processes a Simulation event, THE Game SHALL leave the Simulation state unchanged.

### Requirement 3: Grid Movement, Buffered Turns, and Interpolation

**User Story:** As a player, I want responsive grid movement, so that turning through corridors feels reliable.

#### Acceptance Criteria

1. THE Simulation SHALL move each character one Cell at a time along open corridors of the Maze grid.
2. WHEN the user presses a direction that the Player cannot take yet, THE Simulation SHALL store the direction as a Buffered_Turn.
3. WHEN a Buffered_Turn becomes possible, THE Simulation SHALL apply the Buffered_Turn at the first Tick at which the Player can take the direction.
4. WHEN the user presses a new direction before a Buffered_Turn is applied, THE Simulation SHALL replace the stored Buffered_Turn with the new direction.
5. WHEN a character faces a wall or a closed Door, THE Simulation SHALL hold the character in the current Cell.
6. THE Renderer SHALL draw each character at an Interpolated position between the previous Cell and the next Cell.
7. WHEN a character crosses between two edges of a wrap-around passage, WHERE the generated Maze contains such a passage, THE Simulation SHALL place the character at the paired Cell.

### Requirement 4: Procedural Maze Generation

**User Story:** As a player, I want a new random maze every level, so that each level feels different.

#### Acceptance Criteria

1. WHEN a level starts, THE Maze_Generator SHALL generate a new Maze from a Seed derived from the Run Seed and the Level_Number.
2. THE Maze_Generator SHALL place corridors, walls, character Start_Cells, the Cage, three Keys, Ordinary_Pellets, Power_Pellets, Speed_Pellets, and Doors using the PRNG.
3. WHEN the Maze_Generator receives the same Seed and the same Game_Config, THE Maze_Generator SHALL produce an identical Maze.
4. THE Maze_Generator SHALL produce a Maze in which every floor Cell is reachable from the Player Start_Cell when every Door is open.
5. THE Maze_Generator SHALL produce a Maze in which the Player Start_Cell, the Squareman Start_Cell, every Key, every Ordinary_Pellet, every Power_Pellet, every Speed_Pellet, and the Cage entrance are mutually reachable when every Door is open.
6. THE Maze_Generator SHALL place the Cage in the central region of the Maze.
7. THE Maze_Generator SHALL keep the Maze dimensions and the Door count within the limits of the Game_Config, and the limits SHALL stay constant across Level_Numbers by default.
8. IF the Maze_Generator produces a Maze that fails any validity check, THEN THE Maze_Generator SHALL discard the Maze and generate another Maze from the next PRNG state.
9. THE Maze_Generator SHALL generate a Maze within 50 ms on the reference modest hardware defined in Requirement 25 (Acceptance Criterion 5).

### Requirement 5: Dynamic Doors

**User Story:** As a player, I want doors that open and close on their own, so that routes change and I must adapt.

#### Acceptance Criteria

1. WHILE a level is in progress, THE Simulation SHALL open and close Doors on a schedule drawn from the PRNG.
2. THE Simulation SHALL keep every Door under Simulation control and expose no input that lets the Player or Squareman change a Door.
3. WHEN a Door is about to change state, THE Renderer SHALL show a warning indication for at least 30 Ticks before the change.
4. WHEN a Door changes state, THE Renderer SHALL show the new state through a change in color and animation that is distinguishable from the previous state.
5. IF a character occupies a Door Cell at the Tick a Door is scheduled to close, THEN THE Simulation SHALL postpone the closing until the Door Cell is empty.
6. THE Simulation SHALL schedule Doors so that the set of open Doors never leaves any Key, Ordinary_Pellet, Power_Pellet, Speed_Pellet, or the Cage entrance disconnected from the Player for longer than the maximum disconnection duration in the Game_Config.
7. THE Simulation SHALL schedule Doors so that no Cell sequence exists in which a character is confined with no exit for longer than the maximum disconnection duration in the Game_Config.
8. WHEN a Door changes state, THE Squareman pathfinding SHALL recompute routes using the new Door state before the next movement decision.
9. THE Maze_Generator SHALL mark each Door with a minimum open-time ratio from the Game_Config so that every Door is open for at least that ratio of the schedule.

### Requirement 6: Player Character and Captives

**User Story:** As a player, I want to control a recognizable Kiro-style ghost, so that the Game feels original and tied to Kiro.

#### Acceptance Criteria

1. THE Game SHALL present the Player as a rounded white ghost with two oval black eyes drawn in original pixel art.
2. THE Game SHALL present each of the three Captives as a color variation of the Player character that shares the Player silhouette and animation style.
3. THE Game SHALL assign each of the three Captives a distinct color that differs from the Player color and from the other Captives.
4. THE Game SHALL use no classic Pac-Man ghost designs, sprites, or palettes.
5. THE Game SHALL present Squareman as a yellow square and SHALL keep the Squareman silhouette square in every animation frame and every state.
6. THE Game SHALL draw every sprite from original pixel art created for the project.

### Requirement 7: Keys, Cage, and Rescue

**User Story:** As a player, I want to collect keys and free captives, so that I can win each level.

#### Acceptance Criteria

1. WHEN a level starts, THE Simulation SHALL place three Keys in the Maze and three Captives in the Cage.
2. WHEN the Player enters a Key Cell, THE Simulation SHALL add the Key to the Carried_Keys.
3. THE Simulation SHALL allow the Player to hold 1, 2, or 3 Carried_Keys at once.
4. WHEN the Player enters the Cage entrance while holding at least one Carried_Key, THE Simulation SHALL consume the Carried_Keys and release one Captive per consumed Key.
5. THE Simulation SHALL keep each Rescued_Captive released until the level ends.
6. WHEN the third Captive is released, THE Simulation SHALL end the level with a Player win.
7. WHILE the Player holds Carried_Keys, THE Renderer SHALL display the count of Carried_Keys in the HUD.
8. WHEN a Captive is released, THE Simulation SHALL emit a rescue event that the Renderer, the Particle_System, and the Audio_Engine can consume.
9. WHERE the Player is not holding a Key, THE Simulation SHALL leave the Captives in the Cage when the Player enters the Cage entrance.

### Requirement 8: Squareman Autonomous Hunter

**User Story:** As a player, I want Squareman to compete for pellets and also threaten me, so that each level is a race and a chase.

#### Acceptance Criteria

1. WHILE a level is in progress, THE Squareman SHALL move autonomously using pathfinding over the current Door state.
2. WHILE no Power_State is active for the Player, THE Squareman SHALL actively collect Ordinary_Pellets and SHALL compete for Power_Pellets and Speed_Pellets.
3. WHEN Squareman enters an Ordinary_Pellet Cell, THE Simulation SHALL remove the Ordinary_Pellet and increase the Squareman pellet count.
4. WHEN Squareman collects the last Ordinary_Pellet, THE Simulation SHALL end the level with a Squareman win.
5. WHILE the Player holds the Power_State, THE Squareman SHALL move away from the Player.
6. WHILE the Squareman holds the Power_State, THE Squareman SHALL move toward the Player when the Player is within the chase distance in the Game_Config.
7. IF a Door closes on the current route of Squareman, THEN THE Squareman SHALL choose a new route on the next movement decision.
8. THE Squareman AI SHALL draw every random choice from the PRNG.

### Requirement 9: Power Pellets and Role Reversal

**User Story:** As a player, I want dramatic role reversals, so that power pellets create exciting moments.

#### Acceptance Criteria

1. WHILE neither character holds the Power_State, THE Simulation SHALL allow Squareman to eat the Player on Collision.
2. WHEN the Player collects a Power_Pellet, THE Simulation SHALL grant the Player the Power_State for the Power_Duration, with a default of 5 seconds.
3. WHILE the Player holds the Power_State, THE Simulation SHALL allow the Player to eat Squareman on Collision.
4. WHEN Squareman collects a Power_Pellet while the Player holds the Power_State, THE Simulation SHALL cancel the Player Power_State on the same Tick and grant Squareman the Power_State.
5. WHEN the Player collects a Power_Pellet while Squareman holds the Power_State, THE Simulation SHALL cancel the Squareman Power_State on the same Tick and grant the Player the Power_State.
6. THE Simulation SHALL allow at most one character to hold the Power_State on any Tick.
7. WHILE a character holds the Power_State, THE Renderer SHALL make that character blink for the entire Power_Duration.
8. WHEN the Power_State transfers between characters, THE Renderer SHALL show a role-reversal effect and THE Audio_Engine SHALL play a distinct role-reversal sound.
9. WHEN the Power_Duration elapses, THE Simulation SHALL end the Power_State and THE Simulation SHALL return to the state of Acceptance Criterion 1.
10. WHEN a character that holds the Power_State collects another Power_Pellet, THE Simulation SHALL restart the Power_Duration for that character.

### Requirement 10: Speed Pellets

**User Story:** As a player, I want speed pellets, so that I can gain tempo without extra abilities.

#### Acceptance Criteria

1. WHEN a character collects a Speed_Pellet, THE Simulation SHALL grant the collector the Speed_State for the Speed_Duration.
2. WHILE a character holds the Speed_State, THE Simulation SHALL move the character at a speed that is the Level_Speed multiplied by the speed multiplier in the Game_Config.
3. WHILE a character holds the Speed_State, THE Renderer SHALL display a speed animation on the character and THE Particle_System SHALL emit a particle trail.
4. THE Simulation SHALL allow the Speed_State and the Power_State to be held by the same character at the same time.
5. WHEN a character in the Speed_State collects another Speed_Pellet, THE Simulation SHALL restart the Speed_Duration.
6. THE Simulation SHALL grant no invisibility, teleportation, wall-phasing, or other ability through any Speed_Pellet or Power_Pellet.
7. WHEN the Speed_Duration elapses, THE Simulation SHALL return the character to the Level_Speed.

### Requirement 11: Eaten Rules and Lives

**User Story:** As a player, I want clear consequences when I am eaten, so that risk is understandable.

#### Acceptance Criteria

1. WHEN a Run starts, THE Simulation SHALL set Lives to 3.
2. WHEN Squareman eats the Player, THE Simulation SHALL decrease Lives by 1.
3. WHEN Squareman eats the Player, THE Simulation SHALL respawn the Player at the Player Start_Cell.
4. WHEN Squareman eats the Player, THE Simulation SHALL return every Carried_Key to the Maze at a reachable Cell.
5. WHEN the Player eats Squareman, THE Simulation SHALL respawn Squareman after the respawn delay in the Game_Config.
6. WHEN Lives reach 0, THE Simulation SHALL end the Run with a game over state.
7. THE Game_Config SHALL define the invulnerability window, the dropped-key placement rule, the Squareman respawn delay, the Lives reset policy, the consequence of a Squareman level win, the pellet-starved policy, and the game-over policy as configurable values listed in the Open Design Questions section, each with a status of needsDecision, tuning, or resolved.
8. WHILE the Player is within the invulnerability window after a respawn, THE Simulation SHALL ignore Collision with Squareman for the Player.

### Requirement 12: Level Outcomes and Endless Progression

**User Story:** As a player, I want endless levels that get slightly faster, so that the challenge grows without an ending.

#### Acceptance Criteria

1. WHEN the Player wins a level, THE Simulation SHALL generate a new Maze, randomize layout and items, and start the next level.
2. WHEN the Player wins a level, THE Simulation SHALL increase the Level_Speed of both the Player and Squareman by the same configurable increment.
3. THE Simulation SHALL define no final level and no victory outcome.
4. THE Simulation SHALL keep the Maze dimensions and the Door count from growing as a function of Level_Number by default.
5. WHEN Squareman wins a level, THE Simulation SHALL apply the consequence defined by the Game_Config value for a Squareman level win.
6. THE Simulation SHALL cap Level_Speed at a configurable maximum so that the Player can still turn through corridors at 60 Ticks per second.
7. WHEN a level ends, THE Game SHALL display the level outcome and the Level_Number before the next level starts.

### Requirement 13: Phase 1 HUD and Placeholder Graphics

**User Story:** As a developer, I want a playable core loop early, so that gameplay can be tested before art polish.

#### Acceptance Criteria

1. THE Game SHALL deliver Phase 1 containing maze generation, grid movement with Buffered_Turns and Interpolation, Squareman AI that collects pellets, pellets, Keys, the Cage, Doors, Power_Pellets, Speed_Pellets, Lives, endless levels, a minimal HUD, and placeholder graphics.
2. WHILE a level is in progress, THE Renderer SHALL display in the HUD the Lives, the Level_Number, the Carried_Keys count, the Rescued_Captive count, and the remaining Ordinary_Pellet count.
3. WHILE a character holds the Power_State or the Speed_State, THE Renderer SHALL display the remaining duration in the HUD.
4. THE Game SHALL complete Phase 1 before Phase 2 tasks begin.
5. THE tasks document MAY implement the headless Simulation rules of the Phase 2 mechanics (Bombs, Ghost_Hunt, Spirit_Wisps, and Combo) and their tests before the Phase 1 shell, because the Simulation and its tests precede rendering and audio (Requirement 25.1); the visuals, particles, and sounds of those mechanics remain Phase 2 deliverables.

### Requirement 14: Phase 2 Visual Polish

**User Story:** As a player, I want attractive Halloween pixel-art visuals, so that the Game looks finished.

#### Acceptance Criteria

1. WHERE Phase 2 is delivered, THE Renderer SHALL draw modern pixel-art sprites, tiles, and Halloween-themed Maze decoration.
2. WHERE Phase 2 is delivered, THE Renderer SHALL draw lighting and glow around the characters, Power_Pellets, Speed_Pellets, Keys, and Doors.
3. WHERE Phase 2 is delivered, THE Renderer SHALL animate Doors with a glow that distinguishes open from closed.
4. WHERE Phase 2 is delivered, THE Particle_System SHALL emit pellet bursts, pixel explosions when a character is eaten, speed trails, Key effects, and rescue effects.
5. WHERE Phase 2 is delivered, THE Game SHALL provide menus, screen transitions, and a polished HUD.
6. THE Particle_System SHALL cap the active particle count at the limit in the Game_Config.

### Requirement 15: Procedural Sound Effects and Audio Events

**User Story:** As a player, I want original procedural sound effects, so that every game event has clear audio feedback while the Soundtrack plays.

#### Acceptance Criteria

1. WHERE Phase 2 is delivered, THE Audio_Engine SHALL synthesize every sound effect with the Web Audio API and SHALL load no recorded sound-effect files.
2. WHERE Phase 2 is delivered, THE Audio_Engine SHALL play the Soundtrack as the background music during a level, as defined in Requirement 26, and SHALL generate no replacement background music.
3. WHEN a character collects an Ordinary_Pellet, a Power_Pellet, or a Speed_Pellet, THE Audio_Engine SHALL play a sound that differs for each of the three pellet types.
4. WHEN a Door opens or closes, THE Audio_Engine SHALL play a distinct sound for each state change.
5. WHEN a Captive is released, THE Audio_Engine SHALL play a rescue celebration sound.
6. WHEN the Player is eaten or the Run ends, THE Audio_Engine SHALL play a defeat sound.
7. WHEN a level is completed, THE Audio_Engine SHALL play a level-transition sound.
8. WHEN a Bomb is picked up, a Bomb is activated, a Bomb explodes, a Ghost_Hunt starts, a Ghost_Hunt ends, an Allied_Ghost eats Squareman, or a Spirit_Wisp is collected, THE Audio_Engine SHALL play a sound effect that differs for each of those events.
9. THE Audio_Engine SHALL use no Pac-Man audio, melodies, or samples.
10. IF the browser blocks audio playback before user interaction, THEN THE Audio_Engine SHALL resume the AudioContext on the first user gesture and start audio without raising an error.

### Requirement 16: High Scores

**User Story:** As a player, I want a local top-10 list, so that I can compare my runs.

#### Acceptance Criteria

1. WHEN a Run ends, THE Game SHALL compute the final score and compare the score with the High_Score_Store.
2. THE High_Score_Store SHALL hold at most 10 scores sorted from highest to lowest.
3. WHEN a score ranks within the top 10, THE Game SHALL insert the score and persist the High_Score_Store in browser local storage.
4. IF the High_Score_Store is missing, THEN THE Game SHALL start with an empty list.
5. IF the High_Score_Store contains corrupt or invalid data, THEN THE Game SHALL discard the data, start with an empty list, and continue without raising an error.
6. IF browser local storage is unavailable, THEN THE Game SHALL keep scores in memory for the session and continue without raising an error.

### Requirement 17: Maze Validity and Connectivity Tests

**User Story:** As a developer, I want automated maze validity tests, so that impossible layouts never ship.

#### Acceptance Criteria

1. THE test suite SHALL include a Property_Test that checks, for many Seeds, that every generated Maze has a fully connected floor graph when every Door is open.
2. THE test suite SHALL include a Property_Test that checks, for many Seeds, that every Key, Ordinary_Pellet, Power_Pellet, Speed_Pellet, Start_Cell, and the Cage entrance is reachable.
3. THE test suite SHALL include a Property_Test that checks that the same Seed and Game_Config generate an identical Maze.
4. THE test suite SHALL include a Property_Test that checks that the Maze dimensions and the Door count stay within Game_Config limits for every Level_Number.

### Requirement 18: Dynamic Door Reachability Tests

**User Story:** As a developer, I want door tests, so that doors never make a level unfair.

#### Acceptance Criteria

1. THE test suite SHALL include a Property_Test that simulates Door schedules for many Seeds and checks that no objective stays disconnected from the Player longer than the maximum disconnection duration.
2. THE test suite SHALL include a Property_Test that checks that no character can be confined with no exit longer than the maximum disconnection duration.
3. THE test suite SHALL include a test that checks that a character occupying a Door Cell at the closing Tick delays the closing.
4. THE test suite SHALL include a test that checks that Squareman recomputes its route after a Door state change.
5. THE test suite SHALL include a test that checks that every Door emits a warning indication before the state change.

### Requirement 19: Gameplay Mechanics Tests

**User Story:** As a developer, I want mechanic-level tests, so that each rule is verified.

#### Acceptance Criteria

1. THE test suite SHALL include a test that checks that Squareman collects Ordinary_Pellets and ends the level with a Squareman win after the last one.
2. THE test suite SHALL include a test that checks that the Player collects Keys and that each delivered Key releases one Captive.
3. THE test suite SHALL include tests that check the one-key, two-key, and three-key delivery strategies each release the matching number of Captives and complete the level only after three releases.
4. THE test suite SHALL include a Property_Test that checks that Rescued_Captives stay released until the level ends.
5. THE test suite SHALL include tests that check that a Squareman Power_Pellet cancels the Player Power_State on the same Tick and that a Player Power_Pellet cancels the Squareman Power_State on the same Tick.
6. THE test suite SHALL include a Property_Test that checks that at most one character holds the Power_State on every Tick.
7. THE test suite SHALL include tests that check that the Speed_State raises movement speed, expires after the Speed_Duration, and grants no other ability.
8. THE test suite SHALL include a Property_Test that checks that the Level_Speed of both characters increases with each won level and never exceeds the configured cap.
9. THE test suite SHALL include a test that checks that no final level or victory outcome exists after a large number of consecutive Player wins.
10. THE test suite SHALL include tests that check Buffered_Turn storage, replacement, and application.
11. THE test suite SHALL include a test that checks that the Renderer, Particle_System, and Audio_Engine event handlers leave the Simulation state unchanged.
12. THE test suite SHALL include a Property_Test that checks that two runs with the same Seed and input sequence produce identical state.

### Requirement 20: Seeded Balance Simulation

**User Story:** As a designer, I want measurable balance, so that Squareman cannot trivially win by clearing pellets.

#### Acceptance Criteria

1. THE Balance_Simulator SHALL run headless and deterministic simulations across a configurable number of generated Mazes and Level_Numbers, with an initial provisional default of 500 Mazes.
2. THE Balance_Simulator SHALL measure, for each Maze, the Ticks Squareman needs to collect every Ordinary_Pellet and the Ticks the automated Player needs to complete the Rescue.
3. THE Balance_Simulator SHALL FIRST measure the actual distribution of the ratio of Squareman pellet-clear time to Player rescue-completion time and report the mean, median, 5th percentile, and 95th percentile before any Balance_Band is enforced.
4. THE Balance_Simulator SHALL evaluate at least a one-key delivery policy, a two-key delivery policy, and a three-key delivery policy for the automated Player.
5. THE Balance_Simulator SHALL measure the distributions with and without Bombs, with and without Ghost_Hunt, and with and without Spirit_Wisps.
6. WHEN the measurement run completes, THE Balance_Simulator SHALL write the measured distributions and the Balance_Bands derived from the measurements to the Balance_Baseline file committed to the workspace.
7. THE Game_Config SHALL define each Balance_Band as a configurable minimum and maximum per statistic, and the initial values of a 5th-percentile ratio of at least 1.3, a median ratio of at most 3.0, and 500 Mazes SHALL be provisional placeholders that the Balance_Baseline replaces.
8. WHEN a Balance_Baseline exists, THE Balance_Simulator SHALL enforce its Balance_Bands as regression bands.
9. IF the ratio statistics fall outside the enforced Balance_Band, THEN THE Balance_Simulator SHALL report a failing result with the offending statistic and the Seed of the worst Maze.
10. THE test suite SHALL include a test that runs the Balance_Simulator on a smaller Seed set and asserts that the result lies within the Balance_Baseline bands.
11. THE test suite SHALL include a test that checks that the Balance_Simulator output is identical for the same Seed set.
12. THE Balance_Simulator SHALL complete the full run within the time budget in the Game_Config and the smoke run within 30 seconds.

### Requirement 21: Performance and Responsiveness

**User Story:** As a player on modest hardware, I want smooth play, so that the Game feels responsive.

#### Acceptance Criteria

1. WHILE a level is in progress on the reference modest hardware, THE Game SHALL render at a 95th-percentile Frame_Time of at most 16.7 ms.
2. WHEN the user presses a direction key, THE Game SHALL reflect the input in the Simulation no later than the next Tick.
3. WHEN the Simulation advances one Tick, THE Simulation SHALL complete the Tick in at most 2 ms at the 95th percentile.
4. THE Renderer SHALL draw the Maze with a pre-rendered static layer so that per-frame drawing covers only dynamic elements.
5. THE Particle_System SHALL reuse particle objects from a pool to avoid per-frame allocation growth.
6. IF the 95th-percentile Frame_Time exceeds 16.7 ms for 2 consecutive seconds, THEN THE Game SHALL reduce visual effect quality according to the Game_Config without changing the Simulation.
7. THE test suite SHALL include a performance test that measures the Tick duration of the Simulation over at least 10,000 Ticks and asserts the budget in Acceptance Criterion 3.
8. THE test suite SHALL include a measurable check of Frame_Time and input latency that can be run in a browser and reports pass or fail against the budgets in this requirement.

### Requirement 22: Original Art and Audio

**User Story:** As a creator, I want original assets, so that the Game respects intellectual property and Kiroween rules.

#### Acceptance Criteria

1. THE Game SHALL use only original or properly licensed pixel art and sound effects created for the project, and SHALL use the user-owned Soundtrack as the only music.
2. THE Game SHALL use no Pac-Man sprites, ghost designs, audio, melodies, or maze layouts.
3. THE Game SHALL generate every Maze procedurally and SHALL include no hand-copied maze from any existing game.
4. THE repository SHALL contain a short asset notice that states the source and license of every asset category.

### Requirement 23: Kiro Steering Files

**User Story:** As a developer, I want steering files, so that Kiro follows project conventions in every session.

#### Acceptance Criteria

1. THE workspace SHALL contain Steering_Files in the `.kiro/steering` folder covering product scope and glossary, determinism and architecture, testing conventions, performance targets, and art and audio originality rules.
2. THE determinism and architecture Steering_File SHALL state that the Simulation uses the fixed 60 Hz Tick_Rate, the PRNG, and no wall-clock time or unseeded randomness.
3. THE testing conventions Steering_File SHALL state the Vitest and fast-check conventions, the Balance_Baseline procedure, and the required test categories of Requirements 17 to 20 and 31.
4. THE performance targets Steering_File SHALL state the budgets of Requirement 21.
5. THE art and audio originality Steering_File SHALL state the rules of Requirement 22 and Requirement 26, including the rule that the Soundtrack is user-owned and unmodifiable.
6. THE product scope and glossary Steering_File SHALL state the Phase 1 and Phase 2 scope and the Glossary terms of this document.
7. THE workspace SHALL contain Steering_Files in the `.kiro/steering` folder covering the approved product rules, the visual identity, the audio requirements, the technical constraints, the quality standards, and the final status of every Open_Design_Question.
8. THE product rules Steering_File SHALL document the Spirit_Wisp design decision and the pellet accounting rule of Requirement 30.

### Requirement 24: Kiro Hooks

**User Story:** As a developer, I want automated hooks, so that regressions are caught as files are saved.

#### Acceptance Criteria

1. THE workspace SHALL contain Hook_Files in the `.kiro/hooks` folder that are valid Kiro hook JSON.
2. WHEN a Simulation source file is saved, THE Hook_File for Simulation saves SHALL run the Vitest suite for the Simulation.
3. WHEN a maze generator source file or the Game_Config file is saved, THE Hook_File for generator and config saves SHALL run the Balance_Simulator smoke run.

4. WHEN a Simulation source file is saved, THE Hook_File for determinism linting SHALL scan the Simulation source for wall-clock time calls, unseeded random calls, and frame-timing reads, and SHALL report each match.
5. IF the determinism lint finds a match, THEN THE Hook_File for determinism linting SHALL exit with a failing status and print the file and line of each match.
6. WHEN an Audio_Engine source file is saved, THE Hook_File for audio saves SHALL run the audio event tests and the Soundtrack integrity test.
7. WHEN a bomb, Ghost_Hunt, or Spirit_Wisp source file is saved, THE Hook_File for those mechanics SHALL run the Vitest suite for those mechanics.

### Requirement 25: Automated Task Execution Plan

**User Story:** As a developer, I want an executable task plan, so that Kiro can implement, test, and correct with minimal human intervention.

#### Acceptance Criteria

1. THE tasks document SHALL order tasks so that the Simulation and its tests precede rendering, audio, and polish.
2. THE tasks document SHALL assign each implementation task a verifying test or command that Kiro can run.
3. THE tasks document SHALL separate Phase 1 tasks from Phase 2 tasks.
4. THE tasks document SHALL include tasks for the steering files, the hooks, the Balance_Simulator, and the performance checks.
5. THE tasks document SHALL define the reference modest hardware as a browser on a laptop-class CPU without a discrete GPU, with the exact target recorded in the performance targets Steering_File.
6. WHEN a verifying test fails, THE tasks document SHALL direct Kiro to diagnose the failure, correct the code, and rerun the test before the next task begins.
7. THE tasks document SHALL keep all produced files inside the workspace.
8. THE tasks document SHALL organize tasks into dependency-aware phases and waves, and SHALL mark tasks that can safely run in parallel so that an autonomous Run All Tasks execution can parallelize them.
9. THE tasks document SHALL include tasks for the Soundtrack loading, the reactive audio processing, the Bombs, the Ghost_Hunt, the Spirit_Wisps, the Ghost_Hunt duration balance simulation, and the Balance_Baseline measurement.

See Requirement 32 for the autonomy and safety rules of executing agents.

### Requirement 26: User Soundtrack Playback and Reactive Processing

**User Story:** As a player, I want my own track "Pixel Pulse" as the game music that reacts to play, so that the Game carries my composition and still gives audio feedback.

#### Acceptance Criteria

1. THE Audio_Engine SHALL play the Soundtrack at `public/audio/Pixel Pulse.wav` as the looping background music, and SHALL URL-encode the space in the file name when requesting the file.
2. THE Audio_Engine SHALL generate no replacement background music and SHALL perform no tempo-based music generation.
3. THE project SHALL leave the Soundtrack file unmodified, and no task, script, or agent SHALL edit, re-encode, move, rename, or delete the file.
4. THE test suite SHALL include a test that checks that the Soundtrack file is present and that its size and checksum match the values recorded in the repository.
5. THE Audio_Engine SHALL load the Soundtrack by decoding with decodeAudioData or by streaming through a MediaElementAudioSourceNode, with the method chosen in the design.
6. WHILE the Soundtrack is loading, THE Game SHALL display a loading state and remain playable.
7. IF the Soundtrack fails to load or decode, THEN THE Audio_Engine SHALL continue with sound effects only and SHALL raise no unhandled error.
8. THE Audio_Engine SHALL loop the Soundtrack with the smallest audible gap that the file and the chosen loading method allow.
9. WHEN the Player collects a Key, THE Audio_Engine SHALL briefly distort or bitcrush the playing Soundtrack and then return the Soundtrack to its normal sound smoothly.
10. THE Audio_Engine SHALL implement the distortion with a Web Audio processing chain using a WaveShaper node, and WHERE AudioWorklet is available, MAY implement a bitcrusher with an AudioWorklet that falls back to the WaveShaper chain.
11. WHILE the Level_Speed increases across levels, THE Audio_Engine SHALL convey rising urgency through conservative playbackRate, filter, or gain changes of the Soundtrack, or through sound-effect layers, within configurable limits in the Game_Config.
12. THE Game_Config SHALL define the maximum playbackRate change, the distortion duration, and the distortion intensity with conservative defaults that preserve the composition.
13. THE Audio_Engine SHALL leave the Simulation state unchanged for every audio operation.

### Requirement 27: Audio Buses and Volume Controls

**User Story:** As a player, I want balanced and adjustable volume, so that the music and effects are comfortable.

#### Acceptance Criteria

1. THE Audio_Engine SHALL route the Soundtrack through the music Audio_Bus, the sound effects through the sfx Audio_Bus, and both buses through the master Audio_Bus.
2. THE Game SHALL provide adjustable volume for the master, music, and sfx Audio_Buses and a mute control for each.
3. WHEN the user changes a volume or mute setting, THE Game SHALL persist the setting in browser local storage.
4. WHEN the Game starts, THE Game SHALL restore persisted audio settings.
5. IF persisted audio settings are missing, corrupt, or local storage is unavailable, THEN THE Game SHALL use the default audio settings and continue without raising an error.
6. THE Game_Config SHALL define default bus levels at which the sound effects remain audible over the Soundtrack.

### Requirement 28: Bombs

**User Story:** As a player, I want to collect and detonate bombs, so that I can blast new shortcuts through the Maze.

#### Acceptance Criteria

1. WHEN the Player enters a Bomb Cell, THE Simulation SHALL remove the Bomb from the Maze and add one Bomb to the Bomb_Inventory.
2. IF the Bomb_Inventory holds 3 Bombs when the Player enters a Bomb Cell, THEN THE Simulation SHALL leave the Bomb on the Cell and keep the Bomb_Inventory at 3.
3. WHEN the user presses the bomb key, THE Simulation SHALL consume one Bomb and explode it at the Player current location, with a default bomb key of Space.
4. IF the Bomb_Inventory holds 0 Bombs when the user presses the bomb key, THEN THE Simulation SHALL make no change to the Maze or the Bomb_Inventory.
5. WHEN a Bomb explodes, THE Simulation SHALL destroy every Destructible_Wall whose Cell center lies within the Blast_Radius of the Player location, including walls that lie behind other walls.
6. THE Game_Config SHALL define the Blast_Radius as bombRadius with an initial default of 2.5 Cells, because that radius opens neighboring corridors across a single wall layer without opening a whole region of the Maze, and the balance simulation SHALL validate the value.
7. THE Simulation SHALL keep every Indestructible_Wall intact on every explosion.
8. THE Simulation SHALL keep a destroyed wall destroyed until the Level ends and SHALL generate a new Maze with no destroyed walls for the next Level.
9. WHEN a Bomb explodes, THE Simulation SHALL update collision, connectivity, Door reachability gates, and precomputed connectivity tables, SHALL invalidate pathfinding distance-field caches, and SHALL recompute Squareman routes on the same Tick.
10. WHEN a Bomb explodes, THE Simulation SHALL keep the Maze within its bounds, the Cage intact, every item present, every character outside walls, every Door consistent, and every Key and Pellet reachable.
11. THE Maze_Generator SHALL place Bombs at seeded reachable Cells, with a default of 3 Bombs per Level configurable as bombsPerLevel.
12. THE Simulation SHALL leave Bombs uncollectable by Squareman by default.
13. THE Simulation SHALL apply no damage to Squareman and destroy no pellets through a Bomb explosion by default.
14. WHEN a Bomb is picked up, activated, or exploded, THE Game SHALL emit events that the Renderer, the Particle_System, and the Audio_Engine consume.
15. WHERE Phase 2 is delivered, THE Renderer SHALL draw a pixel-art explosion with particles and lighting, and SHALL apply screen shake that the Game_Config can disable.
16. WHILE a level is in progress, THE Renderer SHALL display a Bomb_Inventory indicator with 3 slots in the HUD.

### Requirement 29: Ghost Hunt

**User Story:** As a player, I want a Ghost Hunt power-up that unleashes my ghost friends, so that I can turn the tables on Squareman.

#### Acceptance Criteria

1. WHEN the Player enters a Ghost_Hunt Cell, THE Simulation SHALL activate Ghost_Hunt on the same Tick, and THE Simulation SHALL not store Ghost_Hunt in any inventory.
2. THE Simulation SHALL leave Ghost_Hunt uncollectable by Squareman by default.
3. WHEN Ghost_Hunt activates, THE Simulation SHALL spawn all three Allied_Ghosts, rescued and imprisoned, from the Cage entrance into the Maze.
4. WHILE Ghost_Hunt is active, THE Allied_Ghosts SHALL chase Squareman along paths that use the current Door state and the current destroyed walls.
5. WHILE Ghost_Hunt is active, THE Allied_Ghosts SHALL respect walls and closed Doors and SHALL not phase through walls.
6. WHILE Ghost_Hunt is active, THE Squareman SHALL move away from the Allied_Ghosts.
7. WHEN an Allied_Ghost catches Squareman, THE Simulation SHALL apply the Squareman eaten rule of Requirement 11 and award the eaten-Squareman score to the Player by default.
8. THE Allied_Ghosts SHALL cause no harm to the Player.
9. WHEN Ghost_Hunt ends, THE Simulation SHALL remove each rescued Allied_Ghost from the Maze and keep the ghost rescued.
10. WHEN Ghost_Hunt ends, THE Simulation SHALL return each imprisoned Allied_Ghost to the Cage interior and keep the ghost captive.
11. THE Simulation SHALL never count Ghost_Hunt as a Rescue, and the number of Rescued_Captives and every Captive flag SHALL be identical before and after Ghost_Hunt.
12. THE Simulation SHALL keep the Cage entrance free of blocking Allied_Ghosts so that the Rescue logic of Requirement 7 works during Ghost_Hunt.
13. THE Allied_Ghosts SHALL grant no Power_State to any character, and Ghost_Hunt SHALL neither cancel nor replace the Power_State, so that the single-holder rule of Requirement 9 is unaffected.
14. WHEN the Player collects another Ghost_Hunt while Ghost_Hunt is active, THE Simulation SHALL restart the Ghost_Hunt duration.
15. THE Game_Config SHALL define the Ghost_Hunt duration as ghostHuntTicks with a provisional placeholder default of 480 Ticks (8 seconds) marked tuning.
16. THE Balance_Simulator SHALL include a Ghost_Hunt duration simulation that measures the effect of different durations and SHALL adjust ghostHuntTicks with recorded evidence.
17. THE Maze_Generator SHALL place Ghost_Hunt collectibles at seeded reachable Cells, with a default of 1 per Level configurable as ghostHuntPerLevel.
18. THE Game SHALL present each Allied_Ghost as a distinct-colour variant of the Kiro-inspired character and SHALL use no classic Pac-Man ghost design.
19. WHERE Phase 2 is delivered, THE Renderer and THE Particle_System SHALL show distinctive animations, trails, and particles for Allied_Ghosts, and THE Audio_Engine SHALL play distinctive sounds for the start, the end, and the catches of Ghost_Hunt.

### Requirement 30: Spirit Wisps and Player Collectibles

**User Story:** As a player, I want collectibles that only my ghost can take, so that the Maze never feels empty while Squareman clears his pellets.

#### Acceptance Criteria

1. THE Maze_Generator SHALL place Spirit_Wisps on a seeded set of floor Cells that does not overlap the Cells of Ordinary_Pellets, so that each corridor holds items for both characters.
2. THE Game_Config SHALL define the Spirit_Wisp density as wispDensity, the points per Spirit_Wisp as wispPoints, the combo window as comboWindowTicks, and the maximum Combo multiplier as comboCap.
3. WHEN the Player enters a Spirit_Wisp Cell, THE Simulation SHALL remove the Spirit_Wisp, award wispPoints multiplied by the current Combo multiplier, and emit a particle and sound event.
4. THE Simulation SHALL leave Spirit_Wisps uncollectable by Squareman.
5. THE Simulation SHALL exclude Spirit_Wisps from the remaining Ordinary_Pellet count and from the Squareman clear condition.
6. WHEN the Player collects a Spirit_Wisp within comboWindowTicks of the previous Spirit_Wisp, THE Simulation SHALL increase the Combo multiplier by 1 up to comboCap.
7. IF comboWindowTicks elapse without a Spirit_Wisp collection or the Squareman eats the Player, THEN THE Simulation SHALL reset the Combo multiplier to 1.
8. THE Simulation SHALL let the Combo affect the score only, and SHALL leave the win conditions and the simulation fairness unchanged.
9. THE Renderer SHALL draw Spirit_Wisps as cool-coloured glowing orbs and SHALL draw Ordinary_Pellets in warm yellow-orange so that the two collectible types are visually distinct.
10. THE test suite SHALL include a test that checks that, for many Seeds, every Maze quadrant and every corridor segment within a configured number of Cells of the Player start path contains at least the configured minimum count of Spirit_Wisps and of Ordinary_Pellets.
11. THE test suite SHALL include a Property_Test that checks that collecting any number of Spirit_Wisps never changes the remaining Ordinary_Pellet count.

### Requirement 31: Mandatory Test Coverage

**User Story:** As a developer, I want mandatory test categories, so that each new rule is verified before it ships.

#### Acceptance Criteria

1. THE test suite SHALL include mandatory tests for maze validity and reachability, including after Bomb explosions.
2. THE test suite SHALL include mandatory tests for random Door safety.
3. THE test suite SHALL include mandatory tests that check that Bomb explosions destroy Destructible_Walls inside the Blast_Radius and never destroy Indestructible_Walls.
4. THE test suite SHALL include mandatory tests that check that pathfinding distance fields and Squareman routes update after explosions.
5. THE test suite SHALL include mandatory tests for Ghost_Hunt behavior, including the Property_Test that the rescued count and Captive flags never change through Ghost_Hunt.
6. THE test suite SHALL include mandatory tests for Lives, respawns, and dropped Keys.
7. THE test suite SHALL include mandatory tests for Power_Pellet cancellation.
8. THE test suite SHALL include mandatory tests for endless progression.
9. THE test suite SHALL include mandatory tests for Soundtrack loading, the Soundtrack failure fallback, and gameplay-triggered audio events using a mock AudioContext.
10. THE test suite SHALL include mandatory tests for the two competing victory conditions, the Squareman pellet clear and the three-Captive Rescue.
11. THE test suite SHALL include a mandatory reproducible seeded Balance_Simulator run across many Mazes and Levels.

### Requirement 32: Kiro Workflow, Autonomy, and Safety

**User Story:** As a developer, I want executing agents to work autonomously and safely, so that tasks finish without needless questions or damage.

#### Acceptance Criteria

1. WHEN a decision is determinable by tests, THE executing agent SHALL implement, test, diagnose, fix, and rerun without asking the user.
2. IF a decision is a genuine product decision, THEN THE executing agent SHALL ask the user.
3. THE executing agent SHALL not access projects outside the workspace.
4. THE executing agent SHALL use no paid services, SHALL not publish the project, and SHALL perform no destructive operations.
5. THE executing agent SHALL not modify or delete `public/audio/Pixel Pulse.wav`.
6. THE tasks document SHALL define waves in which tasks without shared files or dependencies run in parallel.

### Requirement 33: Score-Based Extra Lives (1UP)
**User Story:** As a player, I want extra lives for reaching score milestones, so that strong play is rewarded in a long endless run.
#### Acceptance Criteria
1. THE Game_Config SHALL define `oneUpThresholds` (ascending score milestones, default 10000, 25000, 50000) and `oneUpRepeat` (interval after the last listed milestone, default 50000), so the default milestones are 10000, 25000, 50000, 100000, 150000 and every further 50000.
2. WHEN the Player's cumulative score reaches or passes a milestone that has not been awarded in the current Run, THE Simulation SHALL add one life for that milestone on the same Tick and SHALL emit one `ExtraLife` event per awarded milestone.
3. WHEN a single scoring event crosses several milestones, THE Simulation SHALL award one life for each crossed milestone on that Tick.
4. THE Simulation SHALL award each milestone at most once per Run, and losing a life SHALL reset neither the score nor the awarded milestones.
5. Lives earned through milestones SHALL carry across levels and SHALL coexist with the `livesResetPolicy` extra life every 5 won levels.
6. THE milestone rule SHALL apply identically to normal Runs and to Runs started with the 30-lives cheat, and cheat Runs SHALL keep their separate high score table.
7. THE milestone rule SHALL change only `lives` and the awarded-milestone counter. It SHALL NOT change Squareman behavior, speeds, collision, Maze generation, item placement, scoring values or victory conditions. With the same Seed, Game_Config and inputs, every state field other than `lives` and the milestone counter SHALL be identical with and without milestones while both Runs have at least one life.
8. WHERE Phase 2 is delivered, THE Renderer SHALL show an animated "1UP!" message and particles, THE HUD SHALL show the new lives count on the next rendered frame, and THE Audio_Engine SHALL play a distinctive procedurally synthesized 1UP sound.
### Requirement 34: Endless Level Milestone Celebrations
**User Story:** As a player, I want a celebration at very high levels, so that reaching them feels like an arcade milestone while the game stays endless.
#### Acceptance Criteria
1. THE Game_Config SHALL define `celebrationFirstLevel` (default 100) and `celebrationEvery` (default 50). A celebration level is any Level_Number L with L >= `celebrationFirstLevel` and (L - `celebrationFirstLevel`) divisible by `celebrationEvery`.
2. WHEN the Player starts a celebration level for the first time in a Run, THE Simulation SHALL emit exactly one `LevelMilestone` event carrying the Level_Number.
3. IF the Player retries a celebration level after losing a life, THEN THE Simulation SHALL NOT emit `LevelMilestone` again for that level.
4. WHERE Phase 2 is delivered, THE shell SHALL show a "CONGRATULATIONS!" screen with the achieved Level_Number, distinctive particles and effects, and a short original procedurally synthesized fanfare, during a level-start hold of `celebrationHoldMs` (default 3000 ms) that the confirm key may skip. Play SHALL then continue normally.
5. A celebration SHALL NOT end the Run, reset progression, change score, lives, Level_Speed or difficulty, or create a victory outcome.
6. Tests SHALL verify high milestones by constructing Runs at a chosen level in test code and through a development-only gallery page. THE production build SHALL contain no level skip, God Mode or hidden developer shortcut.
### Requirement 35: Release Preparation Without Publishing
**User Story:** As the owner, I want the repository ready for a possible public and commercial release, so that I can decide on publishing with clear facts.
#### Acceptance Criteria
1. THE repository SHALL contain a `README.md` with a description, requirements, installation, run commands, gameplay rules, controls, Character Workshop steps and development commands, and every npm command it names SHALL exist in `package.json`.
2. THE `.gitignore` SHALL exclude dependencies, build output, logs, temporary agent files, environment and secret files, screenshots and machine-specific editor or OS files, and SHALL NOT exclude `.kiro/` or the Specs.
3. THE cleanup SHALL remove only temporary agent files (root scratch scripts, logs and exit markers). Experimental evidence (balance baselines, calibration results, measurement summaries) SHALL be preserved, moved if needed into `tools/balance/evidence/`.
4. THE repository SHALL contain a `RELEASE-AUDIT.md` that lists every third-party library with its license, every asset category with its source, fonts, music and trademarks, flags items needing permission for commercial distribution (including the Kiro name, the Kiro mascot-inspired sprite and the KiroBit name), states that a hackathon submission grants no commercial rights to the Kiro brand, and recommends license and release options.
5. THE executing agent SHALL NOT add a final license file, change asset rights, create a remote repository, push, publish or change repository visibility.
6. `public/audio/Pixel Pulse.wav` SHALL remain byte-identical (size and SHA-256 unchanged).

### Requirement 36: Selectable Difficulty

**User Story:** As a player, I want to choose a harder difficulty before a run, so that skilled players get a faster Squareman without other rule changes.

#### Acceptance Criteria

1. THE shell SHALL offer a difficulty selector before a new Run starts with the modes NORMAL (Squareman speed x1.00), VERY HARD (x1.15) and EXTREME (x1.25), and NORMAL SHALL be the default.
2. THE Game_Config SHALL define `hunterSpeedPermille` (integer, default 1000; VERY HARD 1150; EXTREME 1250). THE Simulation SHALL compute Squareman's movement units per Tick as `round(levelUnits * hunterSpeedPermille / 1000)`, where `levelUnits` is the existing per-level value, so the existing Level_Speed progression is preserved. Speed_State and Power_State multipliers SHALL apply on top as before.
3. WITH `hunterSpeedPermille` 1000, every Simulation state after every Tick SHALL be identical to the game before this requirement for the same Seed, Game_Config and inputs.
4. THE difficulty SHALL NOT change the Player's speed, Squareman AI, Maze generation, items, abilities, power-ups, collision, scoring or win conditions.
5. THE 30-lives cheat and the 1UP milestones SHALL work identically in all three modes.
6. High score entries SHALL record the difficulty (entries without it load as NORMAL), and cheat Runs SHALL stay in their separate table.
7. THE HUD SHALL show the difficulty during play, and THE game-over screen SHALL show it.

## Open Design Questions

Every proposed default below is a configurable value in the Game_Config and not a permanent rule.

| # | Question | Proposed Default | Config Key | Status |
|---|----------|------------------|------------|--------|
| 1 | How long is the Player invulnerable after a respawn? | 2 seconds, with a blink effect distinct from the Power_State blink | invulnerabilityTicks | needsDecision |
| 2 | Where do dropped Keys return to the Maze when the Player is eaten? | The nearest reachable floor Cell to the eaten position that holds no other Key, never inside the Cage | droppedKeyPlacement | needsDecision |
| 3 | How long is the Squareman respawn delay after the Player eats Squareman? | 3 seconds, then respawn at the Squareman Start_Cell | hunterRespawnTicks | needsDecision |
| 4 | Do Lives reset at the start of each level? | No. Lives carry across levels in a Run, and one extra life is awarded every 5 levels | livesResetPolicy | needsDecision |
| 5 | What happens when Squareman wins a level by collecting all Ordinary_Pellets? | The Player loses 1 life and a new Maze starts at the same Level_Number | hunterWinConsequence | needsDecision |
| 6 | Does a pellet-starved level restart or cost a life? | It costs 1 life and generates a new Maze at the same Level_Number, with no restart of the old Maze | pelletStarvedPolicy | needsDecision |
| 7 | How does the Run end? | When Lives reach 0, the Game shows game over, then the high score entry | gameOverPolicy | needsDecision |
| 8 | What is the Level_Speed increment per won level and the cap? | Increment of 3 percent of the base speed, capped at 160 percent of the base speed | speedIncrement, speedCap | tuning |
| 9 | What is the Speed_State multiplier and Speed_Duration? | 1.5 times Level_Speed for 4 seconds | speedMultiplier, speedDurationTicks | tuning |
| 10 | What are the Maze dimensions, Door count, and maximum disconnection duration? | 21 by 21 Cells, 4 Doors, 3 seconds maximum disconnection, minimum open-time ratio of 0.5 | mazeSize, doorCount, maxDisconnectTicks, doorMinOpenRatio | tuning |
| 11 | How is the final score computed? | 10 per Ordinary_Pellet, 500 per Rescued_Captive, 100 per eaten Squareman, plus 1000 per level won | scoreWeights | resolved |
| 12 | What is the default Squareman chase distance and flee behavior? | Chase within 8 Cells while Squareman holds the Power_State, flee otherwise while the Player holds the Power_State | hunterChaseDistance | tuning |
| 13 | What are the particle cap and effect quality tiers? | 500 active particles, three quality tiers (high, medium, low) | particleCap, qualityTiers | resolved |
| 14 | What is the Blast_Radius of a Bomb? | 2.5 Cells, validated by tests and simulations | bombRadius | tuning |
| 15 | Does the explosion affect Squareman or pellets? | No. The explosion only destroys walls | bombAffectsHunter, bombAffectsPellets | needsDecision |
| 16 | Who can collect Bombs and Ghost_Hunt? | Only the Player. Squareman collects neither | hunterCollectsBombs, hunterCollectsGhostHunt | needsDecision |
| 17 | How long does Ghost_Hunt last and how many appear per Level? | 480 Ticks (8 seconds) as a placeholder, 1 per Level, set by balance simulation | ghostHuntTicks, ghostHuntPerLevel | tuning |
| 18 | What are the Spirit_Wisp density, points, and Combo window? | Separate non-overlapping cells, density 0.5 of eligible remaining Cells, 20 points, 120-Tick window, cap 5 | wispDensity, wispPoints, comboWindowTicks, comboCap | tuning |
| 19 | How intense is the Soundtrack processing? | Key distortion of 250 ms at low intensity, playbackRate change of at most 5 percent across levels | soundtrackDistortionMs, soundtrackMaxRateShift | tuning |
| 20 | How many Bombs appear per Level and what is the Bomb key? | 3 per Level, Space key | bombsPerLevel, bombKey | tuning |

Rows 14 to 20 were added for the Soundtrack, Bombs, Ghost_Hunt, and Spirit_Wisps and are provisional.

Status meaning: needsDecision means the user must confirm the behavior (lives, respawn, dropped Keys, eaten behavior) and the default is only a placeholder; tuning means the value is settled by the Balance_Simulator or playtesting; resolved means the default is accepted unless changed.

// Simulation assembly, part 1: createRun and level setup (task 16.1).
// step() is added by tasks 16.2+. Pure and deterministic: no DOM, no wall clock, no unseeded randomness.
//
// The Hunter brain is not part of GameState, so a Run holds it next to the state.
// Policy decisions (documented, the design is silent on them):
//  - Bombs reset to 0 at every new level and attempt: the wall layer is a per-level copy
//    (design "Bombs"), so an inventory carried over would outlive the layer it was meant for.
//  - Captives, carried Keys, Ghost Hunt and the Combo window reset for every new Maze.
//  - Lives and Score carry over. Lives come from progression.
//  - There is no victory phase: the only terminal phase is 'gameOver'.

import { ConfigError, validateConfig } from './config';
import type { GameConfig } from './config';
import { activateBomb, clearAllyRoutes, pickupBomb } from './bombs';
import { createReachabilityGate, initDoors, openMask, rebuildDerived, stepDoors } from './doors';
import type { DerivedTables } from './doors';
import type { GameEvent } from './events';
import { emptyGhostHunt, stepGhostHunt } from './ghostHunt';
import { assertValidState, invariantChecksEnabled } from './invariants';
import { createHunterBrain, decideHunter, notifyHunterEvents } from './hunter';
import type { HunterBrain } from './hunter';
import { generateMaze } from './maze/generate';
import { wrapPartner } from './grid';
import { stepMovement } from './movement';
import type { MoveEnv } from './movement';
import { speedUnits, tickPowerTimers } from './powers';
import {
  applyOutcome,
  currentMazeSeed,
  initialProgression,
  levelSeeds,
  levelSpeedFactor,
  unitsPerTick,
} from './progression';
import type { LevelOutcome, ProgressionState } from './progression';
import { evaluateOutcome, resolveCollisions, resolvePickups, resolveRescue } from './rules';
import type { PickupHandlers } from './rules';
import { awardOneUps } from './oneUp';
import { isCelebrationLevel } from './milestones';
import { INITIAL_COMBO, collectWisp, scoreFor, tickCombo } from './score';
import { ItemKind } from './types';
import type { Cell, Character, Dir, GameState, Input, ItemState, Maze, Who } from './types';

/** Everything a running game needs: the state plus the state-external parts. */
export interface Run {
  readonly state: GameState;
  readonly brain: HunterBrain;
  readonly progression: ProgressionState;
  readonly runSeed: number;
  readonly cfg: GameConfig;
  /** Highest celebration level already announced (LevelMilestone); never lowers. */
  readonly celebratedUpTo: number;
}

function makeCharacter(id: Who, cell: Cell): Character {
  return {
    id,
    cell: { x: cell.x, y: cell.y },
    next: null,
    progress: 0,
    dir: null,
    buffered: null,
    power: 0,
    speed: 0,
    invulnerable: 0,
    respawnIn: 0,
  };
}

function buildItems(maze: Maze): ItemState {
  const kinds = new Uint8Array(maze.width * maze.height);
  const put = (cells: readonly Cell[], kind: number): void => {
    for (const c of cells) kinds[c.y * maze.width + c.x] = kind;
  };
  put(maze.ordinary, ItemKind.Ordinary);
  put(maze.power, ItemKind.Power);
  put(maze.speed, ItemKind.Speed);
  put(maze.wisps, ItemKind.Wisp);
  put(maze.bombs, ItemKind.Bomb);
  put(maze.ghostHunt, ItemKind.GhostHunt);
  return {
    kinds,
    keys: maze.keys.map((c) => ({ x: c.x, y: c.y })),
    ordinaryRemaining: maze.ordinary.length,
    wispsRemaining: maze.wisps.length,
    bombsOnFloor: maze.bombs.length,
    ghostHuntOnFloor: maze.ghostHunt.length,
  };
}

/** Builds the initial GameState of one level attempt. */
export function buildLevelState(
  runSeed: number,
  prog: Pick<ProgressionState, 'levelNumber' | 'retryIndex' | 'lives'>,
  cfg: GameConfig,
  score = 0,
  maze?: Maze,
  oneUpsAwarded = 0,
): GameState {
  const m = maze ?? generateMaze(runSeed, prog.levelNumber, cfg, prog.retryIndex);
  const seeds = levelSeeds(runSeed, prog.levelNumber, prog.retryIndex);
  const walls = { tiles: m.tiles.slice(), version: 0, destroyed: 0 };
  const doors = initDoors(m.doors, 0, cfg);
  const objectives: Cell[] = [...m.keys, m.cage.entrance];
  const derived = rebuildDerived(walls, m.doors, m, objectives, openMask(doors));
  return {
    runSeed,
    levelNumber: prog.levelNumber,
    tick: 0,
    rng: seeds.items,
    maze: m,
    player: makeCharacter('player', m.playerStart),
    hunter: makeCharacter('hunter', m.hunterStart),
    items: buildItems(m),
    carriedKeys: 0,
    captives: [false, false, false],
    doors,
    bombs: 0,
    walls,
    derived,
    ghostHunt: emptyGhostHunt(m.cage.entrance),
    comboCount: INITIAL_COMBO.comboCount,
    comboTicksLeft: INITIAL_COMBO.comboTicksLeft,
    comboChainPoints: 0,
    lives: prog.lives,
    score,
    oneUpsAwarded,
    phase: 'playing',
    outcome: null,
  };
}

/** Validates the config (throws ConfigError), generates the first Maze and builds the Run. */
export function createRun(runSeed: number, cfg: GameConfig): Run {
  const problems = validateConfig(cfg);
  if (problems.length > 0) throw new ConfigError(problems);
  const progression = initialProgression(cfg);
  const state = buildLevelState(runSeed, progression, cfg);
  const brain = createHunterBrain(runSeed, progression.levelNumber, progression.retryIndex);
  return { state, brain, progression, runSeed, cfg, celebratedUpTo: 0 };
}

/**
 * Level transition. A player win goes to the next level with a new Maze and a higher Level_Speed.
 * A Squareman win or a pellet-starved level costs a life and gives a new Maze at the same level.
 * Once the game is over (or the last life is lost) the run stops with phase 'gameOver'.
 */
export function advanceLevel(run: Run, outcome: LevelOutcome): Run {
  if (run.progression.gameOver || run.state.phase === 'gameOver') return run;
  const progression = applyOutcome(run.progression, outcome, run.cfg);
  if (progression.gameOver) {
    return {
      ...run,
      progression,
      state: {
        ...run.state,
        lives: progression.lives,
        phase: 'gameOver',
        outcome: outcome === 'playerWin' ? 'playerWin' : 'hunterWin',
      },
    };
  }
  const state = buildLevelState(run.runSeed, progression, run.cfg, run.state.score, undefined, run.state.oneUpsAwarded);
  const brain = createHunterBrain(run.runSeed, progression.levelNumber, progression.retryIndex);
  return { ...run, state, brain, progression };
}

/** Fixed-point movement units per Tick of both characters at the run's current level (before Speed_State). */
export function runUnitsPerTick(run: Run): number {
  return unitsPerTick(run.progression.levelNumber, run.cfg);
}

/** Squareman's base units per Tick: the level units scaled by hunterSpeedPermille (integer math; 1000 = unchanged). */
export function hunterBaseUnits(levelUnits: number, cfg: Pick<GameConfig, 'hunterSpeedPermille'>): number {
  return cfg.hunterSpeedPermille === 1000 ? levelUnits : Math.round((levelUnits * cfg.hunterSpeedPermille) / 1000);
}

/** Seed of the Maze of the run's current attempt (for tests and tools). */
export function runMazeSeed(run: Run): number {
  return currentMazeSeed(run.runSeed, run.progression);
}

// ---------------------------------------------------------------------------
// Simulation assembly, part 2: the per-Tick `step` (task 16.2).
// Order follows the design "Per-Tick order inside step". Task 16.3 wires the special
// pickup handlers (Bomb, Ghost_Hunt, Wisp); until then those items are left untouched
// and the Ghost Hunt `pickup` command is never sent.
// ---------------------------------------------------------------------------

export interface StepResult {
  readonly run: Run;
  readonly events: GameEvent[];
}

/** Outcome of the level in `state`, for the level-end transition. */
function levelOutcomeOf(state: GameState): LevelOutcome {
  return state.outcome === 'playerWin' ? 'playerWin' : 'hunterWin';
}

/**
 * Advances the run by one Tick. Pure: the input run is never mutated.
 * Phase 'levelEnd': only `input.continue` does anything (next level or retry).
 * Phase 'gameOver': a no-op.
 */
export function step(run: Run, input: Input): StepResult {
  const s0 = run.state;
  if (s0.phase === 'levelEnd') {
    if (!input.continue) return { run, events: [] };
    // Lives lost to the Hunter during the level live in GameState; carry them into progression.
    const synced: Run = { ...run, progression: { ...run.progression, lives: s0.lives } };
    let next = advanceLevel(synced, levelOutcomeOf(s0));
    const events: GameEvent[] = [];
    if (next.state.phase === 'gameOver') {
      events.push({ t: 'GameOver', score: next.state.score });
    } else {
      const level = next.progression.levelNumber;
      events.push({ t: 'LevelStarted', level, speedFactor: levelSpeedFactor(level, next.cfg) });
      // A new level (not a retry of the same one) that is a celebration level above the last one announced.
      if (level > run.progression.levelNumber && level > next.celebratedUpTo && isCelebrationLevel(level, next.cfg)) {
        events.push({ t: 'LevelMilestone', level });
        next = { ...next, celebratedUpTo: level };
      }
    }
    return { run: next, events };
  }
  if (s0.phase !== 'playing') return { run, events: [] };

  const cfg = run.cfg;
  const events: GameEvent[] = [];
  let s: GameState = s0;
  let brain = run.brain;
  const prev = { player: { ...s0.player.cell }, hunter: { ...s0.hunter.cell } };
  const levelUnits = unitsPerTick(s.levelNumber, cfg);
  const hunterUnits = hunterBaseUnits(levelUnits, cfg);

  // 1. Input: the pressed direction is buffered by stepMovement (step 6) for the Player.
  // 2. Bomb resolution, before anything reads walls or tables.
  let gh = s.ghostHunt;
  if (input.bomb && s.bombs > 0) {
    const r = activateBomb(
      {
        bombs: s.bombs,
        walls: s.walls,
        derived: s.derived as DerivedTables,
        player: s.player,
        maze: s.maze,
        keys: s.items.keys,
      },
      cfg,
    );
    s = { ...s, bombs: r.bombs, walls: r.walls, derived: r.derived };
    events.push(...r.events);
    if (r.clearAllyRoutes) gh = { ...gh, allies: clearAllyRoutes(gh.allies) as typeof gh.allies };
  }

  // 3. Door schedule with occupancy and reachability gates.
  const objectives: Cell[] = [...s.items.keys, s.maze.cage.entrance];
  const gate = createReachabilityGate(s.derived as DerivedTables, s.maze.doors, s.maze, objectives, cfg.maxDisconnectTicks);
  const d = stepDoors(
    s.maze.doors,
    s.doors,
    s.tick + 1,
    { player: s.player, hunter: s.hunter },
    cfg,
    [gate],
  );
  s = { ...s, doors: d.doors, derived: { ...s.derived, doorMask: openMask(d.doors) } };
  events.push(...d.events);

  // 4. Hunter decision (routes are dropped on DoorChanged / WallsDestroyed of this Tick).
  brain = notifyHunterEvents(brain, events);
  // Mid-step the Hunter decides from the Cell it is about to reach, and that decision is
  // buffered for the arrival instead of being pressed. Deciding from the departure Cell (or
  // pressing a reverse) would flip the step back and forth every Tick without ever reaching
  // a boundary. Only FLEE may reverse mid-step, to escape an empowered Player at once.
  const hn = s.hunter.next;
  const midStep = hn !== null && s.hunter.progress > 0 && s.hunter.respawnIn <= 0;
  let decisionState = s;
  if (midStep) {
    const at = wrapPartner(s.maze.wrapPairs, hn.x, hn.y) ?? hn;
    decisionState = { ...s, hunter: { ...s.hunter, cell: { x: at.x, y: at.y } } };
  }
  const decision = decideHunter(decisionState, brain, cfg);
  brain = decision.brain;
  let hunterPress: Dir | null = decision.dir;
  if (midStep && decision.dir !== null && decision.mode !== 'FLEE') {
    s = { ...s, hunter: { ...s.hunter, buffered: decision.dir } };
    hunterPress = null;
  }

  // 5. Ghost Hunt update (never touches captives or carriedKeys).
  const ghr = stepGhostHunt(
    gh,
    {
      walls: s.walls,
      doors: s.doors,
      derived: s.derived,
      hunter: s.hunter,
      playerCell: s.player.cell,
      cage: s.maze.cage,
      tick: s.tick,
      nav: s.maze,
      hunterStart: s.maze.hunterStart,
      rescued: [s.captives[0], s.captives[1], s.captives[2]],
    },
    cfg,
    { playerUnits: levelUnits },
  );
  s = { ...s, ghostHunt: ghr.gh };
  events.push(...ghr.events);

  // 6. Movement: Player and Hunter at level units x speed multiplier.
  const env: MoveEnv = {
    width: s.maze.width,
    height: s.maze.height,
    tiles: s.walls.tiles,
    doors: s.maze.doors,
    doorMask: s.derived.doorMask,
    wrapPairs: s.maze.wrapPairs,
    ice: s.maze.ice,
  };
  const player = stepMovement(s.player, input.pressed, speedUnits(levelUnits, s.player, cfg), env);
  const hunter =
    s.hunter.respawnIn > 0
      ? s.hunter
      : stepMovement(s.hunter, hunterPress, speedUnits(hunterUnits, s.hunter, cfg), env);
  s = { ...s, player, hunter };

  // 7. Pickups.
  // Bomb, Ghost_Hunt and Wisp are Player-only (the collector mask runs before the handlers).
  // Ghost Hunt choice: step 5 (the timer/spawn update) has already run this Tick, and pickups come
  // after movement, so the pickup command is sent to stepGhostHunt right here, in the SAME Tick.
  // The hunt therefore starts this Tick with the full duration and the ally stagger; the first
  // countdown and the first ally step happen next Tick. Rescue progress is never read or written.
  const handlers: PickupHandlers = {
    bomb: (st, cell) => {
      const r = pickupBomb(st.bombs, cfg.bombCapacity);
      if (!r.collected) return { state: st, events: [] };
      const kinds = st.items.kinds.slice();
      kinds[cell.y * st.maze.width + cell.x] = ItemKind.None;
      return {
        state: {
          ...st,
          bombs: r.inventory,
          items: { ...st.items, kinds, bombsOnFloor: st.items.bombsOnFloor - 1 },
        },
        events: [{ t: 'BombCollected', cell: { x: cell.x, y: cell.y }, inventory: r.inventory }],
      };
    },
    wisp: (st, cell) => {
      const w = collectWisp({ comboCount: st.comboCount, comboTicksLeft: st.comboTicksLeft }, { x: cell.x, y: cell.y }, cfg);
      const kinds = st.items.kinds.slice();
      kinds[cell.y * st.maze.width + cell.x] = ItemKind.None;
      return {
        state: {
          ...st,
          score: st.score + w.points + w.event.bonus,
          comboChainPoints: (st.comboTicksLeft > 0 ? st.comboChainPoints : 0) + w.points + w.event.bonus,
          comboCount: w.combo.comboCount,
          comboTicksLeft: w.combo.comboTicksLeft,
          items: { ...st.items, kinds, wispsRemaining: st.items.wispsRemaining - 1 },
        },
        events: [w.event],
      };
    },
    ghostHunt: (st, cell) => {
      const kinds = st.items.kinds.slice();
      kinds[cell.y * st.maze.width + cell.x] = ItemKind.None;
      const start = stepGhostHunt(
        st.ghostHunt,
        {
          walls: st.walls,
          doors: st.doors,
          derived: st.derived,
          hunter: st.hunter,
          playerCell: st.player.cell,
          cage: st.maze.cage,
          tick: st.tick,
          rescued: [st.captives[0], st.captives[1], st.captives[2]],
        },
        cfg,
        { pickup: true, playerUnits: levelUnits },
      );
      return {
        state: {
          ...st,
          ghostHunt: start.gh,
          items: { ...st.items, kinds, ghostHuntOnFloor: st.items.ghostHuntOnFloor - 1 },
        },
        events: start.events,
      };
    },
  };
  const pk = resolvePickups(s, cfg, handlers);
  s = pk.state;
  events.push(...pk.events);

  // 8. Collisions (prev cells for swap detection, ally catches from Ghost Hunt).
  const col = resolveCollisions(s, prev, cfg, ghr.catches);
  s = col.state;
  events.push(...col.events);

  // 9. Rescue at the Cage entrance.
  const rs = resolveRescue(s, cfg);
  s = rs.state;
  events.push(...rs.events);

  // 10. Timers: power and speed, invulnerability and respawn, combo.
  const pt = tickPowerTimers({ player: s.player, hunter: s.hunter });
  events.push(...pt.events);
  const dec = (c: Character): Character => ({
    ...c,
    invulnerable: Math.max(0, c.invulnerable - 1),
    respawnIn: Math.max(0, c.respawnIn - 1),
  });
  const cb = tickCombo({ comboCount: s.comboCount, comboTicksLeft: s.comboTicksLeft });
  s = {
    ...s,
    player: dec(pt.player),
    hunter: dec(pt.hunter),
    comboCount: cb.combo.comboCount,
    comboTicksLeft: cb.combo.comboTicksLeft,
  };
  events.push(...cb.events);

  // 11. Outcome (Rescue has already run, so a simultaneous win goes to the Player).
  const oc = evaluateOutcome(s);
  s = oc.state;
  events.push(...oc.events);
  if (s.phase !== 'playing') {
    if (s.outcome === 'playerWin') s = { ...s, score: s.score + scoreFor(cfg.scoreWeights, 'level') };
    const end = stepGhostHunt(s.ghostHunt, {
      walls: s.walls,
      doors: s.doors,
      derived: s.derived,
      hunter: s.hunter,
      playerCell: s.player.cell,
      cage: s.maze.cage,
      tick: s.tick,
      rescued: [s.captives[0], s.captives[1], s.captives[2]],
    }, cfg, { levelEnd: true });
    s = { ...s, ghostHunt: end.gh };
    events.push(...end.events);
  }

  s = { ...s, tick: s0.tick + 1 };

  // 1UP milestones, once per Tick after every score source (pickups, wisps and combo bonus,
  // hunter eaten, level bonus). A milestone crossed on the Tick the last life is lost keeps the run alive.
  const oneUp = awardOneUps(s.score, s.oneUpsAwarded, cfg);
  const extra = oneUp.milestones.length;
  if (extra > 0) {
    let lives = s.lives;
    for (const milestone of oneUp.milestones) {
      lives += 1;
      events.push({ t: 'ExtraLife', lives, milestone });
    }
    s = { ...s, lives, oneUpsAwarded: oneUp.awarded };
    if (s.phase === 'gameOver') {
      s = { ...s, phase: 'playing' };
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i]!.t === 'GameOver') events.splice(i, 1);
      }
    }
  }
  if (invariantChecksEnabled()) assertValidState(s, cfg);
  // The last life lost to the Hunter ends the run here (phase 'gameOver' from the eaten rule).
  const progression =
    s.phase === 'gameOver'
      ? { ...run.progression, lives: s.lives, gameOver: true }
      : extra > 0
        ? { ...run.progression, lives: run.progression.lives + extra }
        : run.progression;
  return { run: { ...run, state: s, brain, progression }, events };
}

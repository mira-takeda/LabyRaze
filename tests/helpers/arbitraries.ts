// Shared fast-check arbitraries (design.md, "Generators").
// Maze-dependent arbitraries (arbBombScenario, arbGhostHuntScenario) draw real Mazes from
// generateMaze (task 5.7).

import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { Floor } from '../../src/core/types';
import type { Cell, Dir, GameState, Input, Maze } from '../../src/core/types';
import { generateMaze } from '../../src/core/maze/generate';
import { buildState } from './fixtures';

const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

export const arbSeed: fc.Arbitrary<number> = fc.integer({ min: -2147483648, max: 2147483647 });
export const arbLevel: fc.Arbitrary<number> = fc.integer({ min: 1, max: 200 });
export const arbDir: fc.Arbitrary<Dir> = fc.constantFrom(...DIRS);

/** Dir | null with weighted nulls (about 50 percent). */
export const arbPressed: fc.Arbitrary<Dir | null> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Dir | null>(null) },
  { weight: 4, arbitrary: arbDir },
);

/** Input with bomb true at roughly 3 percent of draws; continue about 2 percent. */
export const arbInput: fc.Arbitrary<Input> = fc.record({
  pressed: arbPressed,
  bomb: fc.integer({ min: 0, max: 99 }).map((n) => n < 3),
  continue: fc.integer({ min: 0, max: 99 }).map((n) => n < 2),
});

/** Up to 2,000 Dir | null entries. */
export const arbInputSeq: fc.Arbitrary<Array<Dir | null>> = fc.array(arbPressed, { maxLength: 2000 });

/** Valid configs around the defaults; always passes validateConfig. */
export const arbConfig: fc.Arbitrary<GameConfig> = fc
  .record({
    half: fc.integer({ min: 5, max: 15 }), // odd 11..31
    halfH: fc.integer({ min: 5, max: 15 }),
    doorCount: fc.integer({ min: 0, max: 6 }),
    doorMinOpenRatio: fc.double({ min: 0.1, max: 1, noNaN: true }),
    doorWarnTicks: fc.integer({ min: 30, max: 90 }),
    bombRadius: fc.double({ min: 0.5, max: 4, noNaN: true }),
    wispDensity: fc.double({ min: 0, max: 0.9, noNaN: true }),
    comboCap: fc.integer({ min: 1, max: 9 }),
    comboWindowTicks: fc.integer({ min: 30, max: 300 }),
    ghostHuntTicks: fc.integer({ min: 1, max: 900 }),
    allyFactor: fc.double({ min: 0.5, max: 2, noNaN: true }),
    speedCap: fc.double({ min: 1, max: 1.6, noNaN: true }),
    rateShift: fc.double({ min: 0, max: 0.08, noNaN: true }),
    distortionMs: fc.integer({ min: 50, max: 1000 }),
  })
  .map((r): GameConfig => ({
    ...DEFAULT_CONFIG,
    mazeSize: { w: 2 * r.half + 1, h: 2 * r.halfH + 1 },
    doorCount: r.doorCount,
    doorMinOpenRatio: r.doorMinOpenRatio,
    doorWarnTicks: r.doorWarnTicks,
    bombRadius: r.bombRadius,
    wispDensity: r.wispDensity,
    comboCap: r.comboCap,
    comboWindowTicks: r.comboWindowTicks,
    ghostHuntTicks: r.ghostHuntTicks,
    allyFactor: r.allyFactor,
    speedCap: r.speedCap,
    audio: {
      ...DEFAULT_CONFIG.audio,
      soundtrackMaxRateShift: r.rateShift,
      soundtrackDistortionMs: r.distortionMs,
    },
  }));

// ---------------------------------------------------------------------------------------------
// Scenarios (Mazes from generateMaze)
// ---------------------------------------------------------------------------------------------

const mazeCache = new Map<string, Maze>();

/** A generated default-config Maze for any seed and level (memoized; Mazes are never mutated). */
export const arbGeneratedMaze: fc.Arbitrary<Maze> = fc.tuple(arbSeed, arbLevel).map(([seed, level]) => {
  const key = `${seed}:${level}`;
  let m = mazeCache.get(key);
  if (!m) {
    m = generateMaze(seed, level, DEFAULT_CONFIG);
    if (mazeCache.size > 500) mazeCache.clear();
    mazeCache.set(key, m);
  }
  return m;
});

function floorCells(maze: Maze): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (maze.tiles[y * maze.width + x] === Floor) out.push({ x, y });
    }
  }
  return out;
}

const STEPS: ReadonlyArray<readonly [Dir, number, number]> = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0],
];

export interface BombScenario {
  maze: Maze;
  state: GameState;
  radius: number;
}

/** A Maze, a Player position (possibly mid-step, progress in 0..999) and a radius in 0.5..4. */
export const arbBombScenario: fc.Arbitrary<BombScenario> = fc
  .record({
    maze: arbGeneratedMaze,
    pick: fc.nat({ max: 10_000 }),
    stepPick: fc.nat({ max: 3 }),
    progress: fc.integer({ min: 0, max: 999 }),
    radius: fc.double({ min: 0.5, max: 4, noNaN: true }),
    seed: arbSeed,
  })
  .map(({ maze, pick, stepPick, progress, radius, seed }) => {
    const floors = floorCells(maze);
    const cell = floors[pick % floors.length] ?? maze.playerStart;
    const step = STEPS[stepPick] ?? STEPS[0]!;
    const next = { x: cell.x + step[1], y: cell.y + step[2] };
    const nextOk = maze.tiles[next.y * maze.width + next.x] === Floor;
    const base = buildState(maze, { runSeed: seed, rng: seed });
    const state: GameState = {
      ...base,
      bombs: 1,
      player: {
        ...base.player,
        cell,
        next: nextOk ? next : null,
        dir: nextOk ? step[0] : null,
        progress: nextOk ? progress : 0,
      },
    };
    return { maze, state, radius };
  });

export interface GhostHuntScenario {
  state: GameState;
  /** Tick of the first Ghost Hunt pickup. */
  pickupTick: number;
  /** Ticks of 0..2 refresh pickups, all after pickupTick. */
  refreshTicks: number[];
}

/** Mid-level state: 0..3 carried Keys, 0..3 released Captives, pickup plus 0..2 refreshes. */
export const arbGhostHuntScenario: fc.Arbitrary<GhostHuntScenario> = fc
  .record({
    maze: arbGeneratedMaze,
    carried: fc.integer({ min: 0, max: 3 }),
    released: fc.integer({ min: 0, max: 3 }),
    tick: fc.integer({ min: 0, max: 5000 }),
    pickupGap: fc.integer({ min: 0, max: 600 }),
    gaps: fc.array(fc.integer({ min: 1, max: 600 }), { maxLength: 2 }),
    seed: arbSeed,
  })
  .map(({ maze, carried, released, tick, pickupGap, gaps, seed }) => {
    const captives: [boolean, boolean, boolean] = [released > 0, released > 1, released > 2];
    const state = buildState(maze, {
      runSeed: seed,
      rng: seed,
      tick,
      over: { carriedKeys: carried, captives },
    });
    const pickupTick = tick + pickupGap;
    const refreshTicks: number[] = [];
    let t = pickupTick;
    for (const g of gaps) {
      t += g;
      refreshTicks.push(t);
    }
    return { state, pickupTick, refreshTicks };
  });

export interface ComboSequence {
  window: number;
  /** Strictly increasing Wisp pickup Ticks. */
  ticks: number[];
}

/** Wisp pickup Ticks with gaps clustered around comboWindowTicks. */
export const arbComboSequence: fc.Arbitrary<ComboSequence> = fc
  .integer({ min: 30, max: 300 })
  .chain((window) =>
    fc
      .array(
        fc.oneof(
          fc.constantFrom(1, window - 1, window, window + 1, window * 2),
          fc.integer({ min: 1, max: window * 2 }),
        ),
        { minLength: 1, maxLength: 30 },
      )
      .map((gaps) => {
        const ticks: number[] = [];
        let t = 0;
        for (const g of gaps) {
          t += Math.max(1, g);
          ticks.push(t);
        }
        return { window, ticks };
      }),
  );

// ---------------------------------------------------------------------------------------------
// Events, audio, storage
// ---------------------------------------------------------------------------------------------

const arbCell: fc.Arbitrary<Cell> = fc.record({
  x: fc.integer({ min: 0, max: 30 }),
  y: fc.integer({ min: 0, max: 30 }),
});
const arbWho = fc.constantFrom('player' as const, 'hunter' as const);
const arbIdx = fc.constantFrom(0 as const, 1 as const, 2 as const);

/** Any GameEvent variant. */
export const arbEvent: fc.Arbitrary<GameEvent> = fc.oneof<fc.Arbitrary<GameEvent>[]>(
  fc.record({ t: fc.constant('PelletCollected' as const), kind: fc.constantFrom('ordinary' as const, 'power' as const, 'speed' as const), by: arbWho, cell: arbCell }),
  fc.record({ t: fc.constant('WispCollected' as const), cell: arbCell, combo: fc.integer({ min: 1, max: 9 }), points: fc.integer({ min: 0, max: 1000 }), bonus: fc.constantFrom(0, 100) }),
  fc.record({ t: fc.constant('ComboReset' as const), reason: fc.constantFrom('expired' as const, 'playerEaten' as const) }),
  fc.record({ t: fc.constant('BombCollected' as const), cell: arbCell, inventory: fc.integer({ min: 0, max: 3 }) }),
  fc.record({ t: fc.constant('BombActivated' as const), cell: arbCell }),
  fc.record({ t: fc.constant('BombDetonated' as const), cell: arbCell, radius: fc.double({ min: 0.5, max: 4, noNaN: true }), destroyed: fc.array(arbCell, { maxLength: 8 }) }),
  fc.record({ t: fc.constant('WallsDestroyed' as const), cells: fc.array(arbCell, { maxLength: 8 }) }),
  fc.record({ t: fc.constant('GhostHuntStarted' as const), refresh: fc.boolean(), ticks: fc.integer({ min: 1, max: 900 }) }),
  fc.record({ t: fc.constant('GhostHuntEnded' as const), reason: fc.constantFrom('expired' as const, 'levelEnd' as const) }),
  fc.record({ t: fc.constant('KeyCollected' as const), cell: arbCell }),
  fc.record({ t: fc.constant('CaptiveReleased' as const), index: arbIdx }),
  fc.record({ t: fc.constant('RoleReversed' as const), to: arbWho }),
  fc.record({ t: fc.constantFrom('PowerStarted' as const, 'PowerEnded' as const, 'SpeedStarted' as const, 'SpeedEnded' as const), who: arbWho }),
  fc.record({ t: fc.constantFrom('DoorWarning' as const, 'DoorChanged' as const), doorIndex: fc.integer({ min: 0, max: 5 }), open: fc.boolean() }),
  fc.record({ t: fc.constant('PlayerEaten' as const), cell: arbCell, keysDropped: fc.integer({ min: 0, max: 3 }) }),
  fc.record({ t: fc.constant('HunterEaten' as const), cell: arbCell, by: fc.constant('player' as const) }),
  fc.record({ t: fc.constant('HunterEaten' as const), cell: arbCell, by: fc.constant('ally' as const), allyId: arbIdx }),
  fc.record({ t: fc.constant('LevelStarted' as const), level: arbLevel, speedFactor: fc.double({ min: 1, max: 1.6, noNaN: true }) }),
  fc.record({ t: fc.constant('LevelEnded' as const), outcome: fc.constantFrom('playerWin' as const, 'hunterWin' as const), level: arbLevel }),
  fc.record({ t: fc.constant('GameOver' as const), score: fc.nat({ max: 1_000_000 }) }),
);

const garbage: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.constantFrom('', 'null', 'undefined', '[]', '{}', '{', '[1,2', '"x"', '42', 'NaN', '{"master":"loud"}'),
);

const arbVolume = fc.double({ min: 0, max: 1, noNaN: true });

/** Valid, partial and garbage AudioSettings strings. */
export const arbAudioBlob: fc.Arbitrary<string> = fc.oneof(
  fc.record({ master: arbVolume, music: arbVolume, sfx: arbVolume, muted: fc.boolean() }).map((o) => JSON.stringify(o)),
  fc.record({ master: arbVolume }, { requiredKeys: [] }).map((o) => JSON.stringify(o)),
  fc.record({ master: fc.double({ min: -5, max: 5 }), music: fc.anything(), sfx: fc.anything() }).map((o) => JSON.stringify(o)),
  garbage,
);

export type LoadOutcome = 'ok' | 'fetchFail' | 'decodeFail' | 'timeout' | 'streamFail';
export const arbLoadOutcome: fc.Arbitrary<LoadOutcome> = fc.constantFrom<LoadOutcome[]>(
  'ok',
  'fetchFail',
  'decodeFail',
  'timeout',
  'streamFail',
);

export interface ScoreEntry {
  score: number;
  level: number;
  name: string;
  date: number;
}

/** 0..15 score entries in arbitrary order (loaders must sort and cap at 10). */
export const arbScoreList: fc.Arbitrary<ScoreEntry[]> = fc.array(
  fc.record({
    score: fc.nat({ max: 10_000_000 }),
    level: arbLevel,
    name: fc.string({ maxLength: 12 }),
    date: fc.nat({ max: 4_000_000_000 }),
  }),
  { maxLength: 15 },
);

/** Valid, partially valid and garbage High_Score_Store strings. */
export const arbStorageBlob: fc.Arbitrary<string> = fc.oneof(
  arbScoreList.map((l) => JSON.stringify(l)),
  arbScoreList.map((l) => JSON.stringify(l.map((e, i) => (i % 2 === 0 ? e : { score: 'x' })))),
  fc.array(fc.anything(), { maxLength: 5 }).map((a) => JSON.stringify(a)),
  garbage,
);

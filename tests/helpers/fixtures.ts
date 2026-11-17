// Hand-built Mazes and GameState builders for tests that run before generateMaze exists (task 5.7).
// Pure data only. Does not import grid.ts (built in parallel); keeps its own tiny index helpers.

import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import {
  CageGate,
  CageInterior,
  Door,
  Floor,
  ItemKind,
  Wall,
  WallHard,
} from '../../src/core/types';
import type {
  Cell,
  Character,
  DerivedNav,
  DoorSpec,
  DoorState,
  GameState,
  GhostHuntState,
  ItemState,
  Maze,
  Who,
} from '../../src/core/types';

/**
 * ASCII legend: '#' Wall, 'H' WallHard, '.' Floor, 'C' cage interior, 'G' cage gate,
 * 'D' Door, 'P' player start (floor), 'U' hunter start (floor).
 */
export function mazeFromAscii(rows: readonly string[], opts: { doors?: Partial<DoorSpec> } = {}): Maze {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles = new Uint8Array(width * height);
  const interior: Cell[] = [];
  const doors: DoorSpec[] = [];
  let entrance: Cell = { x: 0, y: 0 };
  let playerStart: Cell = { x: 1, y: 1 };
  let hunterStart: Cell = { x: 1, y: 1 };
  const floors: Cell[] = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? '';
    if (row.length !== width) throw new Error(`fixture row ${y} has width ${row.length}, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const i = y * width + x;
      switch (ch) {
        case '#': tiles[i] = Wall; break;
        case 'H': tiles[i] = WallHard; break;
        case 'C': tiles[i] = CageInterior; interior.push({ x, y }); break;
        case 'G': tiles[i] = CageGate; entrance = { x, y }; break;
        case 'D':
          tiles[i] = Door;
          doors.push({ cell: { x, y }, phaseOffset: 0, period: 240, openRatio: 0.5, ...opts.doors });
          break;
        case 'P': tiles[i] = Floor; playerStart = { x, y }; floors.push({ x, y }); break;
        case 'U': tiles[i] = Floor; hunterStart = { x, y }; floors.push({ x, y }); break;
        case '.': tiles[i] = Floor; floors.push({ x, y }); break;
        default: throw new Error(`fixture: unknown tile '${ch}' at ${x},${y}`);
      }
    }
  }

  const reserved = new Set<string>([playerStart, hunterStart].map((c) => `${c.x},${c.y}`));
  const free = floors.filter((c) => !reserved.has(`${c.x},${c.y}`));
  // Three Keys at the last free floor cells, the rest are Ordinary_Pellets.
  const keys = free.slice(-3);
  const keySet = new Set(keys.map((c) => `${c.x},${c.y}`));
  const ordinary = free.filter((c) => !keySet.has(`${c.x},${c.y}`));

  return {
    width,
    height,
    tiles,
    doors,
    wrapPairs: [],
    playerStart,
    hunterStart,
    cage: { interior, entrance },
    keys,
    ordinary,
    power: [],
    speed: [],
    bombs: [],
    ghostHunt: [],
    wisps: [],
    generation: { attempts: 1, repairs: 0 },
  };
}

/** 9 x 3 corridor: P at the left end, hunter at the right end, no cage, no doors. */
export function corridorMaze(): Maze {
  return mazeFromAscii(['HHHHHHHHH', 'P.......U', 'HHHHHHHHH']);
}

/** 11 x 11 maze with a central cage, WallHard boundary, destructible interior walls and one Door. */
export function cageMaze(): Maze {
  return mazeFromAscii([
    'HHHHHHHHHHH',
    'HP........H',
    'H.#.###.#.H',
    'H.........H',
    'H.#..G..#.H',
    'H.#.CCC.#.H',
    'H.#.HHH.#.H',
    'H........UH',
    'H.#.#.#.#.H',
    'H....D....H',
    'HHHHHHHHHHH',
  ]);
}

/** 11 x 11 maze with no Door (same layout otherwise). */
export function cageMazeNoDoor(): Maze {
  const m = cageMaze();
  const i = 9 * m.width + 5;
  const tiles = m.tiles.slice();
  tiles[i] = Floor;
  return { ...m, tiles, doors: [], ordinary: [...m.ordinary, { x: 5, y: 9 }] };
}

/** All fixture mazes, for tests that need small hand-built Mazes (the shared arbitraries use generateMaze). */
export function allFixtureMazes(): Maze[] {
  return [corridorMaze(), cageMaze(), cageMazeNoDoor()];
}

export function makeCharacter(id: Who, cell: Cell, over: Partial<Character> = {}): Character {
  return {
    id,
    cell: { ...cell },
    next: null,
    progress: 0,
    dir: null,
    buffered: null,
    power: 0,
    speed: 0,
    invulnerable: 0,
    respawnIn: 0,
    ...over,
  };
}

export function makeItems(maze: Maze): ItemState {
  const kinds = new Uint8Array(maze.width * maze.height);
  const put = (cells: Cell[], kind: number): void => {
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
    keys: maze.keys.map((c) => ({ ...c })),
    ordinaryRemaining: maze.ordinary.length,
    wispsRemaining: maze.wisps.length,
    bombsOnFloor: maze.bombs.length,
    ghostHuntOnFloor: maze.ghostHunt.length,
  };
}

export function makeDoorStates(maze: Maze): DoorState[] {
  return maze.doors.map((_, index) => ({
    index,
    open: true,
    nextChangeIn: 120,
    warning: 0,
    postponed: false,
  }));
}

export function makeDerived(doorCount: number): DerivedNav {
  const n = 1 << doorCount;
  return {
    doorMask: n - 1,
    connectivity: new Array<number>(n).fill(0),
    restoreTicks: new Array<number>(n).fill(0),
    fieldVersion: 0,
  };
}

export function makeGhostHunt(playerCell: Cell, cageEntrance: Cell): GhostHuntState {
  const ally = (id: 0 | 1 | 2) => ({
    id,
    cell: { ...cageEntrance },
    next: null,
    progress: 0,
    dir: null,
    mode: 'inactive' as const,
    spawnIn: 0,
    leaveIn: 0,
  });
  void playerCell;
  return { ticksLeft: 0, allies: [ally(0), ally(1), ally(2)] };
}

export interface BuildStateOptions {
  runSeed?: number;
  levelNumber?: number;
  tick?: number;
  rng?: number;
  config?: GameConfig;
  over?: Partial<GameState>;
}

/** Builds a valid initial GameState on top of a hand-built Maze. */
export function buildState(maze: Maze, opts: BuildStateOptions = {}): GameState {
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const state: GameState = {
    runSeed: opts.runSeed ?? 1,
    levelNumber: opts.levelNumber ?? 1,
    tick: opts.tick ?? 0,
    rng: opts.rng ?? 1,
    maze,
    player: makeCharacter('player', maze.playerStart),
    hunter: makeCharacter('hunter', maze.hunterStart),
    items: makeItems(maze),
    carriedKeys: 0,
    captives: [false, false, false],
    doors: makeDoorStates(maze),
    bombs: 0,
    walls: { tiles: maze.tiles.slice(), version: 0, destroyed: 0 },
    derived: makeDerived(maze.doors.length),
    ghostHunt: makeGhostHunt(maze.playerStart, maze.cage.entrance),
    comboCount: 1,
    comboTicksLeft: 0,
    comboChainPoints: 0,
    lives: cfg.livesInitial,
    score: 0,
    oneUpsAwarded: 0,
    phase: 'playing',
    outcome: null,
  };
  return { ...state, ...opts.over };
}

export function corridorState(opts: BuildStateOptions = {}): GameState {
  return buildState(corridorMaze(), opts);
}

export function cageState(opts: BuildStateOptions = {}): GameState {
  return buildState(cageMaze(), opts);
}

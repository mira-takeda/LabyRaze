// Core Simulation types. Pure data: no DOM, no wall clock, no unseeded randomness.
// Shapes follow design.md (Core Types, Maze Generator, Other Data Models).

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Cell = { x: number; y: number };
export type Who = 'player' | 'hunter';

/** Single 32-bit PRNG state (mulberry32). Draw helpers live in prng.ts. */
export type PrngState = number;

/** Tile codes stored in Uint8Array tile layers. Only `Wall` is destructible. */
export const Tile = {
  Floor: 0,
  Wall: 1,
  WallHard: 2,
  CageInterior: 3,
  CageGate: 4,
  Door: 5,
} as const;
export type TileCode = (typeof Tile)[keyof typeof Tile];

export const Floor = Tile.Floor;
export const Wall = Tile.Wall;
export const WallHard = Tile.WallHard;
export const CageInterior = Tile.CageInterior;
export const CageGate = Tile.CageGate;
export const Door = Tile.Door;

export interface Input {
  pressed: Dir | null; // last direction pressed this Tick
  bomb: boolean; // true for exactly one Tick per bomb key press
  continue: boolean; // level-end / game-over acknowledgement from the Shell
}

export interface Character {
  id: Who;
  cell: Cell; // cell being left (or occupied)
  next: Cell | null; // cell being entered, null when idle
  progress: number; // fixed-point progress on the current step (CELL_UNITS scale)
  dir: Dir | null;
  buffered: Dir | null; // Buffered_Turn (player only)
  power: number; // remaining Ticks, 0 = none
  speed: number; // remaining Ticks, 0 = none
  invulnerable: number; // remaining Ticks
  respawnIn: number; // hunter respawn countdown, 0 = alive
}

export interface DoorSpec {
  cell: Cell;
  phaseOffset: number; // Ticks, from the `doors` stream
  period: number; // Ticks
  openRatio: number; // >= doorMinOpenRatio
}

export interface DoorState {
  index: number;
  open: boolean;
  nextChangeIn: number; // Ticks until the next scheduled change
  warning: number; // 0..1 warning intensity for the Renderer
  postponed: boolean; // a close is being postponed by a safety gate
}

export interface Maze {
  width: number;
  height: number; // odd, from config (default 21x21)
  tiles: Uint8Array; // INITIAL tiles; the live layer is GameState.walls
  doors: DoorSpec[];
  wrapPairs: Array<[Cell, Cell]>;
  playerStart: Cell;
  hunterStart: Cell;
  cage: { interior: Cell[]; entrance: Cell };
  keys: Cell[]; // length 3
  ordinary: Cell[];
  power: Cell[];
  speed: Cell[];
  bombs: Cell[]; // player-only
  ghostHunt: Cell[]; // player-only
  wisps: Cell[]; // disjoint from `ordinary`, player-only
  /**
   * Snow-biome ice mask (1 = ice Cell), one byte per Cell. Absent on every non-snow Maze.
   * Ice never changes passability; it only restricts turning (see movement.ts).
   */
  ice?: Uint8Array;
  /** `fallback` is present (true) only when the fixed template was used (task 5.7). */
  generation: { attempts: number; repairs: number; fallback?: boolean };
}

/** Item kinds stored per Cell index in ItemState.kinds (one item per Cell). */
export const ItemKind = {
  None: 0,
  Ordinary: 1,
  Power: 2,
  Speed: 3,
  Wisp: 4,
  Bomb: 5,
  GhostHunt: 6,
} as const;
export type ItemKindCode = (typeof ItemKind)[keyof typeof ItemKind];

/** Collector masks: bit 1 = Player, bit 2 = Hunter. */
export const COLLECT_PLAYER = 1;
export const COLLECT_HUNTER = 2;
export const COLLECTOR_MASK: Readonly<Record<ItemKindCode, number>> = {
  [ItemKind.None]: 0,
  [ItemKind.Ordinary]: COLLECT_HUNTER,
  [ItemKind.Power]: COLLECT_PLAYER | COLLECT_HUNTER,
  [ItemKind.Speed]: COLLECT_PLAYER | COLLECT_HUNTER,
  [ItemKind.Wisp]: COLLECT_PLAYER,
  [ItemKind.Bomb]: COLLECT_PLAYER,
  [ItemKind.GhostHunt]: COLLECT_PLAYER,
};

export interface ItemState {
  kinds: Uint8Array; // item kind per Cell index (y * width + x)
  keys: Cell[]; // Key positions on the floor (Keys may be dropped)
  ordinaryRemaining: number; // the only counter the Squareman win reads
  wispsRemaining: number;
  bombsOnFloor: number;
  ghostHuntOnFloor: number;
}

export interface WallLayer {
  tiles: Uint8Array; // current tile codes; never mutated in place
  version: number; // increments on every destruction, keys all caches
  destroyed: number; // count of destroyed walls this level
}

export interface DerivedNav {
  doorMask: number; // bitmask of currently open Doors
  connectivity: number[]; // per doorMask connectivity table (2^doorCount entries)
  restoreTicks: number[]; // per doorMask time-to-restore table
  fieldVersion: number; // distance-field version (tracks walls.version)
}

export type AllyMode = 'inactive' | 'hunting' | 'returning' | 'leaving';

export interface Ally {
  id: 0 | 1 | 2;
  cell: Cell;
  next: Cell | null;
  progress: number; // fixed-point, same CELL_UNITS scale as Character
  dir: Dir | null;
  mode: AllyMode;
  spawnIn: number; // staggered spawn countdown, 0 = spawned
  leaveIn: number; // visual-only deterministic fade timer for 'leaving'
}

/**
 * Ghost Hunt slice. Deliberately holds no captives or carriedKeys: allies are
 * a separate, temporary effect and are never a Rescue.
 */
export interface GhostHuntState {
  ticksLeft: number; // 0 = inactive
  allies: [Ally, Ally, Ally]; // index = Captive index 0..2
}

/** What Ghost Hunt code may read. No `captives` and no `carriedKeys` by construction. */
export interface GhostHuntView {
  walls: WallLayer;
  doors: DoorState[];
  derived: DerivedNav;
  hunter: Character;
  playerCell: Cell;
  cage: Maze['cage'];
  tick: number;
  /** Optional (task 12.2): grid layout for real ally movement. Without it allies do not move. */
  nav?: Pick<Maze, 'width' | 'height' | 'doors' | 'wrapPairs'>;
  /** Optional (task 12.2): Squareman Start_Cell, the hold point while the Hunter respawns. */
  hunterStart?: Cell;
  /**
   * READ-ONLY copy of which Captives were already rescued (index = Captive index).
   * Ghost Hunt uses it only to pick each ally's end-of-effect destination; it has no
   * way to write rescue state. Still no `captives` / `carriedKeys` fields.
   */
  readonly rescued: readonly [boolean, boolean, boolean];
}

export type Phase = 'playing' | 'levelEnd' | 'gameOver';
export type Outcome = null | 'playerWin' | 'hunterWin';

export interface GameState {
  runSeed: number;
  levelNumber: number;
  tick: number;
  rng: PrngState;
  maze: Maze;
  player: Character;
  hunter: Character;
  items: ItemState;
  carriedKeys: number;
  captives: [boolean, boolean, boolean]; // written ONLY by rescue logic
  doors: DoorState[];
  bombs: number; // Bomb_Inventory, integer 0..bombCapacity
  walls: WallLayer;
  derived: DerivedNav;
  ghostHunt: GhostHuntState;
  comboCount: number; // 1..comboCap
  comboTicksLeft: number; // 0 = no active window
  comboChainPoints: number; // wisp points (incl. cap bonus) of the running chain; meaningful only while comboTicksLeft > 0
  lives: number;
  score: number;
  oneUpsAwarded: number; // milestones already paid out in this Run (carried with the score)
  phase: Phase;
  outcome: Outcome;
}

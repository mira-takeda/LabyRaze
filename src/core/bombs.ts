// Bombs (part 1): guarded pickup and consume, and the pure detonation.
// Pure TypeScript: no DOM, no wall clock, no randomness. Integer math only for the blast test.
//
// Bombs affect only the live WallLayer. Squareman and pellets are untouched
// (bombAffectsHunter and bombAffectsPellets are false by design), so detonate takes
// neither as input.
//
// Part 2 (task 11.2): `activateBomb` adds the derived-data refresh and events on top of `detonate`.

import { CELL_UNITS, DEFAULT_CONFIG } from './config';
import { rebuildDerived } from './doors';
import type { DerivedTables } from './doors';
import type { GameEvent } from './events';
import { Tile } from './types';
import type { Ally, Cell, Character, Maze, WallLayer } from './types';

export interface PickupResult {
  /** New Bomb_Inventory. */
  inventory: number;
  /** True when the Bomb was taken; false means it stays on its Cell. */
  collected: boolean;
}

export interface ConsumeResult {
  inventory: number;
  /** True when a Bomb was spent; false when the inventory was empty. */
  consumed: boolean;
}

export interface DetonateResult {
  /** The new layer when n > 0, the very same input object when n = 0. */
  walls: WallLayer;
  /** Destroyed Wall cells in row-major order. */
  destroyed: Cell[];
}

/** Guarded pickup: at capacity the Bomb stays on its Cell and the inventory is unchanged. */
export function pickupBomb(inventory: number, capacity: number = DEFAULT_CONFIG.bombCapacity): PickupResult {
  if (inventory >= capacity) return { inventory, collected: false };
  return { inventory: inventory + 1, collected: true };
}

/** Guarded consume: an empty inventory does nothing. */
export function consumeBomb(inventory: number): ConsumeResult {
  if (inventory <= 0) return { inventory: 0, consumed: false };
  return { inventory: inventory - 1, consumed: true };
}

/**
 * Exact Player position in fixed-point units (CELL_UNITS per Cell), interpolated from
 * `cell`, `next` and `progress`. The cell origin is the Cell centre in this scale.
 */
export function playerPositionUnits(player: Pick<Character, 'cell' | 'next' | 'progress'>): { x: number; y: number } {
  const { cell, next, progress } = player;
  let x = cell.x * CELL_UNITS;
  let y = cell.y * CELL_UNITS;
  if (next !== null) {
    // progress is an integer on the CELL_UNITS scale, so this stays exact.
    x += (next.x - cell.x) * progress;
    y += (next.y - cell.y) * progress;
  }
  return { x, y };
}

/** Blast radius in fixed-point units. */
export function radiusUnits(radiusCells: number): number {
  return Math.round(radiusCells * CELL_UNITS);
}

/**
 * Pure detonation centred on the exact Player position. A Cell is hit when the squared
 * distance from its centre to the blast centre is <= radius squared (integers, units^2).
 * The blast passes through walls. Only `Wall` tiles are destroyed; WallHard, CageGate,
 * CageInterior and Door are never changed.
 *
 * Copy-on-write: the input layer and its tiles are never mutated. With n destroyed
 * walls, n > 0 yields a new layer (tiles copy, version + 1, destroyed + n); n = 0
 * returns the same layer object.
 */
export function detonate(
  walls: WallLayer,
  width: number,
  height: number,
  player: Pick<Character, 'cell' | 'next' | 'progress'>,
  radiusCells: number,
): DetonateResult {
  const centre = playerPositionUnits(player);
  const r = radiusUnits(radiusCells);
  const r2 = r * r;
  const reach = Math.ceil(r / CELL_UNITS) + 1;
  const cx = Math.round(centre.x / CELL_UNITS);
  const cy = Math.round(centre.y / CELL_UNITS);
  const x0 = Math.max(0, cx - reach);
  const x1 = Math.min(width - 1, cx + reach);
  const y0 = Math.max(0, cy - reach);
  const y1 = Math.min(height - 1, cy + reach);

  const destroyed: Cell[] = [];
  for (let y = y0; y <= y1; y++) {
    const dy = y * CELL_UNITS - centre.y;
    for (let x = x0; x <= x1; x++) {
      if (walls.tiles[y * width + x] !== Tile.Wall) continue;
      const dx = x * CELL_UNITS - centre.x;
      if (dx * dx + dy * dy <= r2) destroyed.push({ x, y });
    }
  }

  const n = destroyed.length;
  if (n === 0) return { walls, destroyed };

  const tiles = walls.tiles.slice();
  for (const c of destroyed) tiles[c.y * width + c.x] = Tile.Floor;
  return {
    walls: { tiles, version: walls.version + 1, destroyed: walls.destroyed + n },
    destroyed,
  };
}

// ---------------------------------------------------------------------------
// Part 2 (task 11.2): activation, derived-data refresh and events.
// ---------------------------------------------------------------------------

/** The slice of GameState that a Bomb activation reads. */
export interface BombSlice {
  bombs: number;
  walls: WallLayer;
  derived: DerivedTables;
  player: Pick<Character, 'cell' | 'next' | 'progress'>;
  maze: Pick<Maze, 'width' | 'height' | 'doors' | 'wrapPairs' | 'cage'>;
  /** Key positions; with the Cage entrance they are the connectivity objectives. */
  keys: readonly Cell[];
}

export interface ActivateBombResult {
  /** New Bomb_Inventory. */
  bombs: number;
  /** New layer when walls were destroyed, otherwise the very same object. */
  walls: WallLayer;
  /** Rebuilt tables when walls were destroyed, otherwise the very same object. */
  derived: DerivedTables;
  /** True when the Bomb was spent. */
  activated: boolean;
  /** Destroyed Wall cells in row-major order. */
  destroyed: Cell[];
  /** The Simulation must clear the Hunter route (e.g. via notifyHunterEvents on `events`). */
  clearHunterRoute: boolean;
  /** The Simulation must clear every ally route (see `clearAllyRoutes`). */
  clearAllyRoutes: boolean;
  /** BombActivated, BombDetonated and (only when n > 0) WallsDestroyed, in that order. */
  events: GameEvent[];
}

/**
 * Pure Bomb activation. At 0 bombs nothing happens. Otherwise the Bomb is spent and
 * detonates at the exact Player position. When n > 0 the connectivity and time-to-restore
 * tables are rebuilt on the new layer (walls.version is bumped by `detonate`) and both
 * route-clear flags are set. An empty explosion still spends the Bomb but returns the
 * same walls and derived objects and leaves routes alone.
 */
export function activateBomb(slice: BombSlice, cfg: { bombRadius: number } = DEFAULT_CONFIG): ActivateBombResult {
  const spent = consumeBomb(slice.bombs);
  if (!spent.consumed) {
    return {
      bombs: spent.inventory,
      walls: slice.walls,
      derived: slice.derived,
      activated: false,
      destroyed: [],
      clearHunterRoute: false,
      clearAllyRoutes: false,
      events: [],
    };
  }

  const { width, height } = slice.maze;
  const cell: Cell = { ...slice.player.cell };
  const blast = detonate(slice.walls, width, height, slice.player, cfg.bombRadius);
  const destroyed = blast.destroyed;
  const events: GameEvent[] = [
    { t: 'BombActivated', cell },
    { t: 'BombDetonated', cell, radius: cfg.bombRadius, destroyed },
  ];

  if (destroyed.length === 0) {
    return {
      bombs: spent.inventory,
      walls: slice.walls,
      derived: slice.derived,
      activated: true,
      destroyed,
      clearHunterRoute: false,
      clearAllyRoutes: false,
      events,
    };
  }

  events.push({ t: 'WallsDestroyed', cells: destroyed });
  const objectives: Cell[] = [...slice.keys, slice.maze.cage.entrance];
  const derived = rebuildDerived(blast.walls, slice.maze.doors, slice.maze, objectives, slice.derived.doorMask);
  return {
    bombs: spent.inventory,
    walls: blast.walls,
    derived,
    activated: true,
    destroyed,
    clearHunterRoute: true,
    clearAllyRoutes: true,
    events,
  };
}

/**
 * Clears the committed heading of every ally. An ally already between Cells keeps its
 * `next` and `progress` so it finishes the step without a visual jump; its next
 * decision is made on the new wall layer. Returns new objects.
 */
export function clearAllyRoutes<A extends Pick<Ally, 'dir'>>(allies: readonly A[]): A[] {
  return allies.map((a) => ({ ...a, dir: null }));
}

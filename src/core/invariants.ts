// Development invariant assertions (task 16.4). Pure: no DOM, no clock, no randomness.
//
// `assertValidState` checks a GameState after a Tick and throws InvariantError listing
// every violation. `step` calls it only when checks are enabled. They are off by default;
// the Shell enables them in development builds (`import.meta.env.DEV`) and tests may
// enable them explicitly, so production builds never pay for them.
//
// Derived tables are not compared to a full recomputation: they are rebuilt from the
// objectives present at rebuild time (Key positions change as Keys are collected), so
// the checks are restricted to what must hold at every Tick: the field version tracks the
// wall layer, the stored Door mask matches the live Doors, and the tables cover 2^doorCount masks.

import type { GameConfig } from './config';
import { openMask } from './doors';
import { inBounds } from './grid';
import { ItemKind, Tile } from './types';
import type { Cell, GameState } from './types';

export class InvariantError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Invariant violation: ${problems.join('; ')}`);
    this.name = 'InvariantError';
    this.problems = problems;
  }
}

let enabled = false;

/** Turns the per-Tick assertions in `step` on or off. */
export function setInvariantChecks(on: boolean): void {
  enabled = on;
}

export function invariantChecksEnabled(): boolean {
  return enabled;
}

const KEYS_PER_LEVEL = 3;

function isSolid(tile: number | undefined): boolean {
  return tile === Tile.Wall || tile === Tile.WallHard;
}

/** Returns every violated invariant (empty when the state is valid). */
export function findInvariantViolations(
  s: GameState,
  cfg?: Pick<GameConfig, 'bombCapacity'>,
): string[] {
  const out: string[] = [];
  const { width, height } = s.maze;
  const tiles = s.walls.tiles;
  const tileAt = (c: Cell): number | undefined => tiles[c.y * width + c.x];
  const cellOk = (label: string, c: Cell): boolean => {
    if (!inBounds(width, height, c.x, c.y)) {
      out.push(`${label} out of bounds at (${c.x},${c.y})`);
      return false;
    }
    return true;
  };

  // Single power holder (Requirement 9.6).
  if (s.player.power > 0 && s.hunter.power > 0) out.push('both characters hold power');

  // Characters on passable Cells (a Door Cell is allowed: closes are postponed while occupied).
  for (const ch of [s.player, s.hunter]) {
    if (cellOk(`${ch.id}.cell`, ch.cell) && isSolid(tileAt(ch.cell))) {
      out.push(`${ch.id} stands on a wall at (${ch.cell.x},${ch.cell.y})`);
    }
    if (ch.next && cellOk(`${ch.id}.next`, ch.next) && isSolid(tileAt(ch.next))) {
      out.push(`${ch.id} is entering a wall at (${ch.next.x},${ch.next.y})`);
    }
  }

  // Key conservation: floor + carried + rescued = 3.
  const rescued = s.captives.filter(Boolean).length;
  const keyTotal = s.items.keys.length + s.carriedKeys + rescued;
  if (keyTotal !== KEYS_PER_LEVEL) {
    out.push(`key conservation: floor ${s.items.keys.length} + carried ${s.carriedKeys} + rescued ${rescued} = ${keyTotal}`);
  }
  if (s.carriedKeys < 0) out.push(`carriedKeys negative (${s.carriedKeys})`);
  for (const k of s.items.keys) {
    if (cellOk('key', k) && isSolid(tileAt(k))) out.push(`key on a wall at (${k.x},${k.y})`);
  }

  // Wall layer: only destructible walls may change, and only into Floor.
  // This keeps the Cage interior, Cage gate, Doors and hard walls intact.
  if (tiles.length !== s.maze.tiles.length) out.push('wall layer size differs from the Maze');
  let opened = 0;
  for (let i = 0; i < s.maze.tiles.length; i++) {
    const before = s.maze.tiles[i]!;
    const now = tiles[i];
    if (before === now) continue;
    if (before === Tile.Wall && now === Tile.Floor) {
      opened++;
      continue;
    }
    out.push(`tile ${i} changed from ${before} to ${now}`);
  }
  if (opened !== s.walls.destroyed) out.push(`walls.destroyed ${s.walls.destroyed} but ${opened} walls opened`);
  for (const d of s.maze.doors) {
    if (tileAt(d.cell) !== Tile.Door) out.push(`door tile missing at (${d.cell.x},${d.cell.y})`);
  }

  // Items only on passable Cells, and counters match the item layer.
  let ordinary = 0;
  let wisps = 0;
  let bombsOnFloor = 0;
  let ghostHunt = 0;
  for (let i = 0; i < s.items.kinds.length; i++) {
    const k = s.items.kinds[i]!;
    if (k === ItemKind.None) continue;
    if (isSolid(tiles[i])) out.push(`item ${k} on a wall at index ${i}`);
    if (k === ItemKind.Ordinary) ordinary++;
    else if (k === ItemKind.Wisp) wisps++;
    else if (k === ItemKind.Bomb) bombsOnFloor++;
    else if (k === ItemKind.GhostHunt) ghostHunt++;
  }
  if (ordinary !== s.items.ordinaryRemaining) out.push(`ordinaryRemaining ${s.items.ordinaryRemaining} but ${ordinary} on the floor`);
  if (wisps !== s.items.wispsRemaining) out.push(`wispsRemaining ${s.items.wispsRemaining} but ${wisps} on the floor`);
  if (bombsOnFloor !== s.items.bombsOnFloor) out.push(`bombsOnFloor ${s.items.bombsOnFloor} but ${bombsOnFloor} on the floor`);
  if (ghostHunt !== s.items.ghostHuntOnFloor) out.push(`ghostHuntOnFloor ${s.items.ghostHuntOnFloor} but ${ghostHunt} on the floor`);

  // Bomb inventory bounds.
  if (!Number.isInteger(s.bombs) || s.bombs < 0) out.push(`bomb inventory invalid (${s.bombs})`);
  if (cfg && s.bombs > cfg.bombCapacity) out.push(`bomb inventory ${s.bombs} above capacity ${cfg.bombCapacity}`);

  // Derived navigation data tracks the live layers.
  if (s.derived.fieldVersion !== s.walls.version) {
    out.push(`derived.fieldVersion ${s.derived.fieldVersion} != walls.version ${s.walls.version}`);
  }
  const mask = openMask(s.doors);
  if (s.derived.doorMask !== mask) out.push(`derived.doorMask ${s.derived.doorMask} != live mask ${mask}`);
  const masks = 1 << s.maze.doors.length;
  if (s.derived.connectivity.length !== masks) out.push(`connectivity table has ${s.derived.connectivity.length} entries, expected ${masks}`);
  if (s.derived.restoreTicks.length !== masks) out.push(`restoreTicks table has ${s.derived.restoreTicks.length} entries, expected ${masks}`);

  return out;
}

/** Throws InvariantError when any invariant is violated. */
export function assertValidState(s: GameState, cfg?: Pick<GameConfig, 'bombCapacity'>): void {
  const problems = findInvariantViolations(s, cfg);
  if (problems.length > 0) throw new InvariantError(problems);
}

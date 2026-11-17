/**
 * Maze generation entry point (Requirement 4; design "Generator", "Repair and Regenerate Strategy").
 *
 * Per attempt (retry index = retryIndex + attempt, mixed into every seed stream):
 *   carveMaze -> placeStarts -> placeDoors (exclude start cells) -> placeItems -> partitionItems
 *   -> validateMaze. If invalid, repairMaze. If still invalid, the next attempt starts with the
 *   next retry index. After `cfg.maxAttempts` failed attempts a fixed-template fallback is used.
 *
 * Fallback template: a regular "pillar mesh" (every odd/odd lattice cell open, neighbouring
 * lattice cells joined by an open connector, even/even pillars solid) around the same centred
 * Cage block that `carveMaze` uses. It is an original layout with no dead ends and many cycles,
 * so every Door candidate is a safe two-neighbour connector. Starts, Doors and the wisp/pellet
 * partition reuse the normal steps; the special items are placed by a deterministic greedy
 * search that uses exactly the predicates of `validateMaze` with no relaxation. The partition is
 * re-derived from a fixed list of seeds until path coverage holds. The template is validated by
 * tests for the default config and for other odd sizes; for a pathological config that no layout
 * can satisfy the best-effort result is returned (it is never an infinite loop).
 *
 * `generation.attempts` is the number of attempts used (`maxAttempts` when the fallback ran,
 * with `generation.fallback === true`). `generation.repairs` sums the repairs of every attempt.
 * `wrapPairs` is always [] (the design has no wrap tunnels).
 *
 * Pure and deterministic: no recursion, no clock, no unseeded randomness.
 */

import type { GameConfig } from '../config';
import { deriveSeed, shuffle } from '../prng';
import { Tile } from '../types';
import type { Cell, Maze } from '../types';
import { cageBlockFor, carveMaze } from './carve';
import type { Rect } from './carve';
import { placeDoors } from './doorPlacement';
import { withIce } from './ice';
import { partitionItems } from './partition';
import { inCentralRegion, KEY_COUNT, placeItems, placeStarts, quadrantOf, startCells, thirdOf } from './placement';
import { repairMaze } from './repair';
import { bfsDistances, validateMaze } from './validate';

export interface GenerateOptions {
  /**
   * Extra acceptance gate applied to every pipeline result (after repair) in addition to
   * `validateMaze`. A rejected Maze counts as a failed attempt. `attempt` is 0-based.
   * Not applied to the fallback template. Used by tests to force regeneration.
   */
  accept?: (maze: Maze, attempt: number) => boolean;
}

/** Retry index used by the fallback streams (far from any real attempt index). */
const FALLBACK_RETRY = 0x5fa11;
/** Partition re-derivations tried by the fallback before keeping the last one. */
const FALLBACK_PARTITION_TRIES = 24;
/**
 * Item-layout variants tried by the fallback. A variant re-seeds the special-item order and the
 * partition streams: a single-cell block has a fixed kind, so two adjacent single-cell blocks of
 * the same kind inside one window cannot be fixed by the partition alone; moving the items can.
 */
const FALLBACK_VARIANTS = 64;
const FALLBACK_VARIANT_STRIDE = 4096;

/** Runs the full pipeline once for `retry`, without validation. */
function buildOnce(runSeed: number, levelNumber: number, cfg: GameConfig, retry: number): Maze {
  const carved = carveMaze(runSeed, levelNumber, retry, cfg);
  const starts = placeStarts(carved, runSeed, levelNumber, retry);
  const doorRes = placeDoors(carved, runSeed, levelNumber, retry, cfg, { exclude: startCells(starts) });
  const placed = placeItems(
    {
      width: carved.width,
      height: carved.height,
      tiles: doorRes.tiles,
      doors: doorRes.doors,
      cage: carved.cage,
      playerStart: starts.playerStart,
      hunterStart: starts.hunterStart,
    },
    cfg,
    starts.rng,
  );
  const part = partitionItems(
    {
      width: carved.width,
      height: carved.height,
      tiles: doorRes.tiles,
      doors: doorRes.doors,
      cage: carved.cage,
      playerStart: starts.playerStart,
      hunterStart: starts.hunterStart,
      keys: placed.keys,
      special: [...placed.power, ...placed.speed, ...placed.bombs, ...placed.ghostHunt],
    },
    cfg,
    placed.rng,
  );
  return {
    width: carved.width,
    height: carved.height,
    tiles: doorRes.tiles,
    doors: doorRes.doors,
    wrapPairs: [],
    playerStart: starts.playerStart,
    hunterStart: starts.hunterStart,
    cage: carved.cage,
    keys: placed.keys,
    ordinary: part.ordinary,
    power: placed.power,
    speed: placed.speed,
    bombs: placed.bombs,
    ghostHunt: placed.ghostHunt,
    wisps: part.wisps,
    generation: { attempts: 1, repairs: 0 },
  };
}

/** Tiles of the fixed pillar-mesh template around the centred Cage block. */
export function templateTiles(width: number, height: number): {
  tiles: Uint8Array;
  block: Rect;
  cage: { interior: Cell[]; entrance: Cell };
} {
  const block = cageBlockFor(width, height);
  const tiles = new Uint8Array(width * height).fill(Tile.Wall);
  const inBlock = (x: number, y: number): boolean => x >= block.x0 && x <= block.x1 && y >= block.y0 && y <= block.y1;
  const lattice = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2 && x % 2 === 1 && y % 2 === 1 && !inBlock(x, y);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (lattice(x, y)) tiles[y * width + x] = Tile.Floor;
      else if (x % 2 === 0 && y % 2 === 1 && lattice(x - 1, y) && lattice(x + 1, y)) tiles[y * width + x] = Tile.Floor;
      else if (x % 2 === 1 && y % 2 === 0 && lattice(x, y - 1) && lattice(x, y + 1)) tiles[y * width + x] = Tile.Floor;
    }
  }
  const interior: Cell[] = [];
  for (let y = block.y0; y <= block.y1; y++) {
    for (let x = block.x0; x <= block.x1; x++) {
      const edge = x === block.x0 || x === block.x1 || y === block.y0 || y === block.y1;
      if (edge) tiles[y * width + x] = Tile.WallHard;
      else {
        tiles[y * width + x] = Tile.CageInterior;
        interior.push({ x, y });
      }
    }
  }
  const entrance: Cell = { x: (block.x0 + block.x1) / 2, y: block.y0 };
  tiles[entrance.y * width + entrance.x] = Tile.CageGate;
  tiles[(entrance.y - 1) * width + entrance.x] = Tile.Floor;
  for (let x = 0; x < width; x++) {
    tiles[x] = Tile.WallHard;
    tiles[(height - 1) * width + x] = Tile.WallHard;
  }
  for (let y = 0; y < height; y++) {
    tiles[y * width] = Tile.WallHard;
    tiles[y * width + width - 1] = Tile.WallHard;
  }
  return { tiles, block, cage: { interior, entrance } };
}

/**
 * Deterministic fixed-template Maze. Honours the configured size, Door count and item counts
 * and validates with `validateMaze` for every config the placement predicates can satisfy.
 */
export function fallbackMaze(runSeed: number, levelNumber: number, cfg: GameConfig): Maze {
  let last: Maze | null = null;
  for (let v = 0; v < FALLBACK_VARIANTS; v++) {
    let m: Maze;
    try {
      m = fallbackVariant(runSeed, levelNumber, cfg, v);
    } catch (e) {
      if (e instanceof RangeError && last !== null) continue;
      throw e;
    }
    if (validateMaze(m, cfg).ok) return m;
    last = m;
  }
  return last as Maze;
}

function fallbackVariant(runSeed: number, levelNumber: number, cfg: GameConfig, variant: number): Maze {
  const itemRetry = FALLBACK_RETRY + variant * FALLBACK_VARIANT_STRIDE;
  const { width, height } = { width: cfg.mazeSize.w, height: cfg.mazeSize.h };
  const tpl = templateTiles(width, height);
  const carved = { width, height, tiles: tpl.tiles, cage: tpl.cage };
  const starts = placeStarts(carved, runSeed, levelNumber, FALLBACK_RETRY);
  const doorRes = placeDoors(carved, runSeed, levelNumber, FALLBACK_RETRY, cfg, { exclude: startCells(starts) });
  const tiles = doorRes.tiles;

  const nav = { width, height, tiles, doors: doorRes.doors };
  const dp = bfsDistances(nav, [starts.playerStart]);
  const dh = bfsDistances(nav, [starts.hunterStart]);
  const dc = bfsDistances(nav, [tpl.cage.entrance]);
  const cellOf = (i: number): Cell => ({ x: i % width, y: Math.floor(i / width) });

  const candidates: number[] = [];
  const startIdx = new Set([
    starts.playerStart.y * width + starts.playerStart.x,
    starts.hunterStart.y * width + starts.hunterStart.x,
  ]);
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === Tile.Floor && !startIdx.has(i) && dp[i]! >= 0 && dh[i]! >= 0 && dc[i]! >= 0) candidates.push(i);
  }
  const [order] = shuffle(deriveSeed(runSeed, levelNumber, 'items', itemRetry), candidates);
  const taken = new Set<number>();

  /** First free cell in seeded order that passes `ok`, preferring `prefer`; any free cell as a last resort. */
  const take = (ok: (i: number) => boolean, prefer: (i: number) => boolean = () => true): Cell => {
    let best = -1;
    for (const i of order) {
      if (taken.has(i) || !ok(i)) continue;
      if (prefer(i)) {
        best = i;
        break;
      }
      if (best < 0) best = i;
    }
    if (best < 0) best = order.find((i) => !taken.has(i)) ?? -1;
    if (best < 0) throw new RangeError('fallbackMaze: no free floor cell left');
    taken.add(best);
    return cellOf(best);
  };
  const central = (i: number): boolean => inCentralRegion(width, height, cellOf(i));

  const keys: Cell[] = [];
  for (let n = 0; n < KEY_COUNT; n++) {
    keys.push(
      take(
        (i) =>
          dp[i]! - dh[i]! <= cfg.keyFairnessDelta &&
          dc[i]! >= cfg.keyMinDist &&
          dc[i]! <= cfg.keyMaxDist &&
          !central(i),
        (i) => thirdOf(width, i % width) === n % 3 && !keys.some((k) => thirdOf(width, k.x) === thirdOf(width, i % width)),
      ),
    );
  }
  const power: Cell[] = [];
  for (let n = 0; n < cfg.powerPelletsPerLevel; n++) {
    power.push(
      take(
        (i) =>
          dp[i]! > cfg.powerMinStartDist &&
          dh[i]! > cfg.powerMinStartDist &&
          Math.abs(dp[i]! - dh[i]!) <= cfg.powerFairnessDelta,
        (i) => quadrantOf(width, height, cellOf(i)) === n % 4,
      ),
    );
  }
  const speed: Cell[] = [];
  for (let n = 0; n < cfg.speedPelletsPerLevel; n++) {
    speed.push(take((i) => Math.abs(dp[i]! - dh[i]!) <= cfg.speedFairnessDelta));
  }
  const bombs: Cell[] = [];
  for (let n = 0; n < cfg.bombsPerLevel; n++) {
    bombs.push(
      take(
        (i) => dp[i]! >= cfg.bombMinStartDist && dh[i]! - dp[i]! >= -cfg.bombFairnessDelta,
        (i) => thirdOf(width, i % width) === n % 3,
      ),
    );
  }
  const ghostHunt: Cell[] = [];
  for (let n = 0; n < cfg.ghostHuntPerLevel; n++) {
    ghostHunt.push(take((i) => dc[i]! >= cfg.ghostHuntMinCageDist && dh[i]! - dp[i]! >= -cfg.bombFairnessDelta));
  }

  const base = {
    width,
    height,
    tiles,
    doors: doorRes.doors,
    wrapPairs: [] as Array<[Cell, Cell]>,
    playerStart: starts.playerStart,
    hunterStart: starts.hunterStart,
    cage: tpl.cage,
    keys,
    power,
    speed,
    bombs,
    ghostHunt,
  };
  const input = {
    width,
    height,
    tiles,
    doors: doorRes.doors,
    cage: { entrance: tpl.cage.entrance },
    playerStart: starts.playerStart,
    hunterStart: starts.hunterStart,
    keys,
    special: [...power, ...speed, ...bombs, ...ghostHunt],
  };
  let maze: Maze | null = null;
  for (let t = 0; t < FALLBACK_PARTITION_TRIES; t++) {
    const part = partitionItems(input, cfg, deriveSeed(runSeed, levelNumber, 'items', itemRetry + 1 + t));
    maze = {
      ...base,
      ordinary: part.ordinary,
      wisps: part.wisps,
      generation: { attempts: cfg.maxAttempts, repairs: 0, fallback: true },
    };
    // The fixed template is the last resort: the balance pre-filter (check 8) never rejects it.
    if (validateMaze(maze, cfg, { prefilter: false }).ok) return maze;
    // Block minimums can stop the partition from flipping a cell in a window; the
    // next derived partition (different shuffle) usually avoids that. Bounded search.
  }
  // Repair the last candidate (re-derives the partition from the repair stream).
  const last = maze as Maze;
  const res = repairMaze(last, { ...cfg, maxRepairs: Math.max(cfg.maxRepairs, 64) }, runSeed, levelNumber, itemRetry);
  if (res.ok) return { ...res.maze, generation: { attempts: cfg.maxAttempts, repairs: 0, fallback: true } };
  return last;
}

/**
 * Generates a Maze for (runSeed, levelNumber). `retryIndex` (default 0) is mixed into every
 * seed stream; attempt `a` uses `retryIndex + a`. See the file header.
 */
export function generateMaze(
  runSeed: number,
  levelNumber: number,
  cfg: GameConfig,
  retryIndex = 0,
  options: GenerateOptions = {},
): Maze {
  const maxAttempts = Math.max(0, Math.floor(cfg.maxAttempts));
  const accept = options.accept ?? (() => true);
  let repairs = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let maze: Maze;
    try {
      maze = buildOnce(runSeed, levelNumber, cfg, retryIndex + attempt);
    } catch (e) {
      if (e instanceof RangeError) continue; // an unplaceable layout counts as a failed attempt
      throw e;
    }
    if (!validateMaze(maze, cfg).ok || !accept(maze, attempt)) {
      const res = repairMaze(maze, cfg, runSeed, levelNumber, retryIndex + attempt);
      repairs += res.repairs;
      if (!res.ok || !accept(res.maze, attempt)) continue;
      maze = res.maze;
    }
    return withIce({ ...maze, generation: { attempts: attempt + 1, repairs } }, runSeed, levelNumber, retryIndex, cfg);
  }

  const fb = fallbackMaze(runSeed, levelNumber, cfg);
  return withIce({ ...fb, generation: { attempts: maxAttempts, repairs, fallback: true } }, runSeed, levelNumber, retryIndex, cfg);
}

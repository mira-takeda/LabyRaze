/**
 * Ice patches for snow-biome Mazes (task 36.5).
 *
 * A patch is `icePatchLen` consecutive Floor Cells in a straight corridor (both side neighbours
 * are walls). Patches never touch the Cage entrance (or the Cell outside it), Door Cells and
 * their neighbours, starts, Keys or special items (Power, Speed, Bomb, Ghost_Hunt), and never
 * overlap or touch each other. Selection uses its own `ice` PRNG stream, so adding ice cannot
 * change any other generation output. Ice never changes passability.
 */

import type { GameConfig } from '../config';
import { isSnowLevel } from '../biome';
import { deriveSeed, shuffle } from '../prng';
import { Tile } from '../types';
import type { Cell, Maze } from '../types';

function isSolid(tiles: Uint8Array, w: number, h: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return true;
  const t = tiles[y * w + x];
  return t === Tile.Wall || t === Tile.WallHard;
}

/** Builds the ice mask for `maze`. Returns an all-zero mask when no patch fits. */
export function buildIceMask(maze: Maze, runSeed: number, levelNumber: number, retryIndex: number, cfg: GameConfig): Uint8Array {
  const { width: w, height: h, tiles } = maze;
  const mask = new Uint8Array(w * h);
  const len = Math.max(1, Math.floor(cfg.icePatchLen));
  const want = Math.max(0, Math.floor(cfg.icePatches));

  const blocked = new Uint8Array(w * h);
  const block = (c: Cell, radius: number): void => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) blocked[y * w + x] = 1;
      }
    }
  };
  block(maze.cage.entrance, 1);
  block(maze.playerStart, 0);
  block(maze.hunterStart, 0);
  for (const d of maze.doors) block(d.cell, 1);
  for (const list of [maze.keys, maze.power, maze.speed, maze.bombs, maze.ghostHunt]) for (const c of list) block(c, 0);

  const eligible = (x: number, y: number, horizontal: boolean): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (tiles[y * w + x] !== Tile.Floor || blocked[y * w + x] === 1) return false;
    return horizontal
      ? isSolid(tiles, w, h, x, y - 1) && isSolid(tiles, w, h, x, y + 1)
      : isSolid(tiles, w, h, x - 1, y) && isSolid(tiles, w, h, x + 1, y);
  };

  const candidates: Array<{ x: number; y: number; horizontal: boolean }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (const horizontal of [true, false]) {
        let ok = true;
        for (let k = 0; k < len && ok; k++) ok = eligible(horizontal ? x + k : x, horizontal ? y : y + k, horizontal);
        if (ok) candidates.push({ x, y, horizontal });
      }
    }
  }
  if (candidates.length === 0 || want === 0) return mask;

  const [order] = shuffle(deriveSeed(runSeed, levelNumber, 'ice', retryIndex), candidates);
  const cellsOf = (c: { x: number; y: number; horizontal: boolean }): number[] =>
    Array.from({ length: len }, (_, k) => (c.horizontal ? c.y * w + c.x + k : (c.y + k) * w + c.x));
  let placed = 0;
  for (const c of order) {
    if (placed >= want) break;
    const cells = cellsOf(c);
    // Keep patches apart: no ice on or next to (4-neighbourhood) any chosen cell.
    const clash = cells.some((i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return mask[i] === 1 || (x > 0 && mask[i - 1] === 1) || (x < w - 1 && mask[i + 1] === 1) || (y > 0 && mask[i - w] === 1) || (y < h - 1 && mask[i + w] === 1);
    });
    if (clash) continue;
    for (const i of cells) mask[i] = 1;
    placed++;
  }
  return mask;
}

/** Adds the ice mask on snow levels; returns `maze` itself (same object) everywhere else. */
export function withIce(maze: Maze, runSeed: number, levelNumber: number, retryIndex: number, cfg: GameConfig): Maze {
  if (!cfg.iceEnabled || !isSnowLevel(levelNumber)) return maze;
  return { ...maze, ice: buildIceMask(maze, runSeed, levelNumber, retryIndex, cfg) };
}

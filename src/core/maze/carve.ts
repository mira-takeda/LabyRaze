/**
 * Maze carving: iterative randomized DFS on the odd lattice, a central Cage block
 * with exactly one gate, a loop pass (cycles + dead-end removal) and wall hardness.
 *
 * Pure and deterministic: every random draw comes from the `maze` PRNG stream
 * derived from (runSeed, levelNumber, retryIndex). No recursion, no clock.
 * Layouts are generated procedurally; no existing game's maze is reproduced.
 */

import type { GameConfig } from '../config';
import { cellIndex, NEIGHBOR_DX, NEIGHBOR_DY } from '../grid';
import { deriveSeed, nextFloat, shuffle } from '../prng';
import type { PrngState } from '../prng';
import { Tile } from '../types';
import type { Cell } from '../types';

/** Rectangle of grid cells, inclusive on all sides. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CarvedMaze {
  width: number;
  height: number;
  /** Initial tiles: Wall | WallHard | Floor | CageInterior | CageGate. */
  tiles: Uint8Array;
  /** Cage perimeter rectangle (WallHard ring, interior and gate included). */
  cageBlock: Rect;
  cage: { interior: Cell[]; entrance: Cell };
  /** Remaining `maze` stream state, so later generation steps can continue it. */
  rng: PrngState;
  /** Counters for tests and diagnostics. */
  loopsAdded: number;
  deadEndsRemoved: number;
}

export type CarveConfig = Pick<GameConfig, 'mazeSize' | 'loopCount' | 'minLoopSpan' | 'deadEndRemoval'>;

/** Computes the centred Cage perimeter rectangle for a grid size. */
export function cageBlockFor(width: number, height: number): Rect {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  // Perimeter columns must be odd (lattice columns), rows must be even (wall rows),
  // so the block stays centred and aligned with the lattice.
  const halfW = cx % 2 === 0 ? 3 : 4; // interior width 5 or 7
  const halfH = cy % 2 === 0 ? 2 : 3; // interior height 3 or 5
  const block = { x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH };
  if (block.x0 < 2 || block.y0 < 2) {
    throw new RangeError(`mazeSize ${width}x${height} is too small for the Cage block`);
  }
  return block;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** Carves a maze. See file header for the guarantees. */
export function carveMaze(
  runSeed: number,
  levelNumber: number,
  retryIndex: number,
  config: CarveConfig,
): CarvedMaze {
  const width = config.mazeSize.w;
  const height = config.mazeSize.h;
  const block = cageBlockFor(width, height);
  const tiles = new Uint8Array(width * height).fill(Tile.Wall);
  let rng: PrngState = deriveSeed(runSeed, levelNumber, 'maze', retryIndex);

  const idx = (x: number, y: number): number => cellIndex(width, x, y);

  // 1. Iterative randomized DFS over odd-lattice cells outside the Cage block.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [idx(1, 1)];
  visited[idx(1, 1)] = 1;
  tiles[idx(1, 1)] = Tile.Floor;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!;
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    const options: number[] = [];
    for (let k = 0; k < 4; k++) {
      const nx = cx + NEIGHBOR_DX[k]! * 2;
      const ny = cy + NEIGHBOR_DY[k]! * 2;
      if (nx < 1 || ny < 1 || nx > width - 2 || ny > height - 2) continue;
      if (inRect(block, nx, ny)) continue;
      if (visited[idx(nx, ny)]) continue;
      options.push(k);
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [shuffled, next] = shuffle(rng, options);
    rng = next;
    const k = shuffled[0]!;
    const nx = cx + NEIGHBOR_DX[k]! * 2;
    const ny = cy + NEIGHBOR_DY[k]! * 2;
    tiles[idx(cx + NEIGHBOR_DX[k]!, cy + NEIGHBOR_DY[k]!)] = Tile.Floor;
    tiles[idx(nx, ny)] = Tile.Floor;
    visited[idx(nx, ny)] = 1;
    stack.push(idx(nx, ny));
  }

  // 2. Cage block: hard perimeter, interior, one gate on the top edge.
  const gateX = (block.x0 + block.x1) / 2;
  const interior: Cell[] = [];
  for (let y = block.y0; y <= block.y1; y++) {
    for (let x = block.x0; x <= block.x1; x++) {
      const edge = x === block.x0 || x === block.x1 || y === block.y0 || y === block.y1;
      if (edge) {
        tiles[idx(x, y)] = Tile.WallHard;
      } else {
        tiles[idx(x, y)] = Tile.CageInterior;
        interior.push({ x, y });
      }
    }
  }
  const entrance: Cell = { x: gateX, y: block.y0 };
  tiles[idx(entrance.x, entrance.y)] = Tile.CageGate;
  // The cell in front of the gate must be floor. It is a lattice cell, or a passage
  // between two lattice cells outside the block (carving it can only add a loop).
  tiles[idx(gateX, block.y0 - 1)] = Tile.Floor;

  // 3. Outer boundary is indestructible.
  for (let x = 0; x < width; x++) {
    tiles[idx(x, 0)] = Tile.WallHard;
    tiles[idx(x, height - 1)] = Tile.WallHard;
  }
  for (let y = 0; y < height; y++) {
    tiles[idx(0, y)] = Tile.WallHard;
    tiles[idx(width - 1, y)] = Tile.WallHard;
  }

  // 4. Loop pass.
  const isFloor = (x: number, y: number): boolean => tiles[idx(x, y)] === Tile.Floor;

  /** Graph distance between two floor cells over Floor tiles only (-1 if unreachable). */
  const dist = (ax: number, ay: number, bx: number, by: number): number => {
    const d = new Int32Array(width * height).fill(-1);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    const s = idx(ax, ay);
    const t = idx(bx, by);
    d[s] = 0;
    queue[tail++] = s;
    while (head < tail) {
      const c = queue[head++]!;
      if (c === t) return d[c]!;
      const x = c % width;
      const y = Math.floor(c / width);
      for (let k = 0; k < 4; k++) {
        const nx = x + NEIGHBOR_DX[k]!;
        const ny = y + NEIGHBOR_DY[k]!;
        if (!isFloor(nx, ny)) continue;
        const n = idx(nx, ny);
        if (d[n] !== -1) continue;
        d[n] = d[c]! + 1;
        queue[tail++] = n;
      }
    }
    return -1;
  };

  /** Interior wall cells between two opposite floor cells, never boundary or Cage. */
  const wallCandidates = (): number[] => {
    const out: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (tiles[idx(x, y)] !== Tile.Wall) continue;
        if (x % 2 === y % 2) continue; // pillars (odd,odd are lattice, even,even are corners)
        if (inRect(block, x, y)) continue;
        if (x % 2 === 0) {
          if (isFloor(x - 1, y) && isFloor(x + 1, y)) out.push(idx(x, y));
        } else if (isFloor(x, y - 1) && isFloor(x, y + 1)) {
          out.push(idx(x, y));
        }
      }
    }
    return out;
  };

  const endpoints = (c: number): [number, number, number, number] => {
    const x = c % width;
    const y = Math.floor(c / width);
    return x % 2 === 0 ? [x - 1, y, x + 1, y] : [x, y - 1, x, y + 1];
  };

  let loopsAdded = 0;
  {
    const [cands, next] = shuffle(rng, wallCandidates());
    rng = next;
    for (const c of cands) {
      if (loopsAdded >= config.loopCount) break;
      const [ax, ay, bx, by] = endpoints(c);
      const d = dist(ax, ay, bx, by);
      if (d >= config.minLoopSpan || d === -1) {
        tiles[c] = Tile.Floor;
        loopsAdded++;
      }
    }
  }

  // Dead-end removal: open one wall of a dead end with probability deadEndRemoval.
  let deadEndsRemoved = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      if (!isFloor(x, y)) continue;
      let open = 0;
      const walls: number[] = [];
      for (let k = 0; k < 4; k++) {
        const px = x + NEIGHBOR_DX[k]!;
        const py = y + NEIGHBOR_DY[k]!;
        const t = tiles[idx(px, py)]!;
        if (t === Tile.Floor || t === Tile.CageGate) {
          open++;
          continue;
        }
        const ox = x + NEIGHBOR_DX[k]! * 2;
        const oy = y + NEIGHBOR_DY[k]! * 2;
        if (t === Tile.Wall && ox >= 1 && oy >= 1 && ox <= width - 2 && oy <= height - 2 && isFloor(ox, oy)) {
          walls.push(idx(px, py));
        }
      }
      if (open !== 1 || walls.length === 0) continue;
      const [roll, n1] = nextFloat(rng);
      rng = n1;
      if (roll >= config.deadEndRemoval) continue;
      const [order, n2] = shuffle(rng, walls);
      rng = n2;
      tiles[order[0]!] = Tile.Floor;
      deadEndsRemoved++;
    }
  }

  return {
    width,
    height,
    tiles,
    cageBlock: block,
    cage: { interior, entrance },
    rng,
    loopsAdded,
    deadEndsRemoved,
  };
}

// Static maze layer (task 22.2): walls and floor rendered once per level into an offscreen
// surface; `patch(cells)` redraws destroyed Cells and their 8 neighbours from the live tiles.

import { Tile } from '../core/types';
import type { Cell, Maze } from '../core/types';
import { TILE } from './layout';
import type { Ctx2D, SurfaceFactory } from './layout';
import type { DrawAdapter, TileInfo } from './placeholders';

export class StaticLayer {
  readonly canvas: CanvasImageSource;
  private readonly ctx: Ctx2D;
  private readonly rubble = new Set<number>();
  /** Number of Cells drawn so far (exposed for tests and perf checks). */
  drawnCells = 0;

  constructor(
    private readonly maze: Pick<Maze, 'width' | 'height' | 'tiles'> & { ice?: Uint8Array },
    private readonly adapter: DrawAdapter,
    factory: SurfaceFactory,
  ) {
    const s = factory(maze.width * TILE, maze.height * TILE);
    this.canvas = s.canvas;
    this.ctx = s.ctx;
  }

  /** Full redraw from `tiles` (the live wall layer). */
  render(tiles: Uint8Array): void {
    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) this.drawCell(tiles, x, y);
    }
  }

  /** Redraws the given Cells and their 8 neighbours. Cells that became Floor become rubble. */
  patch(tiles: Uint8Array, cells: readonly Cell[]): void {
    const w = this.maze.width;
    const todo = new Set<number>();
    for (const c of cells) {
      if (this.maze.tiles[c.y * w + c.x] === Tile.Wall && tiles[c.y * w + c.x] === Tile.Floor) this.rubble.add(c.y * w + c.x);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (x >= 0 && y >= 0 && x < w && y < this.maze.height) todo.add(y * w + x);
        }
      }
    }
    for (const i of [...todo].sort((a, b) => a - b)) this.drawCell(tiles, i % w, Math.floor(i / w));
  }

  private isWall(tiles: Uint8Array, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.maze.width || y >= this.maze.height) return true;
    const t = tiles[y * this.maze.width + x];
    return t === Tile.Wall || t === Tile.WallHard;
  }

  private info(tiles: Uint8Array, x: number, y: number): TileInfo {
    return {
      x,
      y,
      openUp: !this.isWall(tiles, x, y - 1),
      openDown: !this.isWall(tiles, x, y + 1),
      wallUp: this.isWall(tiles, x, y - 1),
      wallLeft: this.isWall(tiles, x - 1, y),
      ice: this.maze.ice !== undefined && this.maze.ice[y * this.maze.width + x] === 1,
    };
  }

  private drawCell(tiles: Uint8Array, x: number, y: number): void {
    const i = y * this.maze.width + x;
    const t = tiles[i];
    const px = x * TILE;
    const py = y * TILE;
    const a = this.adapter;
    this.drawnCells++;
    switch (t) {
      case Tile.Wall:
        a.drawWall(this.ctx, px, py, TILE, false, this.info(tiles, x, y));
        break;
      case Tile.WallHard:
        a.drawWall(this.ctx, px, py, TILE, true, this.info(tiles, x, y));
        break;
      case Tile.CageInterior:
        a.drawCageInterior(this.ctx, px, py, TILE);
        break;
      case Tile.CageGate:
        a.drawCageGate(this.ctx, px, py, TILE);
        break;
      default:
        // Floor and Door Cells (Doors are drawn by the dynamic layer on top of floor).
        a.drawFloor(this.ctx, px, py, TILE, this.rubble.has(i), this.info(tiles, x, y));
    }
  }
}

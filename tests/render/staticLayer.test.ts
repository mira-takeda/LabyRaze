// Static maze layer (task 22.2).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { Tile } from '../../src/core/types';
import { TILE } from '../../src/render/layout';
import { PALETTE, placeholderAdapter } from '../../src/render/placeholders';
import { StaticLayer } from '../../src/render/staticLayer';
import { mockFactory } from '../helpers/mockCanvas';

describe('static layer', () => {
  it('renders every Cell once per full render', () => {
    const s = createRun(3, DEFAULT_CONFIG).state;
    const { factory, surfaces } = mockFactory();
    const layer = new StaticLayer(s.maze, placeholderAdapter, factory);
    layer.render(s.walls.tiles);
    expect(layer.drawnCells).toBe(s.maze.width * s.maze.height);
    expect(surfaces).toHaveLength(1);
    const rects = surfaces[0]!.rects();
    expect(rects.some((r) => r.fill === PALETTE.wall)).toBe(true);
    expect(rects.some((r) => r.fill === PALETTE.wallHard)).toBe(true);
  });

  it('patch redraws only the destroyed Cells and their 8 neighbours, as rubble', () => {
    const s = createRun(4, DEFAULT_CONFIG).state;
    const { factory, surfaces } = mockFactory();
    const layer = new StaticLayer(s.maze, placeholderAdapter, factory);
    layer.render(s.walls.tiles);
    const w = s.maze.width;
    // Pick an interior destructible wall.
    let idx = -1;
    for (let i = 0; i < s.walls.tiles.length; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (s.walls.tiles[i] === Tile.Wall && x > 1 && y > 1 && x < w - 2 && y < s.maze.height - 2) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const tiles = s.walls.tiles.slice();
    tiles[idx] = Tile.Floor;
    const before = layer.drawnCells;
    surfaces[0]!.reset();
    const cell = { x: idx % w, y: Math.floor(idx / w) };
    layer.patch(tiles, [cell]);
    expect(layer.drawnCells - before).toBe(9);
    const rubble = surfaces[0]!.rects().filter((r) => r.fill === PALETTE.rubble);
    expect(rubble).toHaveLength(1);
    expect(rubble[0]!.x).toBe(cell.x * TILE);
    expect(rubble[0]!.y).toBe(cell.y * TILE);
  });
});

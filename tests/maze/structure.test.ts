// Feature: kirobit-halloween-maze, Property 9: Maze structure and limits
// **Validates: Requirements 4.2, 4.6, 4.7, 12.4, 17.4**

import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import { MIN_ORDINARY } from '../../src/core/maze/validate';
import { CageGate, CageInterior, Door, Floor, WallHard } from '../../src/core/types';
import type { Cell, Maze } from '../../src/core/types';
import { arbLevel, arbSeed } from '../helpers/arbitraries';

const cfg = DEFAULT_CONFIG;

function allItems(m: Maze): Cell[] {
  return [...m.keys, ...m.ordinary, ...m.power, ...m.speed, ...m.bombs, ...m.ghostHunt, ...m.wisps];
}

/** Floor and Door tiles form a graph; a connected graph has a cycle iff edges >= vertices. */
function hasLoop(m: Maze): boolean {
  const open = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
    const t = m.tiles[y * m.width + x];
    return t === Floor || t === Door;
  };
  let v = 0;
  let e = 0;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (!open(x, y)) continue;
      v++;
      if (open(x + 1, y)) e++;
      if (open(x, y + 1)) e++;
    }
  }
  return e >= v;
}

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('Property 9: Maze structure and limits', () => {
  it('Feature: kirobit-halloween-maze, Property 9: Maze structure and limits', () => {
    fc.assert(
      fc.property(arbSeed, arbLevel, (seed, level) => {
        const m = generateMaze(seed, level, cfg);

        // Dimensions and Door count equal the config at every level.
        expect(m.width).toBe(cfg.mazeSize.w);
        expect(m.height).toBe(cfg.mazeSize.h);
        expect(m.tiles.length).toBe(cfg.mazeSize.w * cfg.mazeSize.h);
        expect(m.doors.length).toBe(cfg.doorCount);

        // Cage centred, exactly one gate, three Keys.
        const cx = (m.width - 1) / 2;
        const cy = (m.height - 1) / 2;
        expect(m.cage.interior.length).toBeGreaterThan(0);
        const mx = m.cage.interior.reduce((s, c) => s + c.x, 0) / m.cage.interior.length;
        const my = m.cage.interior.reduce((s, c) => s + c.y, 0) / m.cage.interior.length;
        expect(Math.abs(mx - cx)).toBeLessThanOrEqual(1);
        expect(Math.abs(my - cy)).toBeLessThanOrEqual(2);
        for (const c of m.cage.interior) {
          expect(m.tiles[c.y * m.width + c.x]).toBe(CageInterior);
        }
        let gates = 0;
        for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === CageGate) gates++;
        expect(gates).toBe(1);
        expect(m.tiles[m.cage.entrance.y * m.width + m.cage.entrance.x]).toBe(CageGate);
        expect(m.keys.length).toBe(3);

        // Boundary is WallHard.
        for (let x = 0; x < m.width; x++) {
          expect(m.tiles[x]).toBe(WallHard);
          expect(m.tiles[(m.height - 1) * m.width + x]).toBe(WallHard);
        }
        for (let y = 0; y < m.height; y++) {
          expect(m.tiles[y * m.width]).toBe(WallHard);
          expect(m.tiles[y * m.width + m.width - 1]).toBe(WallHard);
        }

        // Item counts.
        expect(m.power.length).toBe(cfg.powerPelletsPerLevel);
        expect(m.speed.length).toBe(cfg.speedPelletsPerLevel);
        expect(m.bombs.length).toBe(cfg.bombsPerLevel);
        expect(m.ghostHunt.length).toBe(cfg.ghostHuntPerLevel);
        expect(m.wisps.length).toBeGreaterThanOrEqual(1);
        const eligible = m.wisps.length + m.ordinary.length;
        const ratio = m.wisps.length / eligible;
        expect(ratio).toBeGreaterThanOrEqual(cfg.wispDensity - 0.15);
        expect(ratio).toBeLessThanOrEqual(cfg.wispDensity + 0.15);
        expect(m.ordinary.length).toBeGreaterThanOrEqual(MIN_ORDINARY);

        // Loops exist (not a tree).
        expect(hasLoop(m)).toBe(true);

        // No two items share a cell.
        const items = allItems(m);
        const keys = new Set(items.map((c) => c.y * m.width + c.x));
        expect(keys.size).toBe(items.length);
      }),
      { numRuns: 200 },
    );
  }, 300_000);
});

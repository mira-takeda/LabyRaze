// Snow biome ice Cells (task 36.5): biomeIndex, deterministic placement, forbidden Cells,
// the no-turn-on-ice movement rule and the guarantee that ice never traps anyone.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BIOME_COUNT, biomeIndex, isSnowLevel } from '../../src/core/biome';
import { DEFAULT_CONFIG, validateConfig } from '../../src/core/config';
import { dirDx, dirDy, isPassable } from '../../src/core/grid';
import { generateMaze } from '../../src/core/maze/generate';
import { validateMaze } from '../../src/core/maze/validate';
import { stepMovement } from '../../src/core/movement';
import type { MoveEnv } from '../../src/core/movement';
import { Tile } from '../../src/core/types';
import type { Cell, Character, Dir, Maze } from '../../src/core/types';
import { makeCharacter, mazeFromAscii } from '../helpers/fixtures';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const SNOW_LEVELS = [21, 22, 23, 24, 25, 51, 55];

describe('biomeIndex', () => {
  it('maps levels to biomes in blocks of 5 and wraps after 6 biomes', () => {
    const expected: Array<[number, number]> = [[1, 0], [5, 0], [6, 1], [10, 1], [11, 2], [16, 3], [20, 3], [21, 4], [25, 4], [26, 5], [30, 5], [31, 0], [36, 1], [40, 1], [60, 5], [61, 0]];
    for (const [level, idx] of expected) expect(biomeIndex(level)).toBe(idx);
    expect(BIOME_COUNT).toBe(6);
    expect(isSnowLevel(23)).toBe(true);
    expect(isSnowLevel(20)).toBe(false);
    expect(isSnowLevel(26)).toBe(false);
  });

  it('the new config keys validate', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
    expect(DEFAULT_CONFIG.iceEnabled).toBe(true);
    expect(DEFAULT_CONFIG.icePatches).toBe(4);
    expect(DEFAULT_CONFIG.icePatchLen).toBe(4);
    expect(validateConfig({ ...DEFAULT_CONFIG, icePatchLen: 0 })).not.toEqual([]);
  });
});

describe('ice placement', () => {
  it('is deterministic for the same Seed and level', () => {
    for (const level of SNOW_LEVELS) {
      const a = generateMaze(7, level, DEFAULT_CONFIG);
      const b = generateMaze(7, level, DEFAULT_CONFIG);
      expect(Array.from(a.ice ?? [])).toEqual(Array.from(b.ice ?? []));
    }
  });

  it('exists only on snow levels (and only when enabled)', () => {
    for (let level = 1; level <= 60; level += 1) {
      const m = generateMaze(3, level, DEFAULT_CONFIG);
      expect(m.ice !== undefined, `level ${level}`).toBe(isSnowLevel(level));
    }
    expect(generateMaze(3, 22, { ...DEFAULT_CONFIG, iceEnabled: false }).ice).toBeUndefined();
  });

  it('places patches of icePatchLen straight Cells, at most icePatches, on most seeds', () => {
    let withIce = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = generateMaze(seed, 21, DEFAULT_CONFIG);
      const n = Array.from(m.ice!).filter((v) => v === 1).length;
      expect(n % DEFAULT_CONFIG.icePatchLen).toBe(0);
      expect(n).toBeLessThanOrEqual(DEFAULT_CONFIG.icePatches * DEFAULT_CONFIG.icePatchLen);
      if (n > 0) withIce++;
    }
    expect(withIce).toBeGreaterThanOrEqual(10);
  });

  it('never covers the Cage, gate, entrance, Doors, Keys, starts or special items', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), fc.constantFrom(...SNOW_LEVELS), (seed, level) => {
        const m = generateMaze(seed, level, DEFAULT_CONFIG);
        const ice = m.ice!;
        const w = m.width;
        const at = (c: Cell): number => ice[c.y * w + c.x]!;
        for (let i = 0; i < ice.length; i++) if (ice[i] === 1) expect(m.tiles[i]).toBe(Tile.Floor);
        for (const c of [...m.cage.interior, m.cage.entrance, m.playerStart, m.hunterStart, ...m.keys, ...m.power, ...m.speed, ...m.bombs, ...m.ghostHunt]) {
          expect(at(c)).toBe(0);
        }
        for (const d of m.doors) expect(at(d.cell)).toBe(0);
        // The Cell in front of the Cage gate and the Door neighbours stay dry too.
        expect(at({ x: m.cage.entrance.x, y: m.cage.entrance.y - 1 })).toBe(0);
        for (const d of m.doors) {
          for (const dd of DIRS) expect(at({ x: d.cell.x + dirDx(dd), y: d.cell.y + dirDy(dd) })).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  }, 60_000); // generates up to 100 mazes; the 5 s default is too short under full-suite load

  it('keeps snow Mazes valid', () => {
    for (const level of SNOW_LEVELS) {
      for (let seed = 1; seed <= 4; seed++) {
        const m = generateMaze(seed, level, DEFAULT_CONFIG);
        expect(validateMaze(m, DEFAULT_CONFIG).ok, `seed ${seed} level ${level}`).toBe(true);
      }
    }
  });
});

describe('ice movement rule', () => {
  // Corridor y=2 (x=1..9) with up-branches at x=5 (inside the patch) and x=8.
  const base = mazeFromAscii(['HHHHHHHHHHH', 'HHHHH.HH.HH', 'HP.......UH', 'HHHHHHHHHHH']);
  const iceMask = (xs: number[]): Uint8Array => {
    const m = new Uint8Array(base.width * base.height);
    for (const x of xs) m[2 * base.width + x] = 1;
    return m;
  };
  const env = (ice?: Uint8Array): MoveEnv => ({
    width: base.width,
    height: base.height,
    tiles: base.tiles,
    doors: base.doors,
    doorMask: 0,
    wrapPairs: [],
    ...(ice ? { ice } : {}),
  });
  const UNITS = 125;
  const start = (cell: Cell, over: Partial<Character> = {}): Character => makeCharacter('player', cell, { dir: 'right', ...over });

  function run(c: Character, e: MoveEnv, ticks: number, press: Record<number, Dir> = {}): Character[] {
    const out: Character[] = [];
    for (let t = 0; t < ticks; t++) {
      c = stepMovement(c, press[t] ?? null, UNITS, e);
      out.push(c);
    }
    return out;
  }

  it('without ice a buffered turn is taken at the first junction', () => {
    const trace = run(start({ x: 2, y: 2 }), env(), 60, { 0: 'up' });
    const last = trace[trace.length - 1]!;
    expect(last.cell.x).toBe(5);
    expect(last.cell.y).toBe(1);
  });

  it('on ice a turn is not taken mid-patch; the character slides on and turns after leaving', () => {
    const trace = run(start({ x: 2, y: 2 }), env(iceMask([4, 5, 6])), 90, { 0: 'up' });
    for (const c of trace) {
      if (c.cell.x >= 4 && c.cell.x <= 6) expect(c.cell.y).toBe(2);
    }
    const last = trace[trace.length - 1]!;
    expect({ x: last.cell.x, y: last.cell.y }).toEqual({ x: 8, y: 1 });
  });

  it('a mid-step reverse is refused on ice', () => {
    const c0 = start({ x: 4, y: 2 }, { next: { x: 5, y: 2 }, progress: 500 });
    const trace = run(c0, env(iceMask([4, 5, 6])), 30, { 0: 'left' });
    // The refused reverse stays buffered and is taken once the patch is left (cell x = 7).
    for (const c of trace.slice(0, trace.findIndex((t) => t.cell.x >= 7))) {
      if (c.cell.x >= 4 && c.cell.x <= 6) expect(c.dir).toBe('right');
    }
    expect(Math.max(...trace.map((c) => c.cell.x))).toBeGreaterThanOrEqual(7);
  });

  it('when the straight path is blocked a character may turn or reverse on ice', () => {
    const c0 = start({ x: 8, y: 2 }, { next: { x: 9, y: 2 }, progress: 10, buffered: 'left' });
    const trace = run(c0, env(iceMask([7, 8, 9])), 40);
    expect(trace.some((c) => c.dir === 'left')).toBe(true);
  });
});

describe('ice never traps', () => {
  /** Reachable Cell set from state (cell, dir) under the ice rule, all Doors open. */
  function reach(m: Maze, from: Cell, dir: Dir): Set<number> {
    const w = m.width;
    const mask = (1 << m.doors.length) - 1;
    const pass = (x: number, y: number): boolean => isPassable(m.tiles, w, m.height, m.doors, mask, x, y);
    const seen = new Set<string>();
    const cells = new Set<number>([from.y * w + from.x]);
    const stack: Array<{ x: number; y: number; d: Dir }> = [{ ...from, d: dir }];
    seen.add(`${from.x},${from.y},${dir}`);
    while (stack.length > 0) {
      const s = stack.pop()!;
      const onIce = m.ice![s.y * w + s.x] === 1;
      const straightOpen = pass(s.x + dirDx(s.d), s.y + dirDy(s.d));
      for (const e of DIRS) {
        if (onIce && straightOpen && e !== s.d) continue;
        const nx = s.x + dirDx(e);
        const ny = s.y + dirDy(e);
        if (!pass(nx, ny)) continue;
        const key = `${nx},${ny},${e}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.add(ny * w + nx);
        stack.push({ x: nx, y: ny, d: e });
      }
    }
    return cells;
  }

  it('from any Cell and heading every objective stays reachable', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), fc.constantFrom(...SNOW_LEVELS), fc.nat(10_000), fc.constantFrom(...DIRS), (seed, level, pick, dir) => {
        const m = generateMaze(seed, level, DEFAULT_CONFIG);
        const w = m.width;
        const mask = (1 << m.doors.length) - 1;
        const pass = (x: number, y: number): boolean => isPassable(m.tiles, w, m.height, m.doors, mask, x, y);
        // Candidate states: passable Cells entered while heading `dir` (previous Cell passable).
        const cands: Cell[] = [];
        for (let y = 0; y < m.height; y++) {
          for (let x = 0; x < w; x++) if (pass(x, y) && pass(x - dirDx(dir), y - dirDy(dir))) cands.push({ x, y });
        }
        fc.pre(cands.length > 0);
        const from = cands[pick % cands.length]!;
        const cells = reach(m, from, dir);
        // Every passable Cell (hence every Key and the Cage entrance) is still reachable.
        for (const k of m.keys) expect(cells.has(k.y * w + k.x)).toBe(true);
        expect(cells.has(m.cage.entrance.y * w + m.cage.entrance.x) || !pass(m.cage.entrance.x, m.cage.entrance.y)).toBe(true);
        const open = (m.cage.entrance.y - 1) * w + m.cage.entrance.x;
        expect(cells.has(open)).toBe(true);
        for (const p of [...m.ordinary, ...m.wisps]) expect(cells.has(p.y * w + p.x)).toBe(true);
      }),
      { numRuns: 100 },
    );
  }, 60_000); // generates up to 100 mazes; takes ~5 s alone, longer under full-suite load

  it('ice does not change passability: identical tiles with and without ice', () => {
    for (const level of SNOW_LEVELS) {
      const on = generateMaze(5, level, DEFAULT_CONFIG);
      const off = generateMaze(5, level, { ...DEFAULT_CONFIG, iceEnabled: false });
      expect(Array.from(on.tiles)).toEqual(Array.from(off.tiles));
      expect(on.doors).toEqual(off.doors);
      expect(on.keys).toEqual(off.keys);
    }
  });
});

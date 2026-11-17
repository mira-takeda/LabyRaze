import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { carveMaze } from '../../src/core/maze/carve';
import { placeDoors } from '../../src/core/maze/doorPlacement';
import {
  KEY_COUNT,
  RELAX_CAP,
  inCentralRegion,
  placeItems,
  placeStarts,
  quadrantOf,
  startCells,
  thirdOf,
} from '../../src/core/maze/placement';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { computeDistanceField } from '../../src/core/pathfinding';
import { COLLECT_PLAYER, ItemKind, Tile } from '../../src/core/types';
import type { Cell } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const seedArb = fc.integer({ min: 0, max: 0x7fffffff });
const levelArb = fc.integer({ min: 1, max: 30 });
const opts = { numRuns: 40 };

function build(seed: number, level: number) {
  const carved = carveMaze(seed, level, 0, cfg);
  const starts = placeStarts(carved, seed, level, 0);
  const doorRes = placeDoors(carved, seed, level, 0, cfg, { exclude: startCells(starts) });
  const input = {
    width: carved.width,
    height: carved.height,
    tiles: doorRes.tiles,
    doors: doorRes.doors,
    cage: carved.cage,
    playerStart: starts.playerStart,
    hunterStart: starts.hunterStart,
  };
  const placement = placeItems(input, cfg, starts.rng);
  const nav = { width: carved.width, height: carved.height, doors: doorRes.doors, wrapPairs: [] };
  const mask = (1 << doorRes.doors.length) - 1;
  const field = (c: Cell): Int32Array =>
    computeDistanceField(nav, doorRes.tiles, mask, 0, [c.y * carved.width + c.x]).dist;
  return { carved, starts, doorRes, input, placement, field };
}

const key = (c: Cell): string => `${c.x},${c.y}`;

// Generation-based property tests are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('placement', () => {
  it('puts starts in opposite quadrants', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { carved, starts } = build(seed, level);
        const a = quadrantOf(carved.width, carved.height, starts.playerStart);
        const b = quadrantOf(carved.width, carved.height, starts.hunterStart);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a + b).toBe(3);
      }),
      opts,
    );
  });

  it('places 3 reachable Keys in distinct regions within the fairness delta', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { carved, input, placement, field } = build(seed, level);
        const dp = field(input.playerStart);
        const dh = field(input.hunterStart);
        const dc = field(input.cage.entrance);
        const w = carved.width;
        const { keys, relaxation } = placement;
        expect(keys).toHaveLength(KEY_COUNT);
        expect(new Set(keys.map((k) => thirdOf(w, k.x))).size).toBe(KEY_COUNT);
        const r = relaxation.key;
        expect(r).toBeLessThanOrEqual(RELAX_CAP);
        for (const k of keys) {
          const i = k.y * w + k.x;
          expect(dp[i]).toBeGreaterThanOrEqual(0);
          expect(inCentralRegion(w, carved.height, k)).toBe(false);
          expect(input.tiles[i]).toBe(Tile.Floor);
          expect(dp[i]! - dh[i]!).toBeLessThanOrEqual(cfg.keyFairnessDelta + r);
          expect(dc[i]).toBeGreaterThanOrEqual(Math.max(1, cfg.keyMinDist - r));
          expect(dc[i]).toBeLessThanOrEqual(cfg.keyMaxDist + r);
        }
      }),
      opts,
    );
  });

  it('places the configured counts of every item kind', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { placement: p } = build(seed, level);
        expect(p.keys).toHaveLength(3);
        expect(p.power).toHaveLength(cfg.powerPelletsPerLevel);
        expect(p.speed).toHaveLength(cfg.speedPelletsPerLevel);
        expect(p.bombs).toHaveLength(cfg.bombsPerLevel);
        expect(p.ghostHunt).toHaveLength(cfg.ghostHuntPerLevel);
        expect(p.items).toHaveLength(4 + 3 + cfg.bombsPerLevel + cfg.ghostHuntPerLevel);
      }),
      opts,
    );
  });

  it('keeps Power_Pellets and Speed_Pellets fair and not all near one character', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { carved, input, placement: p, field } = build(seed, level);
        const dp = field(input.playerStart);
        const dh = field(input.hunterStart);
        const w = carved.width;
        for (const c of p.power) {
          const i = c.y * w + c.x;
          expect(Math.abs(dp[i]! - dh[i]!)).toBeLessThanOrEqual(cfg.powerFairnessDelta + p.relaxation.power);
          expect(Math.min(dp[i]!, dh[i]!)).toBeGreaterThan(cfg.powerMinStartDist);
        }
        for (const c of p.speed) {
          const i = c.y * w + c.x;
          expect(Math.abs(dp[i]! - dh[i]!)).toBeLessThanOrEqual(cfg.speedFairnessDelta + p.relaxation.speed);
        }
        const sides = p.power.map((c) => Math.sign(dh[c.y * w + c.x]! - dp[c.y * w + c.x]!));
        expect(sides.every((s) => s === 1)).toBe(false);
        expect(sides.every((s) => s === -1)).toBe(false);
      }),
      opts,
    );
  });

  it('respects Bomb and Ghost_Hunt distances, thirds and cycle Cells', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { carved, input, placement: p, field } = build(seed, level);
        const dp = field(input.playerStart);
        const dh = field(input.hunterStart);
        const dc = field(input.cage.entrance);
        const w = carved.width;
        expect(new Set(p.bombs.map((b) => thirdOf(w, b.x))).size).toBe(p.bombs.length);
        for (const b of p.bombs) {
          const i = b.y * w + b.x;
          expect(dp[i]).toBeGreaterThanOrEqual(cfg.bombMinStartDist);
          expect(dh[i]! - dp[i]!).toBeGreaterThanOrEqual(-(cfg.bombFairnessDelta + p.relaxation.bomb));
        }
        for (const g of p.ghostHunt) {
          const i = g.y * w + g.x;
          expect(dc[i]).toBeGreaterThanOrEqual(cfg.ghostHuntMinCageDist);
          // cycle Cell: not a dead end (at least 2 open neighbours)
          const open = [i - 1, i + 1, i - w, i + w].filter(
            (j) => input.tiles[j] === Tile.Floor || input.tiles[j] === Tile.Door,
          ).length;
          expect(open).toBeGreaterThanOrEqual(2);
        }
      }),
      opts,
    );
  });

  it('keeps everything reachable, disjoint and player-only items flagged', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const { carved, input, placement: p, field, doorRes } = build(seed, level);
        const dp = field(input.playerStart);
        const all = [
          input.playerStart,
          input.hunterStart,
          ...p.keys,
          ...p.power,
          ...p.speed,
          ...p.bombs,
          ...p.ghostHunt,
        ];
        expect(new Set(all.map(key)).size).toBe(all.length);
        const doorKeys = new Set(doorRes.doors.map((d) => key(d.cell)));
        for (const c of all) {
          expect(dp[c.y * carved.width + c.x]).toBeGreaterThanOrEqual(0);
          expect(doorKeys.has(key(c))).toBe(false);
          expect(input.tiles[c.y * carved.width + c.x]).toBe(Tile.Floor);
        }
        for (const it of p.items) {
          if (it.kind === ItemKind.Bomb || it.kind === ItemKind.GhostHunt) {
            expect(it.collectorMask).toBe(COLLECT_PLAYER);
          }
        }
      }),
      opts,
    );
  });

  it('is deterministic for equal inputs and varies with the seed', () => {
    fc.assert(
      fc.property(seedArb, levelArb, (seed, level) => {
        const a = build(seed, level);
        const b = build(seed, level);
        expect(b.starts).toEqual(a.starts);
        expect(b.placement).toEqual(a.placement);
      }),
      opts,
    );
    const a = build(1, 1).placement;
    const b = build(2, 1).placement;
    expect(a.keys).not.toEqual(b.keys);
  });

  it('rarely needs relaxation with default config', () => {
    let relaxed = 0;
    const runs = 30;
    for (let s = 1; s <= runs; s++) {
      const r = build(s * 7919, 1 + (s % 5)).placement.relaxation;
      if (Object.values(r).some((v) => v > 0)) relaxed++;
    }
    expect(relaxed).toBeLessThan(runs / 3);
  });
});

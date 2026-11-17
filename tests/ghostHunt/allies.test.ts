import { describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { allySpeedUnits, emptyGhostHunt, stepGhostHunt } from '../../src/core/ghostHunt';
import type { AllyCatch, GhostHuntCommand } from '../../src/core/ghostHunt';
import { isPassable } from '../../src/core/grid';
import { computeDistanceField } from '../../src/core/pathfinding';
import type { Ally, Cell, Character, GhostHuntState, GhostHuntView } from '../../src/core/types';
import { buildState, cageMaze, makeCharacter } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;
const maze = cageMaze();
const base = buildState(maze);
const W = maze.width;
const doorIdx = (c: Cell): number => c.y * W + c.x;
const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const inInterior = (c: Cell): boolean => maze.cage.interior.some((i) => sameCell(i, c));

function viewOf(over: { hunter?: Partial<Character>; rescued?: [boolean, boolean, boolean]; doorMask?: number } = {}): GhostHuntView {
  return {
    walls: base.walls,
    doors: base.doors,
    derived: { ...base.derived, doorMask: over.doorMask ?? base.derived.doorMask },
    hunter: makeCharacter('hunter', maze.hunterStart, over.hunter),
    playerCell: base.player.cell,
    cage: maze.cage,
    tick: 0,
    nav: { width: maze.width, height: maze.height, doors: maze.doors, wrapPairs: maze.wrapPairs },
    hunterStart: maze.hunterStart,
    rescued: over.rescued ?? [false, false, false],
  };
}

function huntingAt(cell: Cell, mode: Ally['mode'] = 'hunting', ticksLeft = 100000): GhostHuntState {
  const gh = emptyGhostHunt(maze.cage.entrance);
  const allies = gh.allies.map((a) => ({ ...a, cell: { ...cell }, mode, spawnIn: 0, leaveIn: mode === 'returning' ? 600 : 0 }));
  return { ticksLeft: mode === 'hunting' ? ticksLeft : 0, allies: allies as GhostHuntState['allies'] };
}

interface Run {
  gh: GhostHuntState;
  catches: AllyCatch[];
  trace: GhostHuntState[];
}

function run(gh: GhostHuntState, view: GhostHuntView, ticks: number, cmd: GhostHuntCommand = {}): Run {
  const trace: GhostHuntState[] = [];
  const catches: AllyCatch[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = stepGhostHunt(gh, view, cfg, cmd);
    gh = r.gh;
    catches.push(...r.catches);
    trace.push(gh);
  }
  return { gh, catches, trace };
}

function distTo(target: Cell, from: Cell, view = viewOf()): number {
  const f = computeDistanceField(
    { width: W, height: maze.height, doors: maze.doors, wrapPairs: maze.wrapPairs },
    view.walls.tiles,
    view.derived.doorMask,
    0,
    [doorIdx(target)],
  );
  return f.dist[doorIdx(from)]!;
}

// Property simulations are heavy; no short time limit.
vi.setConfig({ testTimeout: 300_000 });

describe('ally speed', () => {
  it('is player base units times allyFactor, an integer', () => {
    expect(allySpeedUnits(125, 1.1)).toBe(Math.round(125 * 1.1));
    expect(Number.isInteger(allySpeedUnits(123, 1.1))).toBe(true);
  });
});

describe('ally movement', () => {
  it('only enters passable cells (no walls, no closed doors)', () => {
    for (const doorMask of [0, 1]) {
      const view = viewOf({ doorMask, hunter: { cell: { x: 9, y: 9 } } });
      const { trace } = run(huntingAt({ x: 5, y: 3 }), view, 600);
      for (const gh of trace) {
        for (const a of gh.allies) {
          expect(isPassable(view.walls.tiles, W, maze.height, maze.doors, doorMask, a.cell.x, a.cell.y)).toBe(true);
        }
      }
    }
  });

  it('pursuit reduces the distance to a stationary hunter and ends on it', () => {
    const view = viewOf({ hunter: { cell: { x: 9, y: 7 } } });
    const start = { x: 1, y: 1 };
    const d0 = distTo(view.hunter.cell, start);
    const { trace, catches } = run(huntingAt(start), view, 400);
    const dEnd = distTo(view.hunter.cell, trace[trace.length - 1]!.allies[0].cell);
    expect(dEnd).toBeLessThan(d0);
    expect(catches.length).toBeGreaterThan(0);
  });

  it('allies are not blocked by, and never read, the player position', () => {
    const a = run(huntingAt({ x: 1, y: 3 }), viewOf(), 50).gh;
    const v2 = { ...viewOf(), playerCell: { x: 2, y: 3 } };
    const b = run(huntingAt({ x: 1, y: 3 }), v2, 50).gh;
    expect(b).toEqual(a);
  });

  it('holds within allyHoldRadius of the Squareman start while the hunter respawns', () => {
    const view = viewOf({ hunter: { respawnIn: 100000, cell: { x: 9, y: 7 } } });
    const { gh } = run(huntingAt({ x: 1, y: 1 }), view, 600);
    for (const a of gh.allies) {
      expect(distTo(maze.hunterStart, a.cell)).toBeLessThanOrEqual(cfg.allyHoldRadius);
    }
  });
});

describe('ally catches', () => {
  it('reports a catch on contact (same cell)', () => {
    const view = viewOf({ hunter: { cell: { x: 3, y: 3 } } });
    const r = stepGhostHunt(huntingAt({ x: 3, y: 3 }), view, cfg);
    expect(r.catches).toHaveLength(1);
    expect(r.catches[0]).toMatchObject({ allyId: 0, cell: { x: 3, y: 3 } });
  });

  it('reports a catch on a swap of cells', () => {
    const view = viewOf({ hunter: { cell: { x: 4, y: 3 }, next: { x: 3, y: 3 }, progress: 100, dir: 'left' } });
    const gh = huntingAt({ x: 9, y: 9 });
    gh.allies[0] = { ...gh.allies[0], cell: { x: 3, y: 3 }, next: { x: 4, y: 3 }, progress: 100, dir: 'right' };
    const r = stepGhostHunt(gh, view, cfg);
    expect(r.catches.map((c) => c.allyId)).toEqual([0]);
  });

  it('reports no catch while the hunter is in grace or respawning', () => {
    for (const hunter of [{ invulnerable: 10 }, { respawnIn: 10 }]) {
      const view = viewOf({ hunter: { cell: { x: 3, y: 3 }, ...hunter } });
      const r = stepGhostHunt(huntingAt({ x: 3, y: 3 }), view, cfg);
      expect(r.catches).toEqual([]);
    }
  });

  it('does not catch with unspawned or returning allies', () => {
    const view = viewOf({ hunter: { cell: { x: 3, y: 3 } } });
    const waiting = huntingAt({ x: 3, y: 3 });
    waiting.allies = waiting.allies.map((a) => ({ ...a, spawnIn: 5 })) as GhostHuntState['allies'];
    expect(stepGhostHunt(waiting, view, cfg).catches).toEqual([]);
    expect(stepGhostHunt(huntingAt({ x: 3, y: 3 }, 'returning'), view, cfg).catches).toEqual([]);
  });
});

describe('returning and rescued allies', () => {
  it('returning captives walk back and end inside the cage as inactive', () => {
    const view = viewOf();
    const start = huntingAt({ x: 1, y: 1 }, 'returning');
    const { gh, trace } = run(start, view, 599);
    expect(gh.allies.every((a) => a.mode === 'inactive')).toBe(true);
    for (const a of gh.allies) expect(inInterior(a.cell)).toBe(true);
    // real movement: some ally was seen walking outside the cage on the way
    expect(trace.some((s) => s.allies.some((a) => a.mode === 'returning' && !inInterior(a.cell)))).toBe(true);
  });

  it('a blocked return snaps into the cage after the bounded fallback', () => {
    // all doors closed and the ally sealed away behind walls: cell (1,9) side is unreachable only via the door
    const sealed = huntingAt({ x: 1, y: 1 }, 'returning');
    const view = viewOf({ doorMask: 0 });
    // make the cage unreachable by walling the gate in a copied layer
    const tiles = view.walls.tiles.slice();
    tiles[doorIdx(maze.cage.entrance)] = 2;
    const blocked: GhostHuntView = { ...view, walls: { ...view.walls, tiles } };
    const { gh } = run(sealed, blocked, 600);
    expect(gh.allies.every((a) => a.mode === 'inactive')).toBe(true);
    for (const a of gh.allies) expect(inInterior(a.cell)).toBe(true);
  });

  it('rescued allies never enter the cage interior, hunting or leaving', () => {
    const view = viewOf({ rescued: [true, true, true], hunter: { cell: { x: 5, y: 3 } } });
    let gh = stepGhostHunt(emptyGhostHunt(maze.cage.entrance), view, cfg, { pickup: true }).gh;
    for (let i = 0; i < cfg.ghostHuntTicks + cfg.allyLeaveTicks + 5; i++) {
      gh = stepGhostHunt(gh, view, cfg).gh;
      for (const a of gh.allies) {
        expect(inInterior(a.cell)).toBe(false);
        if (a.next) expect(inInterior(a.next)).toBe(false);
        expect(a.mode).not.toBe('returning');
      }
    }
    expect(gh.allies.every((a) => a.mode === 'inactive')).toBe(true);
  });
});

describe('determinism and invariants', () => {
  it('same inputs give identical results and the input is not mutated', () => {
    const view = viewOf({ hunter: { cell: { x: 9, y: 7 } } });
    const start = huntingAt({ x: 1, y: 1 });
    const snap = structuredClone(start);
    const a = run(start, view, 120);
    const b = run(start, view, 120);
    expect(a.trace).toEqual(b.trace);
    expect(a.catches).toEqual(b.catches);
    expect(start).toEqual(snap);
  });

  it('rescue state invariant holds with real movement (property)', () => {
    // **Validates: Requirements 29.9, 29.10, 29.11, 29.12, 29.14**
    const hunterCells: Cell[] = [{ x: 9, y: 7 }, { x: 1, y: 1 }, { x: 5, y: 3 }, { x: 9, y: 9 }];
    fc.assert(
      fc.property(
        fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
        fc.constantFrom(...hunterCells),
        fc.constantFrom(0, 1),
        fc.array(fc.tuple(fc.constantFrom<'start' | 'tick' | 'levelEnd'>('start', 'tick', 'tick', 'tick', 'levelEnd'), fc.integer({ min: 1, max: 150 })), {
          minLength: 1,
          maxLength: 12,
        }),
        (flags, hCell, doorMask, ops) => {
          const rescued: [boolean, boolean, boolean] = [flags[0], flags[1], flags[2]];
          const view = viewOf({ rescued, doorMask, hunter: { cell: hCell } });
          let gh = emptyGhostHunt(maze.cage.entrance);
          for (const [op, n] of ops) {
            const count = op === 'tick' ? n : 1;
            for (let i = 0; i < count; i++) {
              const cmd: GhostHuntCommand = op === 'start' ? { pickup: true } : op === 'levelEnd' ? { levelEnd: true } : {};
              gh = stepGhostHunt(gh, view, cfg, cmd).gh;
              gh.allies.forEach((a, idx) => {
                expect(isPassable(view.walls.tiles, W, maze.height, maze.doors, doorMask, a.cell.x, a.cell.y)).toBe(true);
                if (!rescued[idx]) return;
                expect(a.mode).not.toBe('returning');
                expect(inInterior(a.cell)).toBe(false);
                if (a.next) expect(inInterior(a.next)).toBe(false);
              });
            }
          }
          expect(view.rescued).toEqual(rescued);
        },
      ),
      { numRuns: 60 },
    );
  });
});

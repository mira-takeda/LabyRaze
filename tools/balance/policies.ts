// Automated Player policies for the Balance_Simulator and for integration tests (task 18.1).
//
// A policy is a pure function of the current GameState: it returns the Input for the next Tick.
// It replans every Tick from a BFS over the live wall layer and the current open Doors, so it
// automatically replans after DoorChanged and WallsDestroyed. Ties use the fixed neighbour
// order of pathfinding.ts, so a policy is fully deterministic.
//
// Policies never peek at the Hunter brain or the PRNG. They use only state the Player could see.

import { detonate } from '../../src/core/bombs';
import { CELL_UNITS } from '../../src/core/config';
import { isPassable, wrapPartner } from '../../src/core/grid';
import { UNREACHABLE, computeDistanceField, nextStepDir } from '../../src/core/pathfinding';
import type { DistanceField } from '../../src/core/pathfinding';
import { ItemKind, Tile } from '../../src/core/types';
import type { Cell, Dir, GameState, Input } from '../../src/core/types';

export type PolicyName =
  | 'oneKey'
  | 'twoKey'
  | 'threeKey'
  | 'bombAggressive'
  | 'bombNone'
  | 'ghostHuntOpportunistic'
  | 'ghostHuntNone'
  | 'wispSweep'
  | HumanPolicyName;

/** Imperfect, human-like players (not part of the design policy set; used for evidence only). */
export type HumanPolicyName = 'humanSkilled' | 'humanCasual' | 'humanNovice';

export const POLICY_NAMES: readonly PolicyName[] = [
  'oneKey',
  'twoKey',
  'threeKey',
  'bombAggressive',
  'bombNone',
  'ghostHuntOpportunistic',
  'ghostHuntNone',
  'wispSweep',
];

/** Balance-tool parameters (not part of Game_Config: they describe test players, not the game). */
export interface PolicyParams {
  /** bombAggressive detonates when the blast shortens the route to the goal by at least this many Cells. */
  bombMinSaving: number;
  /** bombAggressive picks up a Bomb when the detour costs fewer Cells than this. */
  bombMaxDetour: number;
  /** ghostHuntOpportunistic picks up Ghost_Hunt when the detour costs fewer Cells than this. */
  ghostHuntMaxDetour: number;
  /** wispSweep collects a Wisp when the detour costs fewer Cells than this. */
  wispMaxDetour: number;
}

export const DEFAULT_POLICY_PARAMS: PolicyParams = {
  bombMinSaving: 4,
  bombMaxDetour: 8,
  ghostHuntMaxDetour: 10,
  wispMaxDetour: 4,
};

export type Policy = (state: GameState) => Input;

const IDLE: Input = { pressed: null, bomb: false, continue: false };

/** Keys a policy wants to carry before it heads to the Cage. */
function carryTarget(name: PolicyName): number {
  if (name === 'oneKey') return 1;
  if (name === 'twoKey') return 2;
  return 3;
}

/** Cell the Player decides from: the Cell it is entering when mid-step, otherwise its Cell. */
function decisionCell(s: GameState): Cell {
  const p = s.player;
  if (p.next !== null && p.progress > 0) return wrapPartner(s.maze.wrapPairs, p.next.x, p.next.y) ?? p.next;
  return p.cell;
}

function field(
  s: GameState,
  targets: readonly Cell[],
  tiles: Uint8Array = s.walls.tiles,
  mask: number = s.derived.doorMask,
): DistanceField {
  const w = s.maze.width;
  return computeDistanceField(s.maze, tiles, mask, s.walls.version, targets.map((c) => c.y * w + c.x));
}

function distAt(f: DistanceField, c: Cell): number {
  return f.dist[c.y * f.width + c.x]!;
}

/** Item Cells of one kind, in row-major order. */
function itemCells(s: GameState, kind: number): Cell[] {
  const out: Cell[] = [];
  const { kinds } = s.items;
  const w = s.maze.width;
  for (let i = 0; i < kinds.length; i++) if (kinds[i] === kind) out.push({ x: i % w, y: (i - (i % w)) / w });
  return out;
}

/** The primary goal set: Keys still needed, or the Cage entrance. */
export function primaryGoal(s: GameState, name: PolicyName): Cell[] {
  const rescued = s.captives.filter(Boolean).length;
  const needed = 3 - rescued;
  const want = Math.min(carryTarget(name), needed);
  if (s.carriedKeys >= want || s.items.keys.length === 0) return [s.maze.cage.entrance];
  return s.items.keys;
}

/**
 * Adds a side target when the detour is small. Returns the target set to steer to.
 * Detour = d(me, item) + d(item, goal) - d(me, goal), computed with two BFS fields.
 */
function withDetour(s: GameState, me: Cell, goal: Cell[], items: Cell[], maxDetour: number): Cell[] {
  if (items.length === 0) return goal;
  const toGoal = field(s, goal);
  const base = distAt(toGoal, me);
  const fromMe = field(s, [me]);
  let best: Cell | null = null;
  let bestDetour = Infinity;
  for (const it of items) {
    const a = distAt(fromMe, it);
    const b = distAt(toGoal, it);
    if (a === UNREACHABLE || b === UNREACHABLE) continue;
    const detour = base === UNREACHABLE ? a : a + b - base;
    if (detour < maxDetour && detour < bestDetour) {
      bestDetour = detour;
      best = it;
    }
  }
  return best ? [best] : goal;
}

/** Steps the blast would save on the route to `goal`, using the real detonation geometry. */
export function bombSaving(s: GameState, goal: readonly Cell[], radius: number): number {
  const me = s.player.cell;
  const before = distAt(field(s, goal), me);
  const blast = detonate(s.walls, s.maze.width, s.maze.height, s.player, radius);
  if (blast.destroyed.length === 0) return 0;
  const after = distAt(field(s, goal, blast.walls.tiles), me);
  if (after === UNREACHABLE) return 0;
  if (before === UNREACHABLE) return Number.MAX_SAFE_INTEGER;
  return before - after;
}

const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
const OPPOSITE: Readonly<Record<Dir, Dir>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function stepCell(c: Cell, d: Dir): Cell {
  return { x: c.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), y: c.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0) };
}

/**
 * A mid-step reverse right after leaving a Cell crosses back over it in the same Tick and
 * clears the turn buffer, so the turn the reverse was meant for is lost and the Player can
 * bounce between two Cells forever. Reverse only past the half-Cell mark: validateConfig keeps
 * per-Tick movement below half a Cell, so such a reverse never crosses a boundary that Tick.
 */
function steadyReverse(s: GameState, pressed: Dir | null): Dir | null {
  const p = s.player;
  if (pressed !== null && p.next !== null && p.progress > 0 && p.dir !== null && pressed === OPPOSITE[p.dir]) {
    return p.progress > CELL_UNITS / 2 ? pressed : null;
  }
  return pressed;
}

function passable(tiles: Uint8Array, s: GameState, c: Cell): boolean {
  const { width, height } = s.maze;
  return isPassable(tiles, width, height, s.maze.doors, s.derived.doorMask, c.x, c.y);
}

/**
 * Builds a deterministic policy. `bombRadius` is the configured blast radius, needed by
 * bombAggressive to evaluate a detonation exactly as the Simulation would.
 *
 * A policy instance keeps one piece of memory: the side target it committed to (a Bomb,
 * Ghost_Hunt item or Wisp). Without it the detour test flips as the Player moves and the
 * Player can oscillate forever. Use one instance per run.
 */
export function makePolicy(
  name: PolicyName,
  opts: { bombRadius: number; params?: PolicyParams; seed?: number },
): Policy {
  if (isHumanPolicy(name)) return makeHumanPolicy(name, opts);
  const params = opts.params ?? DEFAULT_POLICY_PARAMS;
  let commit: { maze: GameState['maze']; cell: Cell; kind: number } | null = null;

  const sideTarget = (s: GameState, me: Cell, goal: Cell[], kind: number, maxDetour: number): Cell[] => {
    const w = s.maze.width;
    if (commit && commit.maze === s.maze && commit.kind === kind && s.items.kinds[commit.cell.y * w + commit.cell.x] === kind) {
      const f = field(s, [commit.cell]);
      if (distAt(f, me) !== UNREACHABLE) return [commit.cell];
    }
    commit = null;
    const pick = withDetour(s, me, goal, itemCells(s, kind), maxDetour);
    if (pick !== goal && pick.length === 1) commit = { maze: s.maze, cell: pick[0]!, kind };
    return pick;
  };

  return (s: GameState): Input => {
    if (s.phase === 'levelEnd') return { ...IDLE, continue: true };
    if (s.phase !== 'playing') return IDLE;
    const me = decisionCell(s);
    const goal = primaryGoal(s, name);
    let targets = goal;
    let bomb = false;

    if (name === 'bombAggressive') {
      if (s.bombs > 0 && s.player.progress === 0 && bombSaving(s, goal, opts.bombRadius) >= params.bombMinSaving) {
        bomb = true;
      }
      if (s.bombs < 3) targets = sideTarget(s, me, goal, ItemKind.Bomb, params.bombMaxDetour);
    } else if (name === 'ghostHuntOpportunistic') {
      if (s.ghostHunt.ticksLeft === 0) {
        targets = sideTarget(s, me, goal, ItemKind.GhostHunt, params.ghostHuntMaxDetour);
      }
    } else if (name === 'wispSweep') {
      targets = sideTarget(s, me, goal, ItemKind.Wisp, params.wispMaxDetour);
    }

    const avoidKind = name === 'bombNone' ? ItemKind.Bomb : name === 'ghostHuntNone' ? ItemKind.GhostHunt : -1;
    const avoid = avoidKind >= 0 ? itemCells(s, avoidKind) : [];
    if (avoid.length === 0) {
      return { pressed: steadyReverse(s, nextStepDir(field(s, targets), s.maze, me.x, me.y)), bomb, continue: false };
    }

    // bombNone / ghostHuntNone: stepping on the item collects it, so treat those Cells as walls.
    const w = s.maze.width;
    const tiles = s.walls.tiles.slice();
    for (const c of avoid) tiles[c.y * w + c.x] = Tile.WallHard;
    const p = s.player;
    // Plan the avoiding route with every Door open: if the only current route crosses the item
    // because a Door is shut, the Player walks to that Door and holds there until it opens
    // (movement holds at a closed Door). Only an item unavoidable even then is walked over.
    const allOpen = ((1 << s.maze.doors.length) - 1) >>> 0;
    const safe = field(s, targets, tiles, allOpen);
    // Mid-step toward an avoided Cell (e.g. coasting after reaching a target): reverse now,
    // but only when the Cell being left has an avoiding route (otherwise the item is unavoidable).
    const entering = tiles[me.y * w + me.x] === Tile.WallHard && s.walls.tiles[me.y * w + me.x] !== Tile.WallHard;
    if (p.next !== null && p.progress > 0 && p.dir !== null && entering && distAt(safe, p.cell) !== UNREACHABLE) {
      return { pressed: OPPOSITE[p.dir], bomb, continue: false };
    }
    const d = distAt(safe, me);
    let pressed: Dir | null;
    if (d === UNREACHABLE) {
      // No route avoids the item: the item is unavoidable, take the plain route.
      pressed = nextStepDir(field(s, targets), s.maze, me.x, me.y);
    } else if (d === 0) {
      // On the target: avoid coasting into an avoided Cell by buffering a safe turn. Never
      // reverse mid-step here (that only re-approaches the target forever). If the Player
      // coasts on toward an avoided Cell, the mid-step "entering" rule above reverses it
      // before it arrives (items are collected only on arrival).
      const midStep = p.next !== null && p.progress > 0 && p.dir !== null;
      const order = p.dir ? [p.dir, ...DIRS.filter((x) => x !== p.dir)] : DIRS;
      pressed =
        order.find((x) => !(midStep && p.dir !== null && x === OPPOSITE[p.dir]) && passable(tiles, s, stepCell(me, x))) ?? null;
    } else {
      pressed = steadyReverse(s, nextStepDir(safe, s.maze, me.x, me.y));
    }
    return { pressed, bomb, continue: false };
  };
}
// ---------------------------------------------------------------------------------------------
// Imperfect, human-like players.
//
// The design policies above navigate perfectly, react instantly and never err, and in the
// contested race they win almost every level, so win-rate criteria saturate. These players add
// the three main human limits, deterministically from the run Seed (no Math.random, no clock):
//  - reaction delay: the dynamic world (Doors, walls, items, Squareman) is seen `reactionTicks` late;
//  - navigation mistakes: on entering a junction (3+ exits) they take a wrong turn with
//    probability `turnErrorRate` and follow it for that Cell;
//  - loose item use: Ghost_Hunt and Bombs are taken only on small detours (as
//    ghostHuntOpportunistic), Bombs are never detonated, and Squareman is not avoided.
// The skill levels are assumptions, not measured human data (about 200, 300 and 450 ms).
// ---------------------------------------------------------------------------------------------
export interface HumanProfile {
  reactionTicks: number;
  turnErrorRate: number;
}
export const HUMAN_POLICY_NAMES: readonly HumanPolicyName[] = ['humanSkilled', 'humanCasual', 'humanNovice'];
export const HUMAN_PROFILES: Readonly<Record<HumanPolicyName, HumanProfile>> = {
  humanSkilled: { reactionTicks: 12, turnErrorRate: 0.03 },
  humanCasual: { reactionTicks: 18, turnErrorRate: 0.08 },
  humanNovice: { reactionTicks: 27, turnErrorRate: 0.15 },
};
export function isHumanPolicy(name: string): name is HumanPolicyName {
  return name === 'humanSkilled' || name === 'humanCasual' || name === 'humanNovice';
}
function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
export function makeHumanPolicy(name: HumanPolicyName, opts: { bombRadius: number; params?: PolicyParams; seed?: number }): Policy {
  const prof = HUMAN_PROFILES[name];
  const base = makePolicy('ghostHuntOpportunistic', { bombRadius: opts.bombRadius, ...(opts.params ? { params: opts.params } : {}) });
  const salt = name === 'humanSkilled' ? 0x51ed : name === 'humanCasual' ? 0xca5a : 0x0b1e;
  const rand = xorshift(Math.imul((opts.seed ?? 1) | 0, 0x2c1b3c6d) ^ salt);
  const seen: GameState[] = [];
  let maze: GameState['maze'] | null = null;
  let lastCell = '';
  let mistake: Dir | null = null;
  return (s: GameState): Input => {
    if (s.phase !== 'playing') {
      seen.length = 0;
      return base(s);
    }
    if (s.maze !== maze) {
      maze = s.maze;
      seen.length = 0;
      lastCell = '';
      mistake = null;
    }
    seen.push(s);
    if (seen.length > prof.reactionTicks + 1) seen.shift();
    const observed = seen[0]!;
    const p = s.player;
    const key = `${p.cell.x},${p.cell.y}`;
    if (key !== lastCell) {
      lastCell = key;
      mistake = null;
      const exits = DIRS.filter((d) => passable(s.walls.tiles, s, stepCell(p.cell, d)));
      if (exits.length >= 3 && rand() < prof.turnErrorRate) {
        const wrong = exits.filter((d) => p.dir === null || d !== OPPOSITE[p.dir]);
        mistake = wrong[Math.floor(rand() * wrong.length)] ?? null;
      }
    }
    // Steering uses the current position (players press turns early; turns are buffered), but the
    // dynamic world is perceived late: Doors, walls, items, Squareman and Ghost Hunt as they were
    // reactionTicks ago. Planning wholly from the old position livelocks (overshoot, late reverse).
    const planned = base({ ...s, doors: observed.doors, derived: observed.derived, walls: observed.walls, items: observed.items, hunter: observed.hunter, ghostHunt: observed.ghostHunt });
    return { pressed: mistake ?? planned.pressed, bomb: false, continue: false };
  };
}
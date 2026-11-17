// Hunter AI (Squareman), part 1: mode selection and the COLLECT utility.
// Pure and deterministic: no DOM, no clock. Jitter comes from a private `hunter` PRNG stream
// carried in the HunterBrain, so the Maze streams are never disturbed (Requirement 8.8).
//
// Part 2 (task 14.2): default FLEE, CHASE and respawn behaviour. `strategies` can still override
// FLEE and CHASE; a strategy that returns null leaves the Hunter idle.

import { DEFAULT_CONFIG } from './config';
import type { GameConfig } from './config';
import type { GameEvent } from './events';
import { NEIGHBOR_DIRS, NEIGHBOR_DX, NEIGHBOR_DY, isPassable, wrapPartner } from './grid';
import { cellsToIndices, computeDistanceField, lookaheadDoorMask, nextStepDir, UNREACHABLE } from './pathfinding';
import type { DistanceField } from './pathfinding';
import { deriveSeed, nextFloat } from './prng';
import type { PrngState } from './prng';
import { ItemKind } from './types';
import type { Cell, Dir, GameState } from './types';

export type HunterMode = 'FLEE' | 'CHASE' | 'COLLECT';

/** Utility weights of the COLLECT mode (design: COLLECT Utility Scoring). */
export interface HunterWeights {
  kindOrdinary: number;
  kindSpeed: number;
  kindPower: number;
  cluster: number; // per pellet within clusterRadius
  clusterRadius: number;
  dist: number; // per path step
  contest: number;
  risk: number;
  denial: number;
  jitter: number;
  commit: number;
  riskRadius: number;
}

export const DEFAULT_HUNTER_WEIGHTS: HunterWeights = {
  kindOrdinary: 1.0,
  kindSpeed: 2.0,
  kindPower: 3.5,
  cluster: 0.08,
  clusterRadius: 3,
  dist: 0.12,
  contest: 0.5,
  risk: 1.0,
  denial: 1.5,
  jitter: 0.15,
  commit: 0.5,
  riskRadius: 5,
};

/** Persistent per-level Hunter memory. Immutable: every decision returns a new brain. */
export interface HunterBrain {
  readonly mode: HunterMode;
  /** Committed target Cell index, or -1. */
  readonly target: number;
  /** Private `hunter` stream state. */
  readonly rng: PrngState;
  /** Wall layer version and door mask the commitment was made under. */
  readonly wallsVersion: number;
  readonly doorMask: number;
}

export function createHunterBrain(runSeed: number, levelNumber: number, retryIndex = 0): HunterBrain {
  return {
    mode: 'COLLECT',
    target: -1,
    rng: deriveSeed(runSeed, levelNumber, 'hunter', retryIndex),
    wallsVersion: -1,
    doorMask: -1,
  };
}

/** Clears the committed route after `DoorChanged` or `WallsDestroyed` events. */
export function notifyHunterEvents(brain: HunterBrain, events: ReadonlyArray<GameEvent>): HunterBrain {
  for (const e of events) {
    if (e.t === 'DoorChanged' || e.t === 'WallsDestroyed') return { ...brain, target: -1 };
  }
  return brain;
}

/** Cells of every spawned, hunting Allied_Ghost. */
export function huntingAllyCells(state: GameState): Cell[] {
  const out: Cell[] = [];
  for (const a of state.ghostHunt.allies) {
    if (a.mode === 'hunting' && a.spawnIn === 0) out.push(a.cell);
  }
  return out;
}

/** Flee sources: the Player when it holds power, plus every hunting ally. */
export function fleeSources(state: GameState): Cell[] {
  const out: Cell[] = [];
  if (state.player.power > 0) out.push(state.player.cell);
  for (const c of huntingAllyCells(state)) out.push(c);
  return out;
}

function sizeOf(state: GameState): { w: number; h: number } {
  return { w: state.maze.width, h: state.maze.height };
}

function navMask(state: GameState, cfg: Pick<GameConfig, 'doorLookaheadTicks'>): number {
  return lookaheadDoorMask(state.derived.doorMask, state.doors, cfg.doorLookaheadTicks);
}

function fieldFrom(state: GameState, mask: number, cell: Cell): DistanceField {
  const { w } = sizeOf(state);
  return computeDistanceField(state.maze, state.walls.tiles, mask, state.walls.version, [cell.y * w + cell.x]);
}

/**
 * Mode selection, FLEE first (Requirements 8.5, 8.6, 29.6). `hunterToPlayer` is the path
 * distance (UNREACHABLE or negative when none); only needed for CHASE.
 */
export function selectHunterMode(
  state: GameState,
  hunterToPlayer: number,
  cfg: Pick<GameConfig, 'hunterChaseDistance'> = DEFAULT_CONFIG,
): HunterMode {
  if (state.player.power > 0 || huntingAllyCells(state).length > 0) return 'FLEE';
  if (
    state.hunter.power > 0 &&
    hunterToPlayer !== UNREACHABLE &&
    hunterToPlayer >= 0 &&
    hunterToPlayer <= cfg.hunterChaseDistance
  ) {
    return 'CHASE';
  }
  return 'COLLECT';
}

export interface StrategyContext {
  readonly state: GameState;
  readonly cfg: GameConfig;
  readonly doorMask: number;
  readonly hunterField: DistanceField;
}

export interface HunterStrategies {
  flee?: (ctx: StrategyContext) => Dir | null;
  chase?: (ctx: StrategyContext) => Dir | null;
}

export interface HunterDecision {
  /** Direction to press this Tick, or null when the Hunter has nothing to do. */
  readonly dir: Dir | null;
  /** Mode for the HUD and debug overlays. */
  readonly mode: HunterMode;
  /** Chosen COLLECT target Cell, or null. */
  readonly target: Cell | null;
  readonly brain: HunterBrain;
}

function isPellet(kind: number): boolean {
  return kind === ItemKind.Ordinary || kind === ItemKind.Power || kind === ItemKind.Speed;
}

function kindWeight(kind: number, w: HunterWeights): number {
  return kind === ItemKind.Power ? w.kindPower : kind === ItemKind.Speed ? w.kindSpeed : w.kindOrdinary;
}

function clusterCount(state: GameState, index: number, radius: number): number {
  const { w, h } = sizeOf(state);
  const kinds = state.items.kinds;
  const cx = index % w;
  const cy = (index - cx) / w;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if ((dx === 0 && dy === 0) || Math.abs(dx) + Math.abs(dy) > radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (isPellet(kinds[y * w + x]!)) n++;
    }
  }
  return n;
}

interface Step {
  dir: Dir;
  x: number;
  y: number;
}

/** Passable one-step moves from (x, y) under `mask`: up, right, down, left, then wrap partner. */
function passableSteps(state: GameState, mask: number, x: number, y: number): Step[] {
  const { width, height } = state.maze;
  const out: Step[] = [];
  for (let k = 0; k < 4; k++) {
    const nx = x + NEIGHBOR_DX[k]!;
    const ny = y + NEIGHBOR_DY[k]!;
    if (isPassable(state.walls.tiles, width, height, state.maze.doors, mask, nx, ny)) {
      out.push({ dir: NEIGHBOR_DIRS[k]!, x: nx, y: ny });
    }
  }
  if (state.maze.wrapPairs.length > 0) {
    const p = wrapPartner(state.maze.wrapPairs, x, y);
    if (p !== null && isPassable(state.walls.tiles, width, height, state.maze.doors, mask, p.x, p.y)) {
      const dir: Dir | null =
        x === 0 && p.x > 0 ? 'left' : x === width - 1 && p.x < width - 1 ? 'right'
        : y === 0 && p.y > 0 ? 'up' : y === height - 1 && p.y < height - 1 ? 'down' : null;
      if (dir !== null && !out.some((s) => s.dir === dir)) out.push({ dir, x: p.x, y: p.y });
    }
  }
  return out;
}

/** True when a Door at (x, y) is open now but is scheduled to change soon (escape risk). */
function doorRisk(state: GameState, x: number, y: number, horizon: number): boolean {
  const doors = state.maze.doors;
  for (let i = 0; i < doors.length; i++) {
    const c = doors[i]!.cell;
    if (c.x !== x || c.y !== y) continue;
    const st = state.doors[i];
    return st !== undefined && st.open && st.nextChangeIn <= horizon;
  }
  return false;
}

/**
 * Default FLEE. Opportunistic Power_Pellet first (only while fleeing the empowered Player and
 * only when the Hunter is strictly closer to it than the Player: it cancels the Player's power).
 * Otherwise steps to the neighbour maximising the multi-source distance from every flee source;
 * ties favour cells with two or more onward exits, dead ends and closing Doors are penalised,
 * and the fixed neighbour order is the final tie-break.
 */
export function defaultFlee(ctx: StrategyContext): Dir | null {
  const { state, cfg, doorMask, hunterField } = ctx;
  const { w } = sizeOf(state);
  const hc = state.hunter.cell;

  if (state.player.power > 0) {
    const pf = fieldFrom(state, doorMask, state.player.cell).dist;
    const kinds = state.items.kinds;
    let bestPellet = -1;
    let bestD = Infinity;
    for (let i = 0; i < kinds.length; i++) {
      if (kinds[i] !== ItemKind.Power) continue;
      const hd = hunterField.dist[i]!;
      if (hd === UNREACHABLE || hd === 0) continue;
      const pd = pf[i]!;
      if (pd !== UNREACHABLE && pd <= hd) continue;
      if (hd < bestD) {
        bestD = hd;
        bestPellet = i;
      }
    }
    if (bestPellet >= 0) {
      const tf = computeDistanceField(state.maze, state.walls.tiles, doorMask, state.walls.version, [bestPellet]);
      const dir = nextStepDir(tf, state.maze, hc.x, hc.y);
      if (dir !== null) return dir;
    }
  }

  const sources = fleeSources(state);
  if (sources.length === 0) return null;
  const sf = computeDistanceField(state.maze, state.walls.tiles, doorMask, state.walls.version, cellsToIndices(w, sources)).dist;
  const far = state.maze.width * state.maze.height;
  const horizon = cfg.doorLookaheadTicks * 2;

  let best: Dir | null = null;
  let bestScore = -Infinity;
  for (const s of passableSteps(state, doorMask, hc.x, hc.y)) {
    const d = sf[s.y * w + s.x]!;
    let score = d === UNREACHABLE ? far : d;
    const exits = passableSteps(state, doorMask, s.x, s.y).filter((e) => e.x !== hc.x || e.y !== hc.y).length;
    if (exits >= 2) score += 0.5;
    else if (exits === 0) score -= 3;
    if (doorRisk(state, s.x, s.y, horizon)) score -= 2;
    if (score > bestScore) {
      bestScore = score;
      best = s.dir;
    }
  }
  return best;
}

/** Predicted Player Cell: follows the buffered turn or heading a few Cells ahead. */
function predictPlayerCell(state: GameState, mask: number, cfg: GameConfig): Cell {
  const p = state.player;
  const lead = Math.max(0, Math.min(3, Math.floor(cfg.allyLeadTicks / 4)));
  let cell = p.cell;
  let dir: Dir | null = p.buffered ?? p.dir;
  for (let i = 0; i < lead && dir !== null; i++) {
    const step = passableSteps(state, mask, cell.x, cell.y).find((s) => s.dir === dir);
    if (step === undefined) {
      if (dir === p.dir) break;
      dir = p.dir;
      continue;
    }
    cell = { x: step.x, y: step.y };
    dir = p.dir ?? dir;
  }
  return cell;
}

/** Default CHASE: path toward the predicted Player Cell, falling back to the Player's Cell. */
export function defaultChase(ctx: StrategyContext): Dir | null {
  const { state, cfg, doorMask } = ctx;
  const { w } = sizeOf(state);
  const hc = state.hunter.cell;
  const predicted = predictPlayerCell(state, doorMask, cfg);
  const targets = [predicted, state.player.cell];
  for (const t of targets) {
    if (t.x === hc.x && t.y === hc.y) continue;
    const tf = computeDistanceField(state.maze, state.walls.tiles, doorMask, state.walls.version, [t.y * w + t.x]);
    const dir = nextStepDir(tf, state.maze, hc.x, hc.y);
    if (dir !== null) return dir;
  }
  return null;
}

/** Hunter decision for this Tick. Pure: same inputs always give the same output. */
export function decideHunter(
  state: GameState,
  brain: HunterBrain,
  cfg: GameConfig = DEFAULT_CONFIG,
  strategies: HunterStrategies = {},
  weights: HunterWeights = DEFAULT_HUNTER_WEIGHTS,
): HunterDecision {
  const { w } = sizeOf(state);
  const mask = navMask(state, cfg);
  if (state.hunter.respawnIn > 0) {
    // Respawning: inactive, no movement and no decision state change (design: Respawn).
    return { dir: null, mode: brain.mode, target: null, brain };
  }
  const hunterCell = state.hunter.cell;
  const hField = fieldFrom(state, mask, hunterCell);
  const hDist = hField.dist;
  const playerIdx = state.player.cell.y * w + state.player.cell.x;
  const mode = selectHunterMode(state, hDist[playerIdx]!, cfg);

  // Commitment is dropped whenever the route may have changed (Door or wall change).
  const routeValid = brain.wallsVersion === state.walls.version && brain.doorMask === mask;
  const committed = routeValid ? brain.target : -1;
  const baseBrain: HunterBrain = { ...brain, mode, wallsVersion: state.walls.version, doorMask: mask };

  if (mode !== 'COLLECT') {
    const ctx: StrategyContext = { state, cfg, doorMask: mask, hunterField: hField };
    const strat = mode === 'FLEE' ? (strategies.flee ?? defaultFlee) : (strategies.chase ?? defaultChase);
    const dir = strat(ctx);
    return { dir, mode, target: null, brain: { ...baseBrain, target: -1 } };
  }

  // COLLECT: gather candidate pellets (never Keys, Bombs, Wisps or Ghost Hunt).
  const kinds = state.items.kinds;
  const pDist = fieldFrom(state, mask, state.player.cell).dist;
  const hSpeed = state.hunter.speed > 0;
  const wDist = hSpeed ? weights.dist * 0.7 : weights.dist;
  const wCluster = hSpeed ? weights.cluster * 1.5 : weights.cluster;
  const wRisk = state.player.speed > 0 ? weights.risk * 1.5 : weights.risk;

  // Power_Pellets the Player could take soon (risk and denial awareness).
  const playerNearPower: number[] = [];
  const deniedPower: number[] = [];
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== ItemKind.Power) continue;
    const pd = pDist[i]!;
    if (pd === UNREACHABLE) continue;
    if (pd <= weights.riskRadius) playerNearPower.push(i);
    if (pd <= 2 && (hDist[i] === UNREACHABLE || hDist[i]! > pd)) deniedPower.push(i);
  }
  const playerThreatensPower = state.player.power === 0 && playerNearPower.length > 0;

  let rng = brain.rng;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i]!;
    if (!isPellet(kind)) continue;
    const hd = hDist[i]!;
    if (hd === UNREACHABLE || hd === 0) continue;
    const pd = pDist[i]!;

    let u = kindWeight(kind, weights);
    u += wCluster * clusterCount(state, i, weights.clusterRadius);
    u -= wDist * hd;

    const diff = pd === UNREACHABLE ? 6 : Math.max(-6, Math.min(6, pd - hd));
    let contest = diff / 6;
    if (kind === ItemKind.Power && diff < 0) contest -= 0.5;
    u += weights.contest * contest;

    if (playerThreatensPower && pd !== UNREACHABLE && pd < hd) u -= wRisk;
    if (deniedPower.length > 0 && kind !== ItemKind.Power && pd !== UNREACHABLE && pd <= 3) u -= weights.denial;

    if (i === committed) u += weights.commit;

    const [noise, next] = nextFloat(rng);
    rng = next;
    u += weights.jitter * noise;

    if (u > bestScore) {
      bestScore = u;
      best = i; // strict '>' keeps the lowest index on ties
    }
  }

  const outBrain: HunterBrain = { ...baseBrain, target: best, rng };
  if (best < 0) return { dir: null, mode, target: null, brain: outBrain };

  const tField = computeDistanceField(state.maze, state.walls.tiles, mask, state.walls.version, [best]);
  const dir = nextStepDir(tField, state.maze, hunterCell.x, hunterCell.y);
  const target: Cell = { x: best % w, y: (best - (best % w)) / w };
  return { dir, mode, target, brain: outBrain };
}
